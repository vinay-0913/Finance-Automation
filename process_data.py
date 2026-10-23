"""
process_data.py — Payment Gateway Cost & Settlement Analysis
Pre-processes all 4 Excel files and outputs dashboard_data.json.
Rewritten with Pandas + NumPy for cleaner, faster processing.

KEY DESIGN:
  - Gateway A has 3 files: payments (metadata + fx amount), transactions (INR amounts), refunds
  - For effective rate calculation we ALWAYS use the transactions file (everything in INR)
  - Payments file is used for metadata: method, currency, card network, international flag
  - Join key: payments.id == transactions.entity_id (for type='payment')
"""

import pandas as pd
import numpy as np
import json
import os
from datetime import datetime

DATA_DIR = r"d:\Cutemath Automation"

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────
def eff_rate(charges, volume):
    """Safe effective rate %"""
    return round(float(charges) / float(volume) * 100, 2) if volume and float(volume) > 0 else 0.0

def summarize(vol, charges, count):
    return {'volume': round(float(vol), 2), 'charges': round(float(charges), 2),
            'count': int(count), 'rate': eff_rate(charges, vol)}

def read_cols(df, col_map):
    """Select columns by position index and rename them."""
    result = df.iloc[:, list(col_map.keys())].copy()
    result.columns = list(col_map.values())
    return result

def to_numeric_cols(df, cols):
    """Convert multiple columns to numeric, filling NaN with 0."""
    for c in cols:
        df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0.0)

def to_int_cols(df, cols):
    """Convert multiple columns to int, filling NaN with 0."""
    for c in cols:
        df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0).astype(int)


# ══════════════════════════════════════════════════════════════
# Step 1: Read GatewayA Payments (metadata file)
# Row 1 = blank, Row 2 = headers, Row 3+ = data → header=1
# ══════════════════════════════════════════════════════════════
print("Reading GatewayA Payments (metadata)...")
_raw = pd.read_excel(os.path.join(DATA_DIR, "GatewayA_payments_Sep26_dummy.xlsx"),
                     sheet_name='Sheet1', header=1, engine='openpyxl')
df_pay = read_cols(_raw, {
    0:'id', 1:'fx_amount', 2:'currency', 3:'status', 6:'international',
    7:'method', 8:'amount_refunded', 21:'fee_inr', 22:'tax_inr',
    25:'created_at', 26:'card_type', 27:'card_network'
})
df_pay = df_pay.dropna(subset=['id'])
to_numeric_cols(df_pay, ['fx_amount', 'fee_inr', 'tax_inr'])
to_int_cols(df_pay, ['international'])
df_pay['method']     = df_pay['method'].fillna('unknown')
df_pay['created_at'] = pd.to_datetime(df_pay['created_at'], errors='coerce')
print(f"  {len(df_pay)} payment records")


# ══════════════════════════════════════════════════════════════
# Step 2: Read GatewayA Transactions (settlement / INR ledger)
# Row 1 = headers, Row 2+ = data → header=0
# amount = INR (authoritative), fee = INR, tax = INR
# ══════════════════════════════════════════════════════════════
print("Reading GatewayA Transactions (INR ledger)...")
_raw = pd.read_excel(os.path.join(DATA_DIR, "GatewayA_transactions_Sep26_dummy.xlsx"),
                     sheet_name='Sheet1', header=0, engine='openpyxl')
df_txn = read_cols(_raw, {
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
print(f"  {len(df_txn)} transaction records")


# ══════════════════════════════════════════════════════════════
# Step 3: Read GatewayA Refunds
# Row 1 = blank, Row 2 = headers, Row 3+ = data → header=1
# ══════════════════════════════════════════════════════════════
print("Reading GatewayA Refunds...")
_raw = pd.read_excel(os.path.join(DATA_DIR, "GatewayA_refunds_Sep26_dummy.xlsx"),
                     sheet_name='Sheet1', header=1, engine='openpyxl')
df_refund = read_cols(_raw, {0:'id', 1:'amount', 2:'currency', 3:'payment_id',
                              6:'created_at', 10:'status'})
df_refund = df_refund.dropna(subset=['id'])
to_numeric_cols(df_refund, ['amount'])
df_refund['created_at'] = pd.to_datetime(df_refund['created_at'], errors='coerce')
print(f"  {len(df_refund)} refund records")


# ══════════════════════════════════════════════════════════════
# Step 4: Read GatewayB (single combined ledger)
# Row 1 = blank, Row 2 = headers, Row 3+ = data → header=1
# ══════════════════════════════════════════════════════════════
print("Reading GatewayB...")
_raw = pd.read_excel(os.path.join(DATA_DIR, "GatewayB_Sep26_dummy.xlsx"),
                     sheet_name="GatewayB Sep'26", header=1, engine='openpyxl')
df_gwb = read_cols(_raw, {
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

# Split by reporting category
gwb_charges  = df_gwb[df_gwb['reporting_category'] == 'charge'].copy()
gwb_refunds  = df_gwb[df_gwb['reporting_category'] == 'refund'].copy()
gwb_fees     = df_gwb[df_gwb['reporting_category'] == 'fee'].copy()
gwb_disputes = df_gwb[df_gwb['reporting_category'] == 'dispute'].copy()
gwb_tds      = df_gwb[df_gwb['reporting_category'] == 'tax'].copy()
print(f"  {len(df_gwb)} GatewayB records")


# ══════════════════════════════════════════════════════════════
# Step 5: Build enriched payment records
# Merge: transactions (type='payment') LEFT JOIN payments metadata
# Transactions = authoritative INR amounts; Payments = metadata
# ══════════════════════════════════════════════════════════════
print("\nBuilding enriched payment records...")

# Transaction-side columns (authoritative amounts)
df_pay_txns = df_txn[df_txn['type'] == 'payment'][
    ['entity_id', 'amount_inr', 'fee_inr', 'tax_inr', 'created_at', 'settled_at',
     'settled', 'method', 'card_network', 'card_type']
].copy().rename(columns={
    'method': 'txn_method', 'card_network': 'txn_card_network', 'card_type': 'txn_card_type'
})

# Payment-side columns (metadata)
df_pay_meta = df_pay[
    ['id', 'fx_amount', 'currency', 'status', 'international',
     'method', 'card_network', 'card_type']
].copy().rename(columns={
    'id': 'entity_id', 'method': 'pay_method',
    'card_network': 'pay_card_network', 'card_type': 'pay_card_type'
})

# Merge
df_e = df_pay_txns.merge(df_pay_meta, on='entity_id', how='left')

# Coalesce metadata (prefer payments, fall back to transaction, then defaults)
df_e['method']       = df_e['pay_method'].fillna(df_e['txn_method']).fillna('card')
df_e['card_network'] = df_e['pay_card_network'].fillna(df_e['txn_card_network']).fillna('Other')
df_e['card_type']    = df_e['pay_card_type'].fillna(df_e['txn_card_type'])
df_e['currency']     = df_e['currency'].fillna('INR')
df_e['international'] = df_e['international'].fillna(0).astype(int)
df_e['fx_amount']    = df_e['fx_amount'].fillna(0.0)
df_e['status']       = df_e['status'].fillna('captured')

# Computed columns
df_e['total_charges'] = df_e['fee_inr'] + df_e['tax_inr']
df_e['settle_days']   = (df_e['settled_at'] - df_e['created_at']).dt.days

print(f"  {len(df_e)} enriched payment records")


# ══════════════════════════════════════════════════════════════
# Step 6: Gateway A Analytics (all in INR)
# ══════════════════════════════════════════════════════════════
print("Computing Gateway A analytics...")

gw_a_vol           = float(df_e['amount_inr'].sum())
gw_a_fee           = float(df_e['fee_inr'].sum())
gw_a_tax           = float(df_e['tax_inr'].sum())
gw_a_total_charges = gw_a_fee + gw_a_tax
gw_a_txn_count     = len(df_e)

fail_count      = int((df_pay['status'] == 'failed').sum())
total_pay_count = len(df_pay)

# By method — one-liner groupby replaces 5-line manual loop
grp_method = df_e.groupby('method').agg(
    volume=('amount_inr', 'sum'), charges=('total_charges', 'sum'), count=('amount_inr', 'count'))

# By currency
grp_currency_a = df_e.groupby('currency').agg(
    fx_volume=('fx_amount', 'sum'), inr_volume=('amount_inr', 'sum'),
    count=('amount_inr', 'count'), charges=('total_charges', 'sum'))

# By card network
grp_network_a = df_e.groupby(df_e['card_network'].fillna('Other')).agg(
    volume=('amount_inr', 'sum'), charges=('total_charges', 'sum'), count=('amount_inr', 'count'))

# Domestic vs international — vectorized scope assignment
df_e['scope'] = np.where(df_e['international'] == 1, 'international', 'domestic')
by_scope = df_e.groupby('scope').agg(
    volume=('amount_inr', 'sum'), charges=('total_charges', 'sum'), count=('amount_inr', 'count')
).to_dict('index')
for k in ['domestic', 'international']:
    by_scope.setdefault(k, {'volume': 0, 'charges': 0, 'count': 0})

# Settlement time distribution
settle_a = df_e['settle_days'].dropna()
settle_dist_a = settle_a.astype(int).value_counts().sort_index()

# Non-payment adjustments
adj_deductions = float(df_txn[df_txn['type'] == 'adjustment']['debit'].sum())


# ══════════════════════════════════════════════════════════════
# Step 7: Gateway B Analytics
# ══════════════════════════════════════════════════════════════
print("Computing Gateway B analytics...")

gw_b_vol            = float(gwb_charges['gross'].sum())
gw_b_fee            = float(gwb_charges['fee'].sum())
gw_b_standalone_fee = float(gwb_fees['gross'].abs().sum())
gw_b_tds_amount     = float(gwb_tds['gross'].sum())
gw_b_total_charges  = gw_b_fee + gw_b_standalone_fee + gw_b_tds_amount
gw_b_txn_count      = len(gwb_charges)
print(f"  GatewayB TDS rows: {len(gwb_tds)}, TDS amount: INR {gw_b_tds_amount:.2f}")

# By country
grp_country = gwb_charges.groupby(gwb_charges['country'].fillna('Unknown')).agg(
    volume=('gross', 'sum'), charges=('fee', 'sum'), count=('gross', 'count'))

# By customer-facing currency
_tmp = gwb_charges.copy()
_tmp['cf_currency'] = _tmp['cf_currency'].replace('', 'UNKNOWN')
grp_currency_b = _tmp.groupby('cf_currency').agg(
    volume=('gross', 'sum'), charges=('fee', 'sum'), count=('gross', 'count'))

# By card brand
grp_brand_b = gwb_charges.groupby(gwb_charges['card_brand'].fillna('Other')).agg(
    volume=('gross', 'sum'), charges=('fee', 'sum'), count=('gross', 'count'))

# By card funding
grp_funding_b = gwb_charges.groupby(gwb_charges['card_funding'].fillna('unknown')).agg(
    volume=('gross', 'sum'), charges=('fee', 'sum'), count=('gross', 'count'))

# Settlement time
gwb_charges['settle_days'] = (gwb_charges['available_on'] - gwb_charges['created']).dt.days
settle_b = gwb_charges['settle_days'].dropna()
settle_dist_b = settle_b.astype(int).value_counts().sort_index()


# ══════════════════════════════════════════════════════════════
# Step 8: Cross-gateway card network comparison
# ══════════════════════════════════════════════════════════════
print("Building cross-gateway comparison...")

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
# Step 9: Reconciliation
# Compare payments file fee (INR) vs transactions file fee (INR)
# ══════════════════════════════════════════════════════════════
print("Running reconciliation...")

# Captured payments → left join with payment-type transactions
df_cap = df_pay[df_pay['status'] == 'captured'][['id', 'currency', 'method', 'fee_inr', 'tax_inr']].copy()
df_cap.rename(columns={'id': 'entity_id', 'fee_inr': 'pay_fee', 'tax_inr': 'pay_tax'}, inplace=True)

df_txn_pay = df_txn[df_txn['type'] == 'payment'][['entity_id', 'fee_inr', 'tax_inr']].copy()
df_txn_pay.rename(columns={'fee_inr': 'txn_fee', 'tax_inr': 'txn_tax'}, inplace=True)

df_recon = df_cap.merge(df_txn_pay, on='entity_id', how='left')
df_recon['fee_diff'] = (df_recon['pay_fee'] - df_recon['txn_fee']).round(2)
df_recon['tax_diff'] = (df_recon['pay_tax'] - df_recon['txn_tax']).round(2)

mismatches = []

# No matching transaction record
for _, r in df_recon[df_recon['txn_fee'].isna()].iterrows():
    mismatches.append({
        'payment_id': r['entity_id'], 'issue': 'No matching transaction record',
        'currency': r['currency'], 'method': r['method'],
        'pay_fee': round(float(r['pay_fee']), 2), 'txn_fee': None, 'fee_diff': None,
        'pay_tax': round(float(r['pay_tax']), 2), 'txn_tax': None, 'tax_diff': None,
    })

# Fee/tax mismatch (>0.5 INR tolerance)
has_txn = df_recon['txn_fee'].notna()
mismatch_mask = has_txn & ((df_recon['fee_diff'].abs() > 0.5) | (df_recon['tax_diff'].abs() > 0.5))
for _, r in df_recon[mismatch_mask].iterrows():
    mismatches.append({
        'payment_id': r['entity_id'],
        'issue': 'Fee/tax mismatch between payment and transaction records',
        'currency': r['currency'], 'method': r['method'],
        'pay_fee': round(float(r['pay_fee']), 2), 'txn_fee': round(float(r['txn_fee']), 2),
        'fee_diff': round(float(r['fee_diff']), 2),
        'pay_tax': round(float(r['pay_tax']), 2), 'txn_tax': round(float(r['txn_tax']), 2),
        'tax_diff': round(float(r['tax_diff']), 2),
    })

# Captured payments with no settlement transaction at all
txn_pay_ids = set(df_txn[df_txn['type'] == 'payment']['entity_id'])
captured_ids = set(df_pay[df_pay['status'] == 'captured']['id'])
unsettled = captured_ids - txn_pay_ids
for pid in unsettled:
    m = df_pay[df_pay['id'] == pid].iloc[0]
    mismatches.append({
        'payment_id': pid, 'issue': 'Captured payment has no settlement transaction',
        'currency': m['currency'], 'method': m['method'],
        'pay_fee': round(float(m['fee_inr']), 2), 'txn_fee': None, 'fee_diff': None,
        'pay_tax': round(float(m['tax_inr']), 2), 'txn_tax': None, 'tax_diff': None,
    })

total_fee_diff = round(sum(m['fee_diff'] or 0 for m in mismatches), 2)
total_tax_diff = round(sum(m['tax_diff'] or 0 for m in mismatches), 2)
print(f"  {len(mismatches)} mismatches (fee diff total: INR {total_fee_diff})")


# ══════════════════════════════════════════════════════════════
# Step 10: Overcharge Detection (vectorized with NumPy)
# ══════════════════════════════════════════════════════════════
print("Detecting overcharges...")

RATES = {'upi': 0.0, 'emi': 2.5, 'domestic_card': 2.0, 'intl_card': 3.0}

# Vectorized expected rate assignment — replaces manual if/elif chain
df_e['expected_rate'] = np.select(
    [df_e['method'] == 'upi', df_e['method'] == 'emi', df_e['international'] == 1],
    [RATES['upi'], RATES['emi'], RATES['intl_card']],
    default=RATES['domestic_card']
)

# Vectorized actual rate — replaces per-row rate() calls
df_e['actual_rate'] = np.where(
    df_e['amount_inr'] > 0,
    (df_e['total_charges'] / df_e['amount_inr'] * 100).round(2),
    0.0
)

# Boolean mask — replaces manual loop + if
oc_mask = (df_e['amount_inr'] > 0) & (df_e['actual_rate'] > df_e['expected_rate'] + 0.5)
df_oc = df_e[oc_mask].copy()
df_oc['expected_fee'] = (df_oc['amount_inr'] * df_oc['expected_rate'] / 100).round(2)
df_oc['overcharge']   = (df_oc['total_charges'] - df_oc['expected_fee']).round(2)

overcharges = [{
    'payment_id': r['entity_id'], 'currency': r['currency'],
    'amount_inr': round(float(r['amount_inr']), 2), 'method': r['method'],
    'international': int(r['international']), 'card_network': r['card_network'],
    'expected_rate': float(r['expected_rate']), 'actual_rate': float(r['actual_rate']),
    'expected_fee': float(r['expected_fee']), 'actual_fee': round(float(r['total_charges']), 2),
    'overcharge': float(r['overcharge']),
} for _, r in df_oc.iterrows()]

total_overcharge = round(float(df_oc['overcharge'].sum()), 2)
print(f"  {len(overcharges)} overcharged transactions, total INR {total_overcharge}")


# ══════════════════════════════════════════════════════════════
# Step 11: Savings Model
# For each card network in both gateways, route to cheapest
# ══════════════════════════════════════════════════════════════
print("Building savings model...")

savings_items = []
for n, data in by_card_network.items():
    a, b = data.get('gatewayA'), data.get('gatewayB')
    if not (a and b):
        continue
    total_vol     = a['volume'] + b['volume']
    total_charges = a['charges'] + b['charges']
    cheapest, cheapest_rate = ('Gateway A', a['rate']) if a['rate'] <= b['rate'] else ('Gateway B', b['rate'])
    optimized = total_vol * cheapest_rate / 100
    saving    = total_charges - optimized
    savings_items.append({
        'network': n, 'total_volume': round(total_vol, 2),
        'gateway_a_rate': a['rate'], 'gateway_b_rate': b['rate'],
        'cheapest_gateway': cheapest,
        'current_charges': round(total_charges, 2), 'optimized_charges': round(optimized, 2),
        'potential_saving': round(saving, 2),
        'saving_pct': round(saving / total_charges * 100, 2) if total_charges > 0 else 0,
    })

total_saving = round(sum(s['potential_saving'] for s in savings_items), 2)
print(f"  Potential saving: INR {total_saving}")


# ══════════════════════════════════════════════════════════════
# Step 12: Time-Series (weekly + monthly)
# Pandas groupby replaces manual defaultdict bucket loops
# ══════════════════════════════════════════════════════════════
print("Building time-series...")

def build_ts(df, date_col, vol_col, charges_col, settle_col):
    """Build weekly and monthly time-series from a DataFrame."""
    df = df.copy()
    df['_week']  = df[date_col].apply(
        lambda d: f"W{d.isocalendar()[1]}" if pd.notna(d) else None)
    df['_month'] = df[date_col].dt.strftime('%Y-%m')

    results = {}
    for gran, col in [('weekly', '_week'), ('monthly', '_month')]:
        valid = df[df[col].notna()]
        if len(valid) == 0:
            results[gran] = []
            continue
        grp = valid.groupby(col).agg(
            volume=(vol_col, 'sum'), charges=(charges_col, 'sum'),
            count=(vol_col, 'count'),
            settle_sum=(settle_col, 'sum'), settle_count=(settle_col, 'count')
        ).sort_index()
        records = []
        for period, row in grp.iterrows():
            avg_s = round(float(row['settle_sum']) / int(row['settle_count']), 1) \
                    if row['settle_count'] > 0 else None
            records.append({
                'period': period, 'volume': round(float(row['volume']), 2),
                'charges': round(float(row['charges']), 2), 'count': int(row['count']),
                'rate': eff_rate(row['charges'], row['volume']),
                'avg_settlement_days': avg_s,
            })
        results[gran] = records
    return results

ts_a = build_ts(df_e, 'created_at', 'amount_inr', 'total_charges', 'settle_days')
ts_b = build_ts(gwb_charges, 'created', 'gross', 'fee', 'settle_days')

print(f"  Gateway A: {len(ts_a['weekly'])} weeks, {len(ts_a['monthly'])} months")
print(f"  Gateway B: {len(ts_b['weekly'])} weeks, {len(ts_b['monthly'])} months")


# ══════════════════════════════════════════════════════════════
# Step 13: FX / Cross-Border Fee Isolation
# Separates domestic vs international effective rates per gateway
# ══════════════════════════════════════════════════════════════
print("Isolating FX / cross-border fees...")

# Gateway A — domestic vs international
df_e_dom  = df_e[df_e['international'] == 0]
df_e_intl = df_e[df_e['international'] == 1]

fx_a_dom  = {'volume': float(df_e_dom['amount_inr'].sum()),
             'charges': float(df_e_dom['total_charges'].sum()), 'count': len(df_e_dom)}
fx_a_intl = {'volume': float(df_e_intl['amount_inr'].sum()),
             'charges': float(df_e_intl['total_charges'].sum()), 'count': len(df_e_intl)}

# Intl by currency — groupby replaces manual defaultdict loop
fx_a_by_currency = {}
if len(df_e_intl) > 0:
    for ccy, grp in df_e_intl.groupby('currency'):
        vol, chg = float(grp['amount_inr'].sum()), float(grp['total_charges'].sum())
        fx_a_by_currency[ccy] = {
            'volume': round(vol, 2), 'charges': round(chg, 2),
            'count': len(grp), 'rate': eff_rate(chg, vol)}
    fx_a_by_currency = dict(sorted(fx_a_by_currency.items(), key=lambda x: -x[1]['volume']))

# Gateway B — domestic (country=IN) vs international
gwb_dom  = gwb_charges[gwb_charges['country'] == 'IN']
gwb_intl = gwb_charges[gwb_charges['country'].fillna('Unknown') != 'IN']

fx_b_dom  = {'volume': float(gwb_dom['gross'].sum()),
             'charges': float(gwb_dom['fee'].sum()), 'count': len(gwb_dom)}
fx_b_intl = {'volume': float(gwb_intl['gross'].sum()),
             'charges': float(gwb_intl['fee'].sum()), 'count': len(gwb_intl)}

# Intl by country
fx_b_by_country = {}
if len(gwb_intl) > 0:
    for country, grp in gwb_intl.groupby(gwb_intl['country'].fillna('Unknown')):
        vol, chg = float(grp['gross'].sum()), float(grp['fee'].sum())
        fx_b_by_country[country] = {
            'volume': round(vol, 2), 'charges': round(chg, 2),
            'count': len(grp), 'rate': eff_rate(chg, vol)}
    fx_b_by_country = dict(sorted(fx_b_by_country.items(), key=lambda x: -x[1]['volume'])[:15])

def fx_summary(dom, intl):
    dom_rate  = eff_rate(dom['charges'], dom['volume'])
    intl_rate = eff_rate(intl['charges'], intl['volume'])
    premium   = round(intl_rate - dom_rate, 2) if intl['volume'] > 0 else None
    return {
        'domestic':      {'volume': round(dom['volume'], 2), 'charges': round(dom['charges'], 2),
                          'count': dom['count'], 'rate': dom_rate},
        'international': {'volume': round(intl['volume'], 2), 'charges': round(intl['charges'], 2),
                          'count': intl['count'], 'rate': intl_rate},
        'fx_premium_pct': premium,
    }

fx_analysis = {
    'gatewayA': {**fx_summary(fx_a_dom, fx_a_intl), 'intl_by_currency': fx_a_by_currency},
    'gatewayB': {**fx_summary(fx_b_dom, fx_b_intl), 'intl_by_country': fx_b_by_country},
}

print(f"  Gateway A — Dom: {fx_a_dom['count']} txns @ {eff_rate(fx_a_dom['charges'], fx_a_dom['volume'])}% "
      f"| Intl: {fx_a_intl['count']} txns @ {eff_rate(fx_a_intl['charges'], fx_a_intl['volume'])}%")
print(f"  Gateway B — Dom: {fx_b_dom['count']} txns @ {eff_rate(fx_b_dom['charges'], fx_b_dom['volume'])}% "
      f"| Intl: {fx_b_intl['count']} txns @ {eff_rate(fx_b_intl['charges'], fx_b_intl['volume'])}%")
print(f"  FX premium: Gw A = {fx_analysis['gatewayA']['fx_premium_pct']}pp "
      f"| Gw B = {fx_analysis['gatewayB']['fx_premium_pct']}pp")


# ══════════════════════════════════════════════════════════════
# Step 14: Rate Renegotiation Recommendations
# ══════════════════════════════════════════════════════════════
print("Generating rate renegotiation recommendations...")

# Group overcharges by method+scope for pattern analysis
df_oc['oc_category'] = np.where(
    df_oc['international'] == 1,
    'International ' + df_oc['method'].str.title(),
    'Domestic ' + df_oc['method'].str.title())

renegotiation = []
if len(df_oc) > 0:
    for cat, grp in df_oc.groupby('oc_category'):
        total_oc     = float(grp['overcharge'].sum())
        vol_affected = float(grp['amount_inr'].sum())
        expected     = float(grp['expected_rate'].iloc[0])
        max_actual   = float(grp['actual_rate'].max())
        avg_rate = eff_rate(total_oc + vol_affected * expected / 100, vol_affected) if vol_affected > 0 else 0
        target   = min(expected + 0.25, avg_rate)
        renegotiation.append({
            'category': cat, 'overcharge_count': len(grp),
            'total_overcharge': round(total_oc, 2), 'volume_affected': round(vol_affected, 2),
            'contracted_rate': expected, 'avg_actual_rate': round(avg_rate, 2),
            'max_actual_rate': max_actual,
            'recommended_action': f"Renegotiate {cat} rate from {avg_rate}% down to {expected}% (contracted). Recoverable: INR {round(total_oc, 0):,.0f}",
        })
    renegotiation.sort(key=lambda x: -x['total_overcharge'])

# Network-level recommendations
network_reco = []
if len(df_oc) > 0:
    for n, grp in df_oc.groupby(df_oc['card_network'].fillna('Other')):
        network_reco.append({
            'network': n, 'overcharge_count': len(grp),
            'total_overcharge': round(float(grp['overcharge'].sum()), 2),
            'avg_actual_rate': round(float(grp['actual_rate'].mean()), 2),
        })
    network_reco.sort(key=lambda x: -x['total_overcharge'])

# Gateway cost comparison
gw_b_vs_a_premium = round(eff_rate(gw_b_total_charges, gw_b_vol) - eff_rate(gw_a_total_charges, gw_a_vol), 2)

reco_data = {
    'by_category':    renegotiation,
    'by_network':     network_reco,
    'gateway_comparison': {
        'gateway_a_rate':  eff_rate(gw_a_total_charges, gw_a_vol),
        'gateway_b_rate':  eff_rate(gw_b_total_charges, gw_b_vol),
        'rate_premium_pp': gw_b_vs_a_premium,
        'recommendation':  f"Gateway B is {gw_b_vs_a_premium}pp more expensive than Gateway A overall. "
                           f"Route Visa/MasterCard/Amex through Gateway A where possible to save INR {total_saving:,.0f}/month.",
    },
    'total_recoverable':    total_overcharge,
    'total_monthly_saving': total_saving,
    'summary': [
        f"1. RECOVER INR {total_overcharge:,.0f} from {len(overcharges)} overcharged transactions by raising billing disputes with Gateway A.",
        f"2. RENEGOTIATE rates for {len(renegotiation)} overcharged categories (see table below).",
        f"3. ROUTE {sum(s['total_volume'] for s in savings_items):,.0f} INR of card volume through Gateway A (cheapest for Visa, MasterCard, Amex) to save INR {total_saving:,.0f}/month ({round(total_saving*12):,}/yr).",
        f"4. INVESTIGATE Gateway B's {gw_b_vs_a_premium}pp rate premium — push for rate parity or shift volume.",
        f"5. AUDIT international transactions — FX premium of {fx_analysis['gatewayA']['fx_premium_pct']}pp on Gateway A, {fx_analysis['gatewayB']['fx_premium_pct']}pp on Gateway B. Negotiate FX markup caps.",
    ]
}

print(f"  {len(renegotiation)} renegotiation categories identified")
for r in reco_data['summary']:
    print(f"  >> {r}")


# ══════════════════════════════════════════════════════════════
# Step 15: Assemble Dashboard Data JSON
# ══════════════════════════════════════════════════════════════
print("\nAssembling JSON output...")

# Convert refund items to serializable dicts
refund_items = [{
    'id': r['id'], 'amount': round(float(r['amount']), 2), 'currency': r['currency'],
    'payment_id': r['payment_id'],
    'created_at': r['created_at'].isoformat() if pd.notna(r['created_at']) else None,
    'status': r['status'],
} for _, r in df_refund.iterrows()]

dashboard_data = {
    'period':       'September 2026',
    'generated_at': datetime.now().isoformat(),

    'overview': {
        'gatewayA': {
            'name':               'Gateway A',
            'total_volume':       round(gw_a_vol, 2),
            'total_charges':      round(gw_a_total_charges, 2),
            'effective_rate':     eff_rate(gw_a_total_charges, gw_a_vol),
            'txn_count':          gw_a_txn_count,
            'failed_count':       fail_count,
            'total_payments':     total_pay_count,
            'failure_rate':       round(fail_count / total_pay_count * 100, 2) if total_pay_count else 0,
            'refund_count':       len(df_refund),
            'refund_volume':      round(float(df_refund['amount'].sum()), 2),
            'avg_settlement_days': round(float(settle_a.mean()), 1) if len(settle_a) > 0 else 0,
            'min_settlement_days': int(settle_a.min()) if len(settle_a) > 0 else 0,
            'max_settlement_days': int(settle_a.max()) if len(settle_a) > 0 else 0,
            'settlement_distribution': {str(int(k)): int(v) for k, v in settle_dist_a.items()},
            'adj_deductions':     round(adj_deductions, 2),
            'domestic':           summarize(by_scope['domestic']['volume'], by_scope['domestic']['charges'], by_scope['domestic']['count']),
            'international':      summarize(by_scope['international']['volume'], by_scope['international']['charges'], by_scope['international']['count']),
        },
        'gatewayB': {
            'name':               'Gateway B',
            'total_volume':       round(gw_b_vol, 2),
            'total_charges':      round(gw_b_total_charges, 2),
            'effective_rate':     eff_rate(gw_b_total_charges, gw_b_vol),
            'txn_count':          gw_b_txn_count,
            'refund_count':       len(gwb_refunds),
            'refund_volume':      round(float(gwb_refunds['gross'].abs().sum()), 2),
            'dispute_count':      len(gwb_disputes),
            'standalone_fees':    round(gw_b_standalone_fee, 2),
            'tds_amount':         round(gw_b_tds_amount, 2),
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
        'gatewayA': {'count': len(df_refund), 'volume': round(float(df_refund['amount'].sum()), 2),
                     'items': refund_items},
        'gatewayB': {'count': len(gwb_refunds), 'volume': round(float(gwb_refunds['gross'].abs().sum()), 2)},
    },
}

# Write output
out_path = os.path.join(DATA_DIR, 'dashboard_data.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(dashboard_data, f, indent=2, default=str)

print(f"\nDone. Output: {out_path}")
print(f"Gateway A: {gw_a_txn_count} txns | INR {gw_a_vol:,.2f} vol | "
      f"{eff_rate(gw_a_total_charges, gw_a_vol)}% eff rate | "
      f"{round(float(settle_a.mean()), 1) if len(settle_a) else 0}d settle")
print(f"Gateway B: {gw_b_txn_count} txns | INR {gw_b_vol:,.2f} vol | "
      f"{eff_rate(gw_b_total_charges, gw_b_vol)}% eff rate | "
      f"{round(float(settle_b.mean()), 1) if len(settle_b) else 0}d settle")
print(f"Reconciliation mismatches: {len(mismatches)} | Fee diff total: INR {total_fee_diff}")
print(f"Overcharges: {len(overcharges)} txns | INR {total_overcharge} recoverable")
print(f"Savings from smart routing: INR {total_saving}/mo | INR {total_saving * 12}/yr")
