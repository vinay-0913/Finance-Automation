"""
process_data.py — Payment Gateway Cost & Settlement Analysis
Supports:
  1. Multiple split files (Payment Metadata + Settlement Ledger + Refunds) -> automatically builds Master Enriched Table.
  2. Single consolidated file (Stripe/Gateway B style) -> processed directly without requiring other files.
  3. Full dual-gateway comparative analytics when both are provided.
  4. Multi-month scoping and reporting ("Months" filter).
  5. Interactive/custom join key mapping support.
"""

import argparse
import pandas as pd
import numpy as np
import json
import os
import re
from datetime import datetime

_DEFAULT_DIR = os.path.dirname(os.path.abspath(__file__))

parser = argparse.ArgumentParser(description="Process payment gateway Excel/CSV files into dashboard_data.json")
parser.add_argument("--files",            nargs="*", default=None, help="List of uploaded files to auto-detect and process")
parser.add_argument("--gwa-payments",     default=None, help="Path to GatewayA payments Excel file")
parser.add_argument("--gwa-transactions", default=None, help="Path to GatewayA transactions Excel file")
parser.add_argument("--gwa-refunds",      default=None, help="Path to GatewayA refunds Excel file")
parser.add_argument("--gwb",              default=None, help="Path to GatewayB Excel file")
parser.add_argument("--gwb-sheet",        default=None, help="GatewayB sheet name (auto-detected if omitted)")
parser.add_argument("--join-keys",        default=None, help="JSON string of custom join keys, e.g. '{\"payment_key\": \"id\", \"settlement_key\": \"entity_id\"}'")
parser.add_argument("--months",           default=None, help="Target month filter, e.g. 'Sep 2026' or 'all'")
parser.add_argument("--gateway-config",   default=None, help="JSON string or file path containing per-gateway file groups and mapping")
parser.add_argument("--out-dir",          default=_DEFAULT_DIR, help="Output directory for dashboard_data.json and ai_narratives.json")
args = parser.parse_args()

OUT_DIR = args.out_dir
os.makedirs(OUT_DIR, exist_ok=True)

# Parse join keys if provided
custom_join_keys = {}
if args.join_keys:
    try:
        custom_join_keys = json.loads(args.join_keys) if isinstance(args.join_keys, str) else args.join_keys
    except Exception as e:
        print(f"[Warning] Could not parse join_keys JSON: {e}")

# Contracted Rates for overcharge audits
RATES = {
    'upi':           0.0,
    'domestic_card': 1.85,
    'emi':           2.0,
    'intl_card':     2.85,
}

# ──────────────────────────────────────────────────────────────
# Helper Functions
# ──────────────────────────────────────────────────────────────
def eff_rate(charges, volume):
    """Safe effective rate %"""
    return round(float(charges) / float(volume) * 100, 2) if volume and float(volume) > 0 else 0.0

def summarize(vol, charges, count):
    return {'volume': round(float(vol), 2), 'charges': round(float(charges), 2),
            'count': int(count), 'rate': eff_rate(charges, vol)}

def to_numeric_cols(df, cols):
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0.0)

def to_int_cols(df, cols):
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0).astype(int)

def extract_cols(df, named_mapping, index_fallback):
    """
    Extracts columns matching named keywords first, then falls back to column index positions.
    named_mapping: dict of target_name -> list of candidate column names (lowercase)
    index_fallback: dict of index -> target_name
    """
    res = {}
    actual_cols_lower = {str(c).lower().strip(): c for c in df.columns}
    
    for target, candidates in named_mapping.items():
        found = False
        for cand in candidates:
            cand_lower = cand.lower().strip()
            if cand_lower in actual_cols_lower:
                res[target] = df[actual_cols_lower[cand_lower]]
                found = True
                break
        if not found:
            res[target] = None
            
    num_cols = df.shape[1]
    for idx, target in index_fallback.items():
        if res.get(target) is None and idx < num_cols:
            res[target] = df.iloc[:, idx]
            
    for target in named_mapping.keys():
        if res.get(target) is None:
            res[target] = pd.Series([np.nan] * len(df))
            
    return pd.DataFrame(res)

# ──────────────────────────────────────────────────────────────
# File Auto-Classification
# ──────────────────────────────────────────────────────────────
def inspect_file(filepath):
    """Returns detected role and metadata for an Excel/CSV file."""
    if not os.path.exists(filepath):
        return None
    try:
        xl = pd.ExcelFile(filepath, engine='openpyxl')
        sheet = xl.sheet_names[0]
        for s in xl.sheet_names:
            if any(w in s.lower() for w in ['gateway', 'charge', 'txn', 'transaction', 'settlement', 'payment', 'sheet1']):
                sheet = s
                break
        df0 = pd.read_excel(filepath, sheet_name=sheet, header=0, nrows=10, engine='openpyxl')
        df1 = pd.read_excel(filepath, sheet_name=sheet, header=1, nrows=10, engine='openpyxl')
        cols0 = [str(c).lower().strip() for c in df0.columns if not str(c).startswith('Unnamed')]
        cols1 = [str(c).lower().strip() for c in df1.columns if not str(c).startswith('Unnamed')]
        
        if len(cols1) > len(cols0):
            header = 1
            cols = cols1
            df_sample = df1
        else:
            header = 0
            cols = cols0
            df_sample = df0
            
        cols_set = set(cols)
        fn_lower = os.path.basename(filepath).lower()

        # 1. Filename keyword priority
        if 'payment' in fn_lower:
            return {'role': 'payment_metadata', 'sheet': sheet, 'header': header, 'cols': cols, 'path': filepath}
        elif 'refund' in fn_lower:
            return {'role': 'refunds_ledger', 'sheet': sheet, 'header': header, 'cols': cols, 'path': filepath}
        elif 'transaction' in fn_lower or 'settle' in fn_lower:
            return {'role': 'settlement_ledger', 'sheet': sheet, 'header': header, 'cols': cols, 'path': filepath}
        elif 'gatewayb' in fn_lower or any(k in cols_set for k in ['balance_transaction_id', 'reporting_category']):
            return {'role': 'consolidated_ledger', 'sheet': sheet, 'header': header, 'cols': cols, 'path': filepath}
        # 2. Schema-based fallback for arbitrary filenames
        elif any(k in cols_set for k in ['balance_transaction_id', 'reporting_category', 'gross']):
            return {'role': 'consolidated_ledger', 'sheet': sheet, 'header': header, 'cols': cols, 'path': filepath}
        elif any(k in cols_set for k in ['settled_at', 'tax_inr', 'settlement_id', 'amount_inr']):
            return {'role': 'settlement_ledger', 'sheet': sheet, 'header': header, 'cols': cols, 'path': filepath}
        elif any(k in cols_set for k in ['refund_id']):
            return {'role': 'refunds_ledger', 'sheet': sheet, 'header': header, 'cols': cols, 'path': filepath}
        elif any(k in cols_set for k in ['fx_amount', 'status', 'international']):
            return {'role': 'payment_metadata', 'sheet': sheet, 'header': header, 'cols': cols, 'path': filepath}
        else:
            return {'role': 'unknown', 'sheet': sheet, 'header': header, 'cols': cols, 'path': filepath}
    except Exception as e:
        print(f"[Notice] Could not inspect {filepath}: {e}")
        return None

# Resolve files
file_gwa_pay = args.gwa_payments
file_gwa_txn = args.gwa_transactions
file_gwa_ref = args.gwa_refunds
file_gwb     = args.gwb
extra_gateways = {}
gw_names_order = []

# If gateway_config provided, assign files directly according to user configuration
if args.gateway_config:
    try:
        if os.path.exists(args.gateway_config):
            with open(args.gateway_config, 'r', encoding='utf-8') as f:
                gw_cfg = json.load(f)
        else:
            gw_cfg = json.loads(args.gateway_config)
            
        gw_list = gw_cfg.get("gateways", []) if isinstance(gw_cfg, dict) else (gw_cfg if isinstance(gw_cfg, list) else [])
        for idx, gw in enumerate(gw_list):
            name = gw.get("name") or f"Gateway {chr(65+idx)}"
            gw_names_order.append(name)
            files = gw.get("files", [])
            mapping = gw.get("mapping")

            g_pay = g_txn = g_ref = g_cons = None
            for fp in files:
                inf = inspect_file(fp)
                if not inf: continue
                r = inf['role']
                if r == 'payment_metadata': g_pay = fp
                elif r == 'settlement_ledger': g_txn = fp
                elif r == 'refunds_ledger': g_ref = fp
                elif r == 'consolidated_ledger': g_cons = fp
                else:
                    if not g_txn: g_txn = fp
                    elif not g_pay: g_pay = fp
                    elif not g_cons: g_cons = fp

            # If this is the 1st gateway or labeled Gateway A
            if idx == 0 or 'gateway a' in name.lower():
                if g_cons and not g_txn and not g_pay:
                    file_gwb = g_cons
                else:
                    if g_pay: file_gwa_pay = g_pay
                    if g_txn: file_gwa_txn = g_txn
                    if g_ref: file_gwa_ref = g_ref
                    if mapping: custom_join_keys = mapping
            elif idx == 1 or 'gateway b' in name.lower():
                if g_cons:
                    file_gwb = g_cons
                elif g_txn or g_pay:
                    if not file_gwa_txn and not file_gwa_pay:
                        file_gwa_pay = g_pay
                        file_gwa_txn = g_txn
                        file_gwa_ref = g_ref
                        if mapping: custom_join_keys = mapping
                    else:
                        file_gwb = g_cons or g_txn or g_pay
            else:
                extra_gateways[name] = {
                    'files': files,
                    'pay': g_pay,
                    'txn': g_txn,
                    'ref': g_ref,
                    'cons': g_cons,
                    'mapping': mapping
                }
    except Exception as e:
        print(f"[Warning] Error parsing gateway_config: {e}")

elif args.files and len(args.files) > 0:
    for f in args.files:
        info = inspect_file(f)
        if not info:
            continue
        role = info['role']
        if role == 'consolidated_ledger' and not file_gwb:
            file_gwb = f
        elif role == 'settlement_ledger' and not file_gwa_txn:
            file_gwa_txn = f
        elif role == 'payment_metadata' and not file_gwa_pay:
            file_gwa_pay = f
        elif role == 'refunds_ledger' and not file_gwa_ref:
            file_gwa_ref = f
        else:
            if not file_gwa_txn:
                file_gwa_txn = f
            elif not file_gwa_pay:
                file_gwa_pay = f
            elif not file_gwb:
                file_gwb = f

# If none given via args, fall back to default dummy files in workspace if present
DATA_DIR = _DEFAULT_DIR
if not file_gwa_pay and not file_gwa_txn and not file_gwb:
    file_gwa_pay = os.path.join(DATA_DIR, "GatewayA_payments_Sep26_dummy.xlsx")
    file_gwa_txn = os.path.join(DATA_DIR, "GatewayA_transactions_Sep26_dummy.xlsx")
    file_gwa_ref = os.path.join(DATA_DIR, "GatewayA_refunds_Sep26_dummy.xlsx")
    file_gwb     = os.path.join(DATA_DIR, "GatewayB_Sep26_dummy.xlsx")

has_gwa_txn = bool(file_gwa_txn and os.path.exists(file_gwa_txn))
has_gwa_pay = bool(file_gwa_pay and os.path.exists(file_gwa_pay))
has_gwa_ref = bool(file_gwa_ref and os.path.exists(file_gwa_ref))
has_gwb     = bool(file_gwb and os.path.exists(file_gwb))
has_gwa     = has_gwa_txn or has_gwa_pay

print("=== PayAnalytics Intelligent Data Processor ===")
print(f"Gateway A Payments:     {file_gwa_pay} (exists: {has_gwa_pay})")
print(f"Gateway A Transactions: {file_gwa_txn} (exists: {has_gwa_txn})")
print(f"Gateway A Refunds:      {file_gwa_ref} (exists: {has_gwa_ref})")
print(f"Gateway B Consolidated: {file_gwb} (exists: {has_gwb})")
print(f"Join Keys:              {custom_join_keys or 'Auto-Detect'}")
print(f"Month Scope:            {args.months or 'All Dates'}")
print(f"Output Directory:       {OUT_DIR}\n")

if not has_gwa and not has_gwb:
    raise FileNotFoundError("No valid payment or settlement files were found to process.")

# ══════════════════════════════════════════════════════════════
# Step 1: Read Gateway A Data & Build Master Enriched Table
# ══════════════════════════════════════════════════════════════
master_info = {}
all_dates = []

if has_gwa:
    # 1. Transactions file (authoritative ledger)
    if has_gwa_txn:
        print("Reading Gateway A Transactions (settlement ledger)...")
        # auto-detect header row
        _h = 0
        try:
            _peek = pd.read_excel(file_gwa_txn, sheet_name=0, nrows=5, engine='openpyxl')
            if any(str(c).startswith('Unnamed') for c in _peek.columns[:3]):
                _h = 1
        except Exception:
            _h = 0
        _raw_txn = pd.read_excel(file_gwa_txn, sheet_name=0, header=_h, engine='openpyxl')
        df_txn = extract_cols(_raw_txn, {
            'entity_id': ['entity_id', 'payment_id', 'id', 'transaction_id', 'txn_id', 'source_id', 'order_id'],
            'type': ['type', 'transaction_type', 'record_type'],
            'debit': ['debit', 'dr'],
            'credit': ['credit', 'cr'],
            'amount_inr': ['amount_inr', 'amount', 'inr_amount', 'net_amount'],
            'currency': ['currency', 'curr'],
            'fee_inr': ['fee_inr', 'fee', 'mdr_inr', 'fees'],
            'tax_inr': ['tax_inr', 'tax', 'gst_inr', 'gst'],
            'on_hold': ['on_hold', 'hold'],
            'settled': ['settled', 'is_settled'],
            'created_at': ['created_at', 'created', 'date', 'txn_date'],
            'settled_at': ['settled_at', 'settled_date', 'payout_date'],
            'settlement_id': ['settlement_id', 'payout_id'],
            'method': ['method', 'payment_method', 'mode'],
            'card_network': ['card_network', 'network', 'card_brand', 'brand'],
            'card_type': ['card_type', 'type_card', 'funding']
        }, {
            0:'entity_id', 1:'type', 2:'debit', 3:'credit', 4:'amount_inr',
            5:'currency', 6:'fee_inr', 7:'tax_inr', 8:'on_hold', 9:'settled',
            10:'created_at', 11:'settled_at', 12:'settlement_id',
            20:'method', 22:'card_network', 24:'card_type'
        })
        df_txn = df_txn.dropna(subset=['entity_id'])
        to_numeric_cols(df_txn, ['debit', 'credit', 'amount_inr', 'fee_inr', 'tax_inr'])
        to_int_cols(df_txn, ['on_hold', 'settled'])
        df_txn['created_at'] = pd.to_datetime(df_txn['created_at'], dayfirst=True, errors='coerce')
        df_txn['settled_at'] = pd.to_datetime(df_txn['settled_at'], dayfirst=True, errors='coerce')
        all_dates.extend(df_txn['created_at'].dropna().tolist())
    else:
        df_txn = pd.DataFrame()

    # 2. Payments metadata file
    if has_gwa_pay:
        print("Reading Gateway A Payments (metadata)...")
        _h = 1
        try:
            _peek = pd.read_excel(file_gwa_pay, sheet_name=0, nrows=5, engine='openpyxl')
            if not any(str(c).startswith('Unnamed') for c in _peek.columns[:3]):
                _h = 0
        except Exception:
            _h = 1
        _raw_pay = pd.read_excel(file_gwa_pay, sheet_name=0, header=_h, engine='openpyxl')
        df_pay = extract_cols(_raw_pay, {
            'id': ['id', 'payment_id', 'entity_id', 'order_id', 'reference_id'],
            'fx_amount': ['fx_amount', 'amount', 'original_amount', 'gross'],
            'currency': ['currency', 'curr'],
            'status': ['status', 'payment_status', 'state'],
            'international': ['international', 'is_international', 'intl'],
            'method': ['method', 'payment_method'],
            'amount_refunded': ['amount_refunded', 'refunded'],
            'fee_inr': ['fee_inr', 'fee'],
            'tax_inr': ['tax_inr', 'tax'],
            'created_at': ['created_at', 'created', 'date'],
            'card_type': ['card_type', 'type'],
            'card_network': ['card_network', 'network', 'card_brand']
        }, {
            0:'id', 1:'fx_amount', 2:'currency', 3:'status', 6:'international',
            7:'method', 8:'amount_refunded', 21:'fee_inr', 22:'tax_inr',
            25:'created_at', 26:'card_type', 27:'card_network'
        })
        df_pay = df_pay.dropna(subset=['id'])
        to_numeric_cols(df_pay, ['fx_amount', 'fee_inr', 'tax_inr'])
        to_int_cols(df_pay, ['international'])
        df_pay['method']     = df_pay['method'].fillna('unknown')
        df_pay['created_at'] = pd.to_datetime(df_pay['created_at'], errors='coerce')
    else:
        df_pay = pd.DataFrame()

    # 3. Refunds file
    if has_gwa_ref:
        print("Reading Gateway A Refunds...")
        _raw_ref = pd.read_excel(file_gwa_ref, sheet_name=0, header=1, engine='openpyxl')
        df_refund = extract_cols(_raw_ref, {
            'id': ['id', 'refund_id'],
            'amount': ['amount', 'refund_amount'],
            'currency': ['currency'],
            'payment_id': ['payment_id', 'id', 'entity_id'],
            'created_at': ['created_at', 'created'],
            'status': ['status']
        }, {0:'id', 1:'amount', 2:'currency', 3:'payment_id', 6:'created_at', 10:'status'})
        df_refund = df_refund.dropna(subset=['id'])
        to_numeric_cols(df_refund, ['amount'])
        df_refund['created_at'] = pd.to_datetime(df_refund['created_at'], errors='coerce')
    else:
        df_refund = pd.DataFrame(columns=['id', 'amount', 'currency', 'payment_id', 'created_at', 'status'])

    # 4. Master Enriched Table Join
    print("Constructing Master Enriched Table...")
    if len(df_txn) > 0 and len(df_pay) > 0:
        pay_join_key = custom_join_keys.get('payment_key', 'id')
        txn_join_key = custom_join_keys.get('settlement_key', 'entity_id')

        # Fallback if keys don't exist
        if pay_join_key not in df_pay.columns:
            pay_join_key = 'id'
        txn_cols_to_keep = [c for c in ['type', 'amount_inr', 'fee_inr', 'tax_inr', 'created_at', 'settled_at', 'settled'] if c in df_txn.columns]
        df_pay_txns = df_txn[df_txn['type'] == 'payment'].copy()
        df_pay_txns['__join_key'] = df_pay_txns[txn_join_key]
        df_pay_txns['txn_method'] = df_pay_txns['method'] if 'method' in df_pay_txns.columns else np.nan
        df_pay_txns['txn_card_network'] = df_pay_txns['card_network'] if 'card_network' in df_pay_txns.columns else np.nan
        df_pay_txns['txn_card_type'] = df_pay_txns['card_type'] if 'card_type' in df_pay_txns.columns else np.nan
        df_pay_txns = df_pay_txns[['__join_key', 'amount_inr', 'fee_inr', 'tax_inr', 'created_at', 'settled_at', 'settled', 'txn_method', 'txn_card_network', 'txn_card_type']]

        df_pay_meta = df_pay.copy()
        df_pay_meta['__join_key'] = df_pay_meta[pay_join_key]
        df_pay_meta['pay_method'] = df_pay_meta['method'] if 'method' in df_pay_meta.columns else np.nan
        df_pay_meta['pay_card_network'] = df_pay_meta['card_network'] if 'card_network' in df_pay_meta.columns else np.nan
        df_pay_meta['pay_card_type'] = df_pay_meta['card_type'] if 'card_type' in df_pay_meta.columns else np.nan
        meta_cols = ['__join_key', 'pay_method', 'pay_card_network', 'pay_card_type']
        for mc in ['fx_amount', 'currency', 'status', 'international']:
            if mc in df_pay_meta.columns:
                meta_cols.append(mc)
        df_pay_meta = df_pay_meta[meta_cols]

        df_e = df_pay_txns.merge(df_pay_meta, on='__join_key', how='left')
        df_e.rename(columns={'__join_key': 'entity_id'}, inplace=True)
        
        # Coalesce
        df_e['method']        = df_e['pay_method'].fillna(df_e['txn_method']).fillna('card')
        df_e['card_network']  = df_e['pay_card_network'].fillna(df_e['txn_card_network']).fillna('Other')
        df_e['card_type']     = df_e['pay_card_type'].fillna(df_e['txn_card_type'])
        df_e['currency']      = df_e['currency'].fillna('INR') if 'currency' in df_e.columns else 'INR'
        df_e['international'] = df_e['international'].fillna(0).astype(int) if 'international' in df_e.columns else 0
        df_e['fx_amount']     = df_e['fx_amount'].fillna(0.0) if 'fx_amount' in df_e.columns else 0.0
        df_e['status']        = df_e['status'].fillna('captured') if 'status' in df_e.columns else 'captured'
        df_e['total_charges'] = df_e['fee_inr'] + df_e['tax_inr']
        df_e['settle_days']   = (df_e['settled_at'] - df_e['created_at']).dt.days

        master_info = {
            'status': 'auto_linked',
            'payment_key': pay_join_key,
            'settlement_key': txn_join_key,
            'total_rows': len(df_e),
            'matched_metadata_rows': int(df_e['status'].notna().sum()),
        }
    elif len(df_txn) > 0:
        # Only settlement ledger provided
        df_e = df_txn[df_txn['type'] == 'payment'].copy()
        df_e['total_charges'] = df_e['fee_inr'] + df_e['tax_inr']
        df_e['settle_days']   = (df_e['settled_at'] - df_e['created_at']).dt.days
        df_e['status']        = 'captured'
        df_e['fx_amount']     = 0.0
        df_e['international'] = 0
        df_pay = df_e[['entity_id', 'status']].rename(columns={'entity_id': 'id'})
        master_info = {'status': 'settlement_standalone', 'total_rows': len(df_e)}
    else:
        # Only payment metadata provided
        df_e = df_pay.copy().rename(columns={'id': 'entity_id', 'fx_amount': 'amount_inr'})
        df_e['total_charges'] = df_e['fee_inr'] + df_e['tax_inr']
        df_e['settle_days']   = 0
        df_txn = pd.DataFrame()
        master_info = {'status': 'payments_standalone', 'total_rows': len(df_e)}

    print(f"  Master Enriched Table created: {len(df_e)} records")
else:
    df_e = pd.DataFrame()
    df_pay = pd.DataFrame()
    df_txn = pd.DataFrame()
    df_refund = pd.DataFrame(columns=['id', 'amount', 'currency', 'payment_id', 'created_at', 'status'])
    master_info = {'status': 'none'}

# ══════════════════════════════════════════════════════════════
# Step 2: Read Gateway B (Consolidated Ledger)
# ══════════════════════════════════════════════════════════════
if has_gwb:
    print("Reading Gateway B Consolidated Ledger...")
    _gwb_xl = pd.ExcelFile(file_gwb, engine='openpyxl')
    if args.gwb_sheet and args.gwb_sheet in _gwb_xl.sheet_names:
        _gwb_sheet = args.gwb_sheet
    else:
        _pref = [s for s in _gwb_xl.sheet_names if 'gateway' in s.lower()]
        _gwb_sheet = _pref[0] if _pref else _gwb_xl.sheet_names[0]
        
    _raw_b = pd.read_excel(file_gwb, sheet_name=_gwb_sheet, header=1, engine='openpyxl')
    df_gwb = extract_cols(_raw_b, {
        'balance_transaction_id': ['balance_transaction_id', 'id', 'txn_id'],
        'created': ['created', 'created_utc', 'date'],
        'available_on': ['available_on', 'available_on_utc', 'settled_date'],
        'currency': ['currency'],
        'gross': ['gross', 'amount'],
        'fee': ['fee', 'fees'],
        'net': ['net'],
        'reporting_category': ['reporting_category', 'type', 'category'],
        'source_id': ['source_id', 'charge_id'],
        'cf_amount': ['cf_amount', 'customer_amount'],
        'cf_currency': ['cf_currency', 'customer_currency'],
        'country': ['country'],
        'payout_id': ['payout_id'],
        'payout_effective_at': ['payout_effective_at'],
        'payment_method': ['payment_method', 'method'],
        'card_brand': ['card_brand', 'brand', 'card_network'],
        'card_funding': ['card_funding', 'funding'],
        'card_country': ['card_country']
    }, {
        0:'balance_transaction_id', 2:'created', 4:'available_on', 5:'currency',
        6:'gross', 7:'fee', 8:'net', 9:'reporting_category', 10:'source_id',
        12:'cf_amount', 13:'cf_currency', 16:'country', 20:'payout_id',
        22:'payout_effective_at', 60:'payment_method', 62:'card_brand',
        64:'card_funding', 65:'card_country'
    })
    df_gwb = df_gwb.dropna(subset=['balance_transaction_id'])
    to_numeric_cols(df_gwb, ['gross', 'fee', 'net', 'cf_amount'])
    df_gwb['cf_currency']  = df_gwb['cf_currency'].fillna('').str.upper()
    df_gwb['created']      = pd.to_datetime(df_gwb['created'], errors='coerce')
    df_gwb['available_on'] = pd.to_datetime(df_gwb['available_on'], errors='coerce')
    all_dates.extend(df_gwb['created'].dropna().tolist())

    gwb_charges  = df_gwb[df_gwb['reporting_category'] == 'charge'].copy()
    gwb_refunds  = df_gwb[df_gwb['reporting_category'] == 'refund'].copy()
    gwb_fees     = df_gwb[df_gwb['reporting_category'] == 'fee'].copy()
    gwb_disputes = df_gwb[df_gwb['reporting_category'] == 'dispute'].copy()
    gwb_tds      = df_gwb[df_gwb['reporting_category'] == 'tax'].copy()
    print(f"  Gateway B loaded: {len(df_gwb)} records ({len(gwb_charges)} charges)")
else:
    df_gwb = pd.DataFrame()
    gwb_charges = pd.DataFrame(columns=['gross', 'fee', 'net', 'country', 'cf_currency', 'card_brand', 'card_funding', 'created', 'available_on'])
    gwb_refunds = pd.DataFrame(columns=['gross'])
    gwb_fees = pd.DataFrame(columns=['gross'])
    gwb_disputes = pd.DataFrame(columns=['gross'])
    gwb_tds = pd.DataFrame(columns=['gross'])

# ══════════════════════════════════════════════════════════════
# Step 3: Multi-Month Filter & Date Period Scope
# ══════════════════════════════════════════════════════════════
all_dates = pd.Series([d for d in all_dates if pd.notna(d)])
available_months = sorted(list(set(d.strftime('%B %Y') for d in all_dates if pd.notna(d))))

# Filter by selected month(s) if requested
selected_months_str = args.months or 'all'
if args.months and args.months.lower() not in ['all', 'auto', 'current']:
    targets = [m.strip().lower() for m in args.months.split(',') if m.strip()]
    if has_gwa and len(df_e) > 0 and 'created_at' in df_e.columns:
        m_short = df_e['created_at'].dt.strftime('%b %Y').str.lower()
        m_long  = df_e['created_at'].dt.strftime('%B %Y').str.lower()
        mask_a  = m_short.isin(targets) | m_long.isin(targets)
        if mask_a.any():
            df_e = df_e[mask_a].copy()
    if has_gwb and len(gwb_charges) > 0 and 'created' in gwb_charges.columns:
        m_short = gwb_charges['created'].dt.strftime('%b %Y').str.lower()
        m_long  = gwb_charges['created'].dt.strftime('%B %Y').str.lower()
        mask_b  = m_short.isin(targets) | m_long.isin(targets)
        if mask_b.any():
            gwb_charges = gwb_charges[mask_b].copy()

# Compute dynamic period label
if len(all_dates) > 0:
    min_d, max_d = all_dates.min(), all_dates.max()
    if min_d.month == max_d.month and min_d.year == max_d.year:
        dynamic_period = min_d.strftime('%B %Y')
    else:
        dynamic_period = f"{min_d.strftime('%b %Y')} – {max_d.strftime('%b %Y')}"
else:
    dynamic_period = 'Current Period'

# Override period if single specific month was selected
if args.months and args.months.lower() not in ['all', 'auto', '']:
    dynamic_period = args.months

# ══════════════════════════════════════════════════════════════
# Step 4: Gateway A Analytics (all in INR)
# ══════════════════════════════════════════════════════════════
if has_gwa and len(df_e) > 0:
    print("Computing Gateway A analytics...")
    gw_a_vol           = float(df_e['amount_inr'].sum())
    gw_a_fee           = float(df_e['fee_inr'].sum())
    gw_a_tax           = float(df_e['tax_inr'].sum())
    gw_a_total_charges = gw_a_fee + gw_a_tax
    gw_a_txn_count     = len(df_e)
    fail_count         = int((df_pay['status'] == 'failed').sum()) if len(df_pay) else 0
    total_pay_count    = len(df_pay) if len(df_pay) else gw_a_txn_count

    grp_method = df_e.groupby('method').agg(volume=('amount_inr', 'sum'), charges=('total_charges', 'sum'), count=('amount_inr', 'count'))
    grp_currency_a = df_e.groupby('currency').agg(fx_volume=('fx_amount', 'sum'), inr_volume=('amount_inr', 'sum'), count=('amount_inr', 'count'), charges=('total_charges', 'sum'))
    grp_network_a = df_e.groupby(df_e['card_network'].fillna('Other')).agg(volume=('amount_inr', 'sum'), charges=('total_charges', 'sum'), count=('amount_inr', 'count'))

    df_e['scope'] = np.where(df_e['international'] == 1, 'international', 'domestic')
    by_scope = df_e.groupby('scope').agg(volume=('amount_inr', 'sum'), charges=('total_charges', 'sum'), count=('amount_inr', 'count')).to_dict('index')
    for k in ['domestic', 'international']:
        by_scope.setdefault(k, {'volume': 0, 'charges': 0, 'count': 0})

    settle_a = df_e['settle_days'].dropna()
    settle_dist_a = settle_a.astype(int).value_counts().sort_index() if len(settle_a) else pd.Series(dtype=int)
    adj_deductions = float(df_txn[df_txn['type'] == 'adjustment']['debit'].sum()) if len(df_txn) and 'type' in df_txn.columns else 0.0
else:
    gw_a_vol = gw_a_fee = gw_a_tax = gw_a_total_charges = 0.0
    gw_a_txn_count = fail_count = total_pay_count = 0
    grp_method = pd.DataFrame(columns=['volume', 'charges', 'count'])
    grp_currency_a = pd.DataFrame(columns=['fx_volume', 'inr_volume', 'count', 'charges'])
    grp_network_a = pd.DataFrame(columns=['volume', 'charges', 'count'])
    by_scope = {'domestic': {'volume': 0, 'charges': 0, 'count': 0}, 'international': {'volume': 0, 'charges': 0, 'count': 0}}
    settle_a = pd.Series(dtype=float)
    settle_dist_a = pd.Series(dtype=int)
    adj_deductions = 0.0

# ══════════════════════════════════════════════════════════════
# Step 5: Gateway B Analytics
# ══════════════════════════════════════════════════════════════
if has_gwb and len(gwb_charges) > 0:
    print("Computing Gateway B analytics...")
    gw_b_vol            = float(gwb_charges['gross'].sum())
    gw_b_fee            = float(gwb_charges['fee'].sum())
    gw_b_standalone_fee = float(gwb_fees['gross'].abs().sum()) if len(gwb_fees) else 0.0
    gw_b_tds_amount     = float(gwb_tds['gross'].sum()) if len(gwb_tds) else 0.0
    gw_b_total_charges  = gw_b_fee + gw_b_standalone_fee + gw_b_tds_amount
    gw_b_txn_count      = len(gwb_charges)

    grp_country = gwb_charges.groupby(gwb_charges['country'].fillna('Unknown')).agg(volume=('gross', 'sum'), charges=('fee', 'sum'), count=('gross', 'count'))
    _tmp = gwb_charges.copy()
    _tmp['cf_currency'] = _tmp['cf_currency'].replace('', 'UNKNOWN')
    grp_currency_b = _tmp.groupby('cf_currency').agg(volume=('gross', 'sum'), charges=('fee', 'sum'), count=('gross', 'count'))
    grp_brand_b = gwb_charges.groupby(gwb_charges['card_brand'].fillna('Other')).agg(volume=('gross', 'sum'), charges=('fee', 'sum'), count=('gross', 'count'))
    grp_funding_b = gwb_charges.groupby(gwb_charges['card_funding'].fillna('unknown')).agg(volume=('gross', 'sum'), charges=('fee', 'sum'), count=('gross', 'count'))

    gwb_charges['settle_days'] = (gwb_charges['available_on'] - gwb_charges['created']).dt.days
    settle_b = gwb_charges['settle_days'].dropna()
    settle_dist_b = settle_b.astype(int).value_counts().sort_index() if len(settle_b) else pd.Series(dtype=int)
else:
    gw_b_vol = gw_b_fee = gw_b_standalone_fee = gw_b_tds_amount = gw_b_total_charges = 0.0
    gw_b_txn_count = 0
    grp_country = pd.DataFrame(columns=['volume', 'charges', 'count'])
    grp_currency_b = pd.DataFrame(columns=['volume', 'charges', 'count'])
    grp_brand_b = pd.DataFrame(columns=['volume', 'charges', 'count'])
    grp_funding_b = pd.DataFrame(columns=['volume', 'charges', 'count'])
    settle_b = pd.Series(dtype=float)
    settle_dist_b = pd.Series(dtype=int)

# ══════════════════════════════════════════════════════════════
# Step 6: Cross-Gateway Card Network Comparison
# ══════════════════════════════════════════════════════════════
by_card_network = {}
all_networks = set(grp_network_a.index) | set(grp_brand_b.index)
for n in all_networks:
    entry = {}
    if n in grp_network_a.index:
        a = grp_network_a.loc[n]
        if a['volume'] > 0:
            entry['gatewayA'] = {
                'volume': round(float(a['volume']), 2), 'count': int(a['count']),
                'charges': round(float(a['charges']), 2), 'rate': eff_rate(a['charges'], a['volume'])}
    if n in grp_brand_b.index:
        b = grp_brand_b.loc[n]
        if b['volume'] > 0:
            entry['gatewayB'] = {
                'volume': round(float(b['volume']), 2), 'count': int(b['count']),
                'charges': round(float(b['charges']), 2), 'rate': eff_rate(b['charges'], b['volume'])}
    if entry:
        by_card_network[n] = entry

# ══════════════════════════════════════════════════════════════
# Step 7: Reconciliation
# ══════════════════════════════════════════════════════════════
mismatches = []
total_fee_diff = 0.0
total_tax_diff = 0.0
unsettled = []

if has_gwa and len(df_pay) > 0 and len(df_txn) > 0 and 'status' in df_pay.columns:
    df_cap = df_pay[df_pay['status'] == 'captured'][['id', 'currency', 'method', 'fee_inr', 'tax_inr']].copy()
    df_cap.rename(columns={'id': 'entity_id', 'fee_inr': 'pay_fee', 'tax_inr': 'pay_tax'}, inplace=True)
    df_txn_pay = df_txn[df_txn['type'] == 'payment'][['entity_id', 'fee_inr', 'tax_inr']].copy()
    df_txn_pay.rename(columns={'fee_inr': 'txn_fee', 'tax_inr': 'txn_tax'}, inplace=True)
    df_recon = df_cap.merge(df_txn_pay, on='entity_id', how='left')
    df_recon['fee_diff'] = (df_recon['pay_fee'] - df_recon['txn_fee']).round(2)
    df_recon['tax_diff'] = (df_recon['pay_tax'] - df_recon['txn_tax']).round(2)

    diff_mask = (df_recon['fee_diff'].abs() > 0.01) | (df_recon['tax_diff'].abs() > 0.01)
    df_diffs = df_recon[diff_mask]
    total_fee_diff = round(float(df_diffs['fee_diff'].sum()), 2)
    total_tax_diff = round(float(df_diffs['tax_diff'].sum()), 2)

    mismatches = [{
        'payment_id': r['entity_id'], 'currency': r['currency'], 'method': r['method'],
        'payment_fee': round(float(r['pay_fee']), 2) if pd.notna(r['pay_fee']) else 0,
        'txn_fee': round(float(r['txn_fee']), 2) if pd.notna(r['txn_fee']) else 0,
        'fee_diff': round(float(r['fee_diff']), 2) if pd.notna(r['fee_diff']) else 0,
        'payment_tax': round(float(r['pay_tax']), 2) if pd.notna(r['pay_tax']) else 0,
        'txn_tax': round(float(r['txn_tax']), 2) if pd.notna(r['txn_tax']) else 0,
        'tax_diff': round(float(r['tax_diff']), 2) if pd.notna(r['tax_diff']) else 0,
    } for _, r in df_diffs.iterrows()]

# ══════════════════════════════════════════════════════════════
# Step 8: Overcharge Detection
# ══════════════════════════════════════════════════════════════
overcharges = []
total_overcharge = 0.0
df_oc = pd.DataFrame()

if has_gwa and len(df_e) > 0:
    df_e['expected_rate'] = np.select(
        [df_e['method'] == 'upi', df_e['method'] == 'emi', df_e['international'] == 1],
        [RATES['upi'], RATES['emi'], RATES['intl_card']],
        default=RATES['domestic_card']
    )
    df_e['actual_rate'] = np.where(df_e['amount_inr'] > 0, (df_e['total_charges'] / df_e['amount_inr'] * 100).round(2), 0.0)
    oc_mask = (df_e['amount_inr'] > 0) & (df_e['actual_rate'] > df_e['expected_rate'] + 0.5)
    df_oc = df_e[oc_mask].copy()
    if len(df_oc) > 0:
        df_oc['expected_fee'] = (df_oc['amount_inr'] * df_oc['expected_rate'] / 100).round(2)
        df_oc['overcharge']   = (df_oc['total_charges'] - df_oc['expected_fee']).round(2)
        total_overcharge = round(float(df_oc['overcharge'].sum()), 2)
        overcharges = [{
            'payment_id': r['entity_id'], 'currency': r['currency'],
            'amount_inr': round(float(r['amount_inr']), 2), 'method': r['method'],
            'international': int(r['international']), 'card_network': r['card_network'],
            'expected_rate': float(r['expected_rate']), 'actual_rate': float(r['actual_rate']),
            'expected_fee': float(r['expected_fee']), 'actual_fee': round(float(r['total_charges']), 2),
            'overcharge': float(r['overcharge']),
        } for _, r in df_oc.iterrows()]

# ══════════════════════════════════════════════════════════════
# Step 9: Smart Routing / Savings Model
# ══════════════════════════════════════════════════════════════
savings_items = []
total_saving = 0.0

if has_gwa and has_gwb:
    for n, data in by_card_network.items():
        a, b = data.get('gatewayA'), data.get('gatewayB')
        if not (a and b):
            continue
        tot_vol     = a['volume'] + b['volume']
        tot_charges = a['charges'] + b['charges']
        cheapest, cheapest_rate = ('Gateway A', a['rate']) if a['rate'] <= b['rate'] else ('Gateway B', b['rate'])
        opt = tot_vol * cheapest_rate / 100
        sav = tot_charges - opt
        savings_items.append({
            'network': n, 'total_volume': round(tot_vol, 2),
            'gateway_a_rate': a['rate'], 'gateway_b_rate': b['rate'],
            'cheapest_gateway': cheapest,
            'current_charges': round(tot_charges, 2), 'optimized_charges': round(opt, 2),
            'potential_saving': round(sav, 2),
            'saving_pct': round(sav / tot_charges * 100, 2) if tot_charges > 0 else 0,
        })
    total_saving = round(sum(s['potential_saving'] for s in savings_items), 2)
elif has_gwb:
    # Single consolidated file mode — optimize by card brand & currency tiers
    for n, row in grp_brand_b.iterrows():
        if row['volume'] > 0:
            cur_rate = eff_rate(row['charges'], row['volume'])
            target_rate = max(1.85, cur_rate - 0.5)
            sav = row['volume'] * (cur_rate - target_rate) / 100
            savings_items.append({
                'network': n, 'total_volume': round(float(row['volume']), 2),
                'gateway_a_rate': 0, 'gateway_b_rate': cur_rate,
                'cheapest_gateway': 'Optimized Tier',
                'current_charges': round(float(row['charges']), 2),
                'optimized_charges': round(float(row['volume'] * target_rate / 100), 2),
                'potential_saving': round(sav, 2),
                'saving_pct': round((cur_rate - target_rate) / cur_rate * 100, 2) if cur_rate > 0 else 0
            })
    total_saving = round(sum(s['potential_saving'] for s in savings_items), 2)

# ══════════════════════════════════════════════════════════════
# Step 10: Time-Series
# ══════════════════════════════════════════════════════════════
def build_ts(df, date_col, vol_col, charges_col, settle_col):
    if len(df) == 0 or date_col not in df.columns:
        return {'weekly': [], 'monthly': []}
    d = df.copy()
    d['_week']  = d[date_col].apply(lambda x: f"W{x.isocalendar()[1]}" if pd.notna(x) else None)
    d['_month'] = d[date_col].dt.strftime('%Y-%m')
    res = {}
    for gran, col in [('weekly', '_week'), ('monthly', '_month')]:
        valid = d[d[col].notna()]
        if len(valid) == 0:
            res[gran] = []
            continue
        grp = valid.groupby(col).agg(
            volume=(vol_col, 'sum'), charges=(charges_col, 'sum'),
            count=(vol_col, 'count'), avg_settle=(settle_col, 'mean')
        ).reset_index()
        grp.rename(columns={col: 'period'}, inplace=True)
        grp['rate'] = (grp['charges'] / grp['volume'] * 100).round(2).fillna(0)
        grp['volume'] = grp['volume'].round(2)
        grp['charges'] = grp['charges'].round(2)
        grp['avg_settle'] = grp['avg_settle'].round(1).fillna(0)
        res[gran] = grp.sort_values('period').to_dict('records')
    return res

ts_a = build_ts(df_e, 'created_at', 'amount_inr', 'total_charges', 'settle_days') if has_gwa else {'weekly': [], 'monthly': []}
ts_b = build_ts(gwb_charges, 'created', 'gross', 'fee', 'settle_days') if has_gwb else {'weekly': [], 'monthly': []}

# ══════════════════════════════════════════════════════════════
# Step 11: FX & Working Capital Analysis
# ══════════════════════════════════════════════════════════════
def fx_summary(dom, intl):
    dom_rate  = eff_rate(dom['charges'], dom['volume'])
    intl_rate = eff_rate(intl['charges'], intl['volume'])
    premium   = round(intl_rate - dom_rate, 2) if intl['volume'] > 0 else None
    return {
        'domestic':      {'volume': round(dom['volume'], 2), 'charges': round(dom['charges'], 2), 'count': dom['count'], 'rate': dom_rate},
        'international': {'volume': round(intl['volume'], 2), 'charges': round(intl['charges'], 2), 'count': intl['count'], 'rate': intl_rate},
        'fx_premium_pct': premium,
    }

fx_a_dom = by_scope['domestic']
fx_a_intl = by_scope['international']
fx_a_by_currency = {}
if has_gwa and len(df_e) > 0:
    for cur, grp in df_e[df_e['international'] == 1].groupby('currency'):
        fx_a_by_currency[cur] = summarize(grp['amount_inr'].sum(), grp['total_charges'].sum(), len(grp))

fx_b_dom = {'volume': 0, 'charges': 0, 'count': 0}
fx_b_intl = {'volume': 0, 'charges': 0, 'count': 0}
fx_b_by_country = {}
if has_gwb and len(gwb_charges) > 0:
    gwb_dom = gwb_charges[gwb_charges['country'] == 'IN']
    gwb_intl = gwb_charges[gwb_charges['country'] != 'IN']
    fx_b_dom = {'volume': float(gwb_dom['gross'].sum()), 'charges': float(gwb_dom['fee'].sum()), 'count': len(gwb_dom)}
    fx_b_intl = {'volume': float(gwb_intl['gross'].sum()), 'charges': float(gwb_intl['fee'].sum()), 'count': len(gwb_intl)}
    for cntry, grp in gwb_intl.groupby('country'):
        fx_b_by_country[cntry] = summarize(grp['gross'].sum(), grp['fee'].sum(), len(grp))

fx_analysis = {
    'gatewayA': {**fx_summary(fx_a_dom, fx_a_intl), 'intl_by_currency': fx_a_by_currency},
    'gatewayB': {**fx_summary(fx_b_dom, fx_b_intl), 'intl_by_country': fx_b_by_country},
}

# ══════════════════════════════════════════════════════════════
# Step 12: Renegotiation Insights
# ══════════════════════════════════════════════════════════════
reco_data = []
if len(df_oc) > 0:
    df_oc['oc_cat'] = np.where(df_oc['international'] == 1, 'International ' + df_oc['method'].str.title(), 'Domestic ' + df_oc['method'].str.title())
    for cat, grp in df_oc.groupby('oc_cat'):
        tot_oc = float(grp['overcharge'].sum())
        vol = float(grp['amount_inr'].sum())
        exp = float(grp['expected_rate'].iloc[0])
        max_act = float(grp['actual_rate'].max())
        avg_act = eff_rate(tot_oc + vol * exp / 100, vol)
        reco_data.append({
            'category': cat, 'overcharge_count': len(grp),
            'total_overcharge': round(tot_oc, 2), 'volume_affected': round(vol, 2),
            'contracted_rate': exp, 'avg_actual_rate': round(avg_act, 2),
            'max_actual_rate': max_act, 'recommended_target_rate': round(min(exp + 0.25, avg_act), 2)
        })

# Refund items
refund_items = []
if len(df_refund) > 0:
    for _, r in df_refund.head(50).iterrows():
        refund_items.append({
            'id': str(r['id']), 'amount': round(float(r['amount']), 2), 'currency': str(r.get('currency', 'INR')),
            'payment_id': str(r.get('payment_id', '')),
            'created_at': r['created_at'].isoformat() if pd.notna(r.get('created_at')) else None,
            'status': str(r.get('status', 'processed'))
        })

# Mode classification
if has_gwa and has_gwb:
    mode = 'dual_gateway_comparative'
elif has_gwb:
    mode = 'single_consolidated'
else:
    mode = 'multi_file_master'

# ══════════════════════════════════════════════════════════════
# Step 13: Final JSON Assembly
# ══════════════════════════════════════════════════════════════
dashboard_data = {
    'period': dynamic_period,
    'generated_at': datetime.now().isoformat(),
    'mode': mode,
    'has_gateway_a': has_gwa,
    'has_gateway_b': has_gwb,
    'available_months': available_months,
    'selected_months': selected_months_str,
    'master_table_info': master_info,

    'overview': {
        'gatewayA': {
            'name': 'Gateway A',
            'total_volume': round(gw_a_vol, 2),
            'total_charges': round(gw_a_total_charges, 2),
            'effective_rate': eff_rate(gw_a_total_charges, gw_a_vol),
            'txn_count': gw_a_txn_count,
            'failed_count': fail_count,
            'total_payments': total_pay_count,
            'failure_rate': round(fail_count / total_pay_count * 100, 2) if total_pay_count else 0,
            'refund_count': len(df_refund),
            'refund_volume': round(float(df_refund['amount'].sum()), 2) if len(df_refund) else 0.0,
            'avg_settlement_days': round(float(settle_a.mean()), 1) if len(settle_a) > 0 else 0,
            'min_settlement_days': int(settle_a.min()) if len(settle_a) > 0 else 0,
            'max_settlement_days': int(settle_a.max()) if len(settle_a) > 0 else 0,
            'settlement_distribution': {str(int(k)): int(v) for k, v in settle_dist_a.items()},
            'adj_deductions': round(adj_deductions, 2),
            'domestic': summarize(by_scope['domestic']['volume'], by_scope['domestic']['charges'], by_scope['domestic']['count']),
            'international': summarize(by_scope['international']['volume'], by_scope['international']['charges'], by_scope['international']['count']),
        },
        'gatewayB': {
            'name': 'Gateway B',
            'total_volume': round(gw_b_vol, 2),
            'total_charges': round(gw_b_total_charges, 2),
            'effective_rate': eff_rate(gw_b_total_charges, gw_b_vol),
            'txn_count': gw_b_txn_count,
            'refund_count': len(gwb_refunds),
            'refund_volume': round(float(gwb_refunds['gross'].abs().sum()), 2) if len(gwb_refunds) else 0.0,
            'dispute_count': len(gwb_disputes),
            'standalone_fees': round(gw_b_standalone_fee, 2),
            'tds_amount': round(gw_b_tds_amount, 2),
            'avg_settlement_days': round(float(settle_b.mean()), 1) if len(settle_b) > 0 else 0,
            'min_settlement_days': int(settle_b.min()) if len(settle_b) > 0 else 0,
            'max_settlement_days': int(settle_b.max()) if len(settle_b) > 0 else 0,
            'settlement_distribution': {str(int(k)): int(v) for k, v in settle_dist_b.items()},
        }
    },

    'by_method': {
        k: summarize(row['volume'], row['charges'], row['count'])
        for k, row in grp_method.sort_values('volume', ascending=False).iterrows()
    },

    'by_currency': {
        'gatewayA': {
            k: {
                'fx_volume':  round(float(row['fx_volume']), 2),
                'inr_volume': round(float(row['inr_volume']), 2),
                'count':      int(row['count']),
                'charges':    round(float(row['charges']), 2),
                'rate':       eff_rate(row['charges'], row['inr_volume']),
            }
            for k, row in grp_currency_a.sort_values('inr_volume', ascending=False).iterrows()
        },
        'gatewayB': {
            k: summarize(row['volume'], row['charges'], row['count'])
            for k, row in grp_currency_b.sort_values('volume', ascending=False).iterrows()
        },
    },

    'by_geography': {
        k: summarize(row['volume'], row['charges'], row['count'])
        for k, row in grp_country.sort_values('volume', ascending=False).iterrows()
    },

    'by_card_network': by_card_network,

    'by_card_funding': {
        'gatewayB': {
            k: summarize(row['volume'], row['charges'], row['count'])
            for k, row in grp_funding_b.sort_values('volume', ascending=False).iterrows()
        }
    },

    'timeseries': {
        'weekly':  {'gatewayA': ts_a['weekly'],  'gatewayB': ts_b['weekly']},
        'monthly': {'gatewayA': ts_a['monthly'], 'gatewayB': ts_b['monthly']},
    },

    'fx_analysis': fx_analysis,

    'reconciliation': {
        'total_mismatches':  len(mismatches),
        'total_fee_diff':    total_fee_diff,
        'total_tax_diff':    total_tax_diff,
        'unsettled_count':   len(unsettled),
        'mismatches':        sorted(mismatches, key=lambda x: abs(x.get('fee_diff') or 0), reverse=True)[:50],
    },

    'overcharges': {
        'count':            len(overcharges),
        'total_overcharge': total_overcharge,
        'items':            sorted(overcharges, key=lambda x: -x['overcharge'])[:30],
        'contracted_rates': RATES,
    },

    'savings_model': {
        'items':                  sorted(savings_items, key=lambda x: -x['potential_saving']),
        'total_potential_saving': total_saving,
        'annualized_saving':      round(total_saving * 12, 2),
    },

    'renegotiation': reco_data,

    'failed_transactions': {
        'gatewayA': {'count': fail_count, 'total': total_pay_count,
                     'failure_rate': round(fail_count / total_pay_count * 100, 2) if total_pay_count else 0}
    },

    'refunds_summary': {
        'gatewayA': {'count': len(df_refund), 'volume': round(float(df_refund['amount'].sum()), 2) if len(df_refund) else 0.0,
                     'items': refund_items},
        'gatewayB': {'count': len(gwb_refunds), 'volume': round(float(gwb_refunds['gross'].abs().sum()), 2) if len(gwb_refunds) else 0.0},
    },
}

# Attach multi-gateway overview mapping
all_gw_map = {}
if has_gwa:
    name_a = gw_names_order[0] if gw_names_order else 'Gateway A'
    dashboard_data['overview']['gatewayA']['name'] = name_a
    all_gw_map[name_a] = dashboard_data['overview']['gatewayA']
if has_gwb:
    name_b = gw_names_order[1] if len(gw_names_order) > 1 else 'Gateway B'
    dashboard_data['overview']['gatewayB']['name'] = name_b
    all_gw_map[name_b] = dashboard_data['overview']['gatewayB']

# Process any additional gateways beyond A and B (e.g. Gateway C, Gateway D)
if 'extra_gateways' in locals() and extra_gateways:
    for eg_name, eg_info in extra_gateways.items():
        try:
            target_f = eg_info.get('cons') or eg_info.get('txn') or eg_info.get('pay')
            if not target_f and eg_info.get('files'):
                target_f = eg_info['files'][0]
            if target_f and os.path.exists(target_f):
                df_eg = pd.read_excel(target_f) if target_f.endswith(('.xlsx', '.xls')) else pd.read_csv(target_f)
                amt_col = next((c for c in df_eg.columns if any(k in str(c).lower() for k in ['amount', 'gross', 'vol', 'inr'])), None)
                fee_col = next((c for c in df_eg.columns if any(k in str(c).lower() for k in ['fee', 'charge', 'cost'])), None)
                eg_vol = float(df_eg[amt_col].sum()) if amt_col else 0.0
                eg_charges = float(df_eg[fee_col].sum()) if fee_col else 0.0
                all_gw_map[eg_name] = {
                    'name': eg_name,
                    'total_volume': round(eg_vol, 2),
                    'total_charges': round(eg_charges, 2),
                    'effective_rate': eff_rate(eg_charges, eg_vol),
                    'txn_count': len(df_eg),
                    'refund_count': 0,
                    'refund_volume': 0.0,
                    'avg_settlement_days': 2.0,
                    'settlement_distribution': {'2': len(df_eg)},
                }
        except Exception as eg_err:
            print(f"[Warning] Error parsing extra gateway {eg_name}: {eg_err}")

dashboard_data['overview']['gateways'] = all_gw_map
dashboard_data['gateway_names'] = list(all_gw_map.keys())

out_path = os.path.join(OUT_DIR, 'dashboard_data.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(dashboard_data, f, indent=2, default=str)

print(f"\nProcessing Complete. Saved to: {out_path}")
print(f"Mode: {mode} | Period: {dynamic_period} | Available Months: {available_months}")
if has_gwa:
    print(f"Gateway A: {gw_a_txn_count} txns | INR {gw_a_vol:,.2f} vol | {eff_rate(gw_a_total_charges, gw_a_vol)}% eff rate")
if has_gwb:
    print(f"Gateway B: {gw_b_txn_count} txns | INR {gw_b_vol:,.2f} vol | {eff_rate(gw_b_total_charges, gw_b_vol)}% eff rate")
