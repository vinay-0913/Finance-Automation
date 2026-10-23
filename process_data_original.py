"""
process_data.py — Payment Gateway Cost & Settlement Analysis
Pre-processes all 4 Excel files and outputs dashboard_data.json.

KEY DESIGN:
  - Gateway A has 3 files: payments (metadata + fx amount), transactions (INR amounts), refunds
  - For effective rate calculation we ALWAYS use the transactions file (everything in INR)
  - Payments file is used for metadata: method, currency, card network, international flag
  - Join key: payments.id == transactions.entity_id (for type='payment')
"""

import openpyxl
import json
import os
from datetime import datetime
from collections import defaultdict

DATA_DIR = r"d:\Cutemath Automation"

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────
def safe_float(v, default=0.0):
    if v is None: return default
    try: return float(v)
    except: return default

def safe_int(v, default=0):
    if v is None: return default
    try: return int(v)
    except: return default

def parse_date(s):
    if s is None: return None
    if isinstance(s, datetime): return s
    s = str(s).strip()
    for fmt in ('%d/%m/%Y %H:%M:%S', '%d-%m-%Y', '%Y-%m-%d', '%d/%m/%Y', '%Y-%m-%dT%H:%M:%S'):
        try: return datetime.strptime(s, fmt)
        except: pass
    return None

def parse_date_iso(s):
    d = parse_date(s)
    return d.isoformat() if d else None

def rate(charges, volume):
    """Safe effective rate %"""
    return round(charges / volume * 100, 2) if volume and volume > 0 else 0.0

# ──────────────────────────────────────────────────────────────
# Step 1: Read GatewayA Payments (metadata file)
# Row 1 = blank, Row 2 = headers, Row 3+ = data
# amount = customer-facing currency (AED/EUR/GBP/INR) — NOT used for INR rate math
# fee, tax = in INR — used for charges
# ──────────────────────────────────────────────────────────────
print("Reading GatewayA Payments (metadata)...")
wb = openpyxl.load_workbook(os.path.join(DATA_DIR, "GatewayA_payments_Sep26_dummy.xlsx"), read_only=True, data_only=True)
ws = wb['Sheet1']

# Map: payment_id -> metadata
gw_a_pay_meta = {}
gw_a_all_statuses = []
for row in ws.iter_rows(min_row=3, values_only=True):   # row1=blank, row2=headers, row3+=data
    pay_id = row[0]
    if not pay_id: continue
    rec = {
        'id':              pay_id,
        'fx_amount':       safe_float(row[1]),   # customer-facing amount (foreign ccy)
        'currency':        row[2],               # customer-facing currency
        'status':          row[3],
        'international':   safe_int(row[6]),
        'method':          row[7] or 'unknown',
        'amount_refunded': safe_float(row[8]),
        'fee_inr':         safe_float(row[21]),  # INR — used as cross-check only
        'tax_inr':         safe_float(row[22]),  # INR — used as cross-check only
        'created_at':      parse_date_iso(row[25]),
        'card_type':       row[26],
        'card_network':    row[27],
    }
    gw_a_pay_meta[pay_id] = rec
    gw_a_all_statuses.append(rec['status'])

wb.close()
print(f"  {len(gw_a_pay_meta)} payment records")

# ──────────────────────────────────────────────────────────────
# Step 2: Read GatewayA Transactions (settlement / INR ledger)
# Row 1 = headers, Row 2+ = data
# amount = INR (authoritative), fee = INR, tax = INR
# entity_id matches payments.id for type='payment'
# ──────────────────────────────────────────────────────────────
print("Reading GatewayA Transactions (INR ledger)...")
wb = openpyxl.load_workbook(os.path.join(DATA_DIR, "GatewayA_transactions_Sep26_dummy.xlsx"), read_only=True, data_only=True)
ws = wb['Sheet1']

gw_a_txns = []
for row in ws.iter_rows(min_row=2, values_only=True):   # row1=headers, row2+=data
    entity_id = row[0]
    if not entity_id: continue
    rec = {
        'entity_id':    entity_id,
        'type':         row[1],
        'debit':        safe_float(row[2]),
        'credit':       safe_float(row[3]),
        'amount_inr':   safe_float(row[4]),    # INR — AUTHORITATIVE
        'currency':     row[5],                # should always be INR
        'fee_inr':      safe_float(row[6]),    # INR fee charged by gateway
        'tax_inr':      safe_float(row[7]),    # GST on fee
        'on_hold':      safe_int(row[8]),
        'settled':      safe_int(row[9]),
        'created_at':   parse_date(row[10]),
        'settled_at':   parse_date(row[11]),
        'settlement_id':row[12],
        'method':       row[20],
        'card_network': row[22],
        'card_type':    row[24],
    }
    gw_a_txns.append(rec)

wb.close()
print(f"  {len(gw_a_txns)} transaction records")

# ──────────────────────────────────────────────────────────────
# Step 3: Read GatewayA Refunds
# Row 1 = blank, Row 2 = headers, Row 3+ = data
# ──────────────────────────────────────────────────────────────
print("Reading GatewayA Refunds...")
wb = openpyxl.load_workbook(os.path.join(DATA_DIR, "GatewayA_refunds_Sep26_dummy.xlsx"), read_only=True, data_only=True)
ws = wb['Sheet1']

gw_a_refunds = []
for row in ws.iter_rows(min_row=3, values_only=True):
    if not row[0]: continue
    gw_a_refunds.append({
        'id':         row[0],
        'amount':     safe_float(row[1]),
        'currency':   row[2],
        'payment_id': row[3],
        'created_at': parse_date_iso(row[6]),
        'status':     row[10],
    })

wb.close()
print(f"  {len(gw_a_refunds)} refund records")

# ──────────────────────────────────────────────────────────────
# Step 4: Read GatewayB (single combined ledger)
# Row 1 = blank, Row 2 = headers, Row 3+ = data
# gross/fee/net all in INR; customer_facing_amount in customer ccy
# ──────────────────────────────────────────────────────────────
print("Reading GatewayB...")
wb = openpyxl.load_workbook(os.path.join(DATA_DIR, "GatewayB_Sep26_dummy.xlsx"), read_only=True, data_only=True)
ws = wb["GatewayB Sep'26"]

gw_b_txns = []
for row in ws.iter_rows(min_row=3, values_only=True):
    if not row[0]: continue
    gw_b_txns.append({
        'balance_transaction_id': row[0],
        'created':                row[2],       # datetime
        'available_on':           row[4],       # datetime (settlement date)
        'currency':               row[5],       # INR always
        'gross':                  safe_float(row[6]),   # INR
        'fee':                    safe_float(row[7]),   # INR
        'net':                    safe_float(row[8]),   # INR
        'reporting_category':     row[9],       # charge / refund / fee / dispute / tax
        'source_id':              row[10],
        'cf_amount':              safe_float(row[12]),  # customer-facing amount
        'cf_currency':            (row[13] or '').upper(),
        'country':                row[16],
        'payout_id':              row[20],
        'payout_effective_at':    row[22],      # datetime
        'payment_method':         row[60],
        'card_brand':             row[62],
        'card_funding':           row[64],
        'card_country':           row[65],
    })

wb.close()
print(f"  {len(gw_b_txns)} GatewayB records")

# ──────────────────────────────────────────────────────────────
# Step 5: Build enriched payment records
# Join: transactions (INR source of truth) LEFT JOIN payments metadata
# Primary source for amounts/fees = transactions file
# Primary source for metadata = payments file
# ──────────────────────────────────────────────────────────────
print("\nBuilding enriched payment records...")

# Index payment transactions from ledger (type='payment')
txn_by_id = {t['entity_id']: t for t in gw_a_txns if t['type'] == 'payment'}

# Build enriched records — start from transactions (authoritative amounts)
enriched = []
for txn in gw_a_txns:
    if txn['type'] != 'payment':
        continue
    meta = gw_a_pay_meta.get(txn['entity_id'], {})
    rec = {
        'id':           txn['entity_id'],
        'amount_inr':   txn['amount_inr'],      # AUTHORITATIVE INR amount
        'fee_inr':      txn['fee_inr'],         # AUTHORITATIVE INR fee
        'tax_inr':      txn['tax_inr'],         # AUTHORITATIVE INR tax
        'total_charges': txn['fee_inr'] + txn['tax_inr'],
        'fx_amount':    meta.get('fx_amount', 0),
        'currency':     meta.get('currency', 'INR'),
        'status':       meta.get('status', 'captured'),
        'international':meta.get('international', 0),
        'method':       meta.get('method') or txn.get('method') or 'card',
        'card_network': meta.get('card_network') or txn.get('card_network') or 'Other',
        'card_type':    meta.get('card_type') or txn.get('card_type'),
        'created_at':   txn['created_at'],
        'settled_at':   txn['settled_at'],
        'settled':      txn['settled'],
    }
    enriched.append(rec)

print(f"  {len(enriched)} enriched payment records")

# ──────────────────────────────────────────────────────────────
# Step 6: Gateway A Analytics (all in INR)
# ──────────────────────────────────────────────────────────────
print("Computing Gateway A analytics...")

gw_a_vol   = sum(r['amount_inr'] for r in enriched)
gw_a_fee   = sum(r['fee_inr']    for r in enriched)
gw_a_tax   = sum(r['tax_inr']    for r in enriched)
gw_a_total_charges = gw_a_fee + gw_a_tax
gw_a_txn_count     = len(enriched)

# Fail count from payments metadata
fail_count    = sum(1 for s in gw_a_all_statuses if s == 'failed')
total_pay_count = len(gw_a_all_statuses)

# By method
by_method = defaultdict(lambda: {'volume': 0, 'count': 0, 'charges': 0})
for r in enriched:
    m = r['method']
    by_method[m]['volume']  += r['amount_inr']
    by_method[m]['charges'] += r['total_charges']
    by_method[m]['count']   += 1

# By currency (metadata — fx amounts)
by_currency_a = defaultdict(lambda: {'fx_volume': 0, 'inr_volume': 0, 'count': 0, 'charges': 0})
for r in enriched:
    c = r['currency']
    by_currency_a[c]['fx_volume']  += r['fx_amount']
    by_currency_a[c]['inr_volume'] += r['amount_inr']
    by_currency_a[c]['count']      += 1
    by_currency_a[c]['charges']    += r['total_charges']

# By card network
by_network_a = defaultdict(lambda: {'volume': 0, 'count': 0, 'charges': 0})
for r in enriched:
    n = r['card_network'] or 'Other'
    by_network_a[n]['volume']  += r['amount_inr']
    by_network_a[n]['charges'] += r['total_charges']
    by_network_a[n]['count']   += 1

# Domestic vs international
by_scope = {'domestic': {'volume':0,'count':0,'charges':0}, 'international': {'volume':0,'count':0,'charges':0}}
for r in enriched:
    key = 'international' if r['international'] else 'domestic'
    by_scope[key]['volume']  += r['amount_inr']
    by_scope[key]['count']   += 1
    by_scope[key]['charges'] += r['total_charges']

# Settlement time (created → settled, in days)
settle_days = []
for r in enriched:
    if r['created_at'] and r['settled_at']:
        diff = (r['settled_at'].date() - r['created_at'].date()).days
        settle_days.append(diff)

settle_dist_a = defaultdict(int)
for d in settle_days: settle_dist_a[d] += 1

# Non-payment transactions (adjustments, offer_settlements etc.)
other_txns = [t for t in gw_a_txns if t['type'] not in ('payment',)]
adj_deductions = sum(t['debit'] for t in other_txns if t['type'] == 'adjustment')

# ──────────────────────────────────────────────────────────────
# Step 7: Gateway B Analytics
# ──────────────────────────────────────────────────────────────
print("Computing Gateway B analytics...")

gw_b_charges  = [t for t in gw_b_txns if t['reporting_category'] == 'charge']
gw_b_refunds  = [t for t in gw_b_txns if t['reporting_category'] == 'refund']
gw_b_fees_raw = [t for t in gw_b_txns if t['reporting_category'] == 'fee']
gw_b_disputes = [t for t in gw_b_txns if t['reporting_category'] == 'dispute']
# TDS (Tax Deducted at Source): govt withholding tax deducted from payout.
# reporting_category='tax', gross = positive amount deducted — a real gateway cost.
gw_b_tds      = [t for t in gw_b_txns if t['reporting_category'] == 'tax']

gw_b_vol            = sum(t['gross'] for t in gw_b_charges)
gw_b_fee            = sum(t['fee']   for t in gw_b_charges)
gw_b_standalone_fee = sum(abs(t['gross']) for t in gw_b_fees_raw)
gw_b_tds_amount     = sum(t['gross']     for t in gw_b_tds)   # TDS is positive debit from payout
gw_b_total_charges  = gw_b_fee + gw_b_standalone_fee + gw_b_tds_amount
gw_b_txn_count      = len(gw_b_charges)
print(f"  GatewayB TDS rows: {len(gw_b_tds)}, TDS amount: INR {gw_b_tds_amount:.2f}")

# By country
by_country = defaultdict(lambda: {'volume': 0, 'count': 0, 'charges': 0})
for t in gw_b_charges:
    c = t['country'] or 'Unknown'
    by_country[c]['volume']  += t['gross']
    by_country[c]['count']   += 1
    by_country[c]['charges'] += t['fee']

# By customer-facing currency
by_currency_b = defaultdict(lambda: {'volume': 0, 'count': 0, 'charges': 0})
for t in gw_b_charges:
    c = t['cf_currency'] or 'UNKNOWN'
    by_currency_b[c]['volume']  += t['gross']
    by_currency_b[c]['count']   += 1
    by_currency_b[c]['charges'] += t['fee']

# By card brand
by_brand_b = defaultdict(lambda: {'volume': 0, 'count': 0, 'charges': 0})
for t in gw_b_charges:
    b = t['card_brand'] or 'Other'
    by_brand_b[b]['volume']  += t['gross']
    by_brand_b[b]['count']   += 1
    by_brand_b[b]['charges'] += t['fee']

# By card funding
by_funding_b = defaultdict(lambda: {'volume': 0, 'count': 0, 'charges': 0})
for t in gw_b_charges:
    f = t['card_funding'] or 'unknown'
    by_funding_b[f]['volume']  += t['gross']
    by_funding_b[f]['count']   += 1
    by_funding_b[f]['charges'] += t['fee']

# Settlement time (created → available_on, in days)
settle_days_b = []
for t in gw_b_charges:
    d1 = t['created'].date()    if isinstance(t['created'], datetime)    else None
    d2 = t['available_on'].date() if isinstance(t['available_on'], datetime) else None
    if d1 and d2:
        settle_days_b.append((d2 - d1).days)

settle_dist_b = defaultdict(int)
for d in settle_days_b: settle_dist_b[d] += 1

# ──────────────────────────────────────────────────────────────
# Step 8: Cross-gateway card network comparison (both in INR)
# ──────────────────────────────────────────────────────────────
print("Building cross-gateway comparison...")

all_networks = set(list(by_network_a.keys()) + list(by_brand_b.keys()))
by_card_network = {}
for n in all_networks:
    entry = {}
    a = by_network_a.get(n)
    b = by_brand_b.get(n)
    if a and a['volume'] > 0:
        entry['gatewayA'] = {
            'volume': round(a['volume'], 2), 'count': a['count'],
            'charges': round(a['charges'], 2), 'rate': rate(a['charges'], a['volume'])
        }
    if b and b['volume'] > 0:
        entry['gatewayB'] = {
            'volume': round(b['volume'], 2), 'count': b['count'],
            'charges': round(b['charges'], 2), 'rate': rate(b['charges'], b['volume'])
        }
    if entry:
        by_card_network[n] = entry

# ──────────────────────────────────────────────────────────────
# Step 9: Reconciliation
# Compare payments file fee (INR) vs transactions file fee (INR)
# The amount comparison is skipped for foreign currency payments
# ──────────────────────────────────────────────────────────────
print("Running reconciliation...")

mismatches = []
for pay_id, meta in gw_a_pay_meta.items():
    if meta['status'] != 'captured':
        continue
    txn = txn_by_id.get(pay_id)
    if not txn:
        mismatches.append({
            'payment_id': pay_id,
            'issue': 'No matching transaction record',
            'currency': meta['currency'],
            'method': meta['method'],
            'pay_fee': round(meta['fee_inr'], 2),
            'txn_fee': None,
            'fee_diff': None,
            'pay_tax': round(meta['tax_inr'], 2),
            'txn_tax': None,
            'tax_diff': None,
        })
    else:
        # Both fees are in INR — safe to compare
        fee_diff = round(meta['fee_inr'] - txn['fee_inr'], 2)
        tax_diff = round(meta['tax_inr'] - txn['tax_inr'], 2)
        if abs(fee_diff) > 0.5 or abs(tax_diff) > 0.5:  # >50 paise tolerance
            mismatches.append({
                'payment_id': pay_id,
                'issue': 'Fee/tax mismatch between payment and transaction records',
                'currency': meta['currency'],
                'method': meta['method'],
                'pay_fee': round(meta['fee_inr'], 2),
                'txn_fee': round(txn['fee_inr'], 2),
                'fee_diff': fee_diff,
                'pay_tax': round(meta['tax_inr'], 2),
                'txn_tax': round(txn['tax_inr'], 2),
                'tax_diff': tax_diff,
            })

# Payments with no transaction at all (unsettled)
pay_ids_with_txn = set(txn_by_id.keys())
pay_ids_captured = {pid for pid, m in gw_a_pay_meta.items() if m['status'] == 'captured'}
unsettled = pay_ids_captured - pay_ids_with_txn
for pid in unsettled:
    meta = gw_a_pay_meta[pid]
    mismatches.append({'payment_id': pid, 'issue': 'Captured payment has no settlement transaction', 'currency': meta['currency'], 'method': meta['method'], 'pay_fee': round(meta['fee_inr'], 2), 'txn_fee': None, 'fee_diff': None, 'pay_tax': round(meta['tax_inr'], 2), 'txn_tax': None, 'tax_diff': None})

total_fee_diff = round(sum(m['fee_diff'] or 0 for m in mismatches), 2)
total_tax_diff = round(sum(m['tax_diff'] or 0 for m in mismatches), 2)
print(f"  {len(mismatches)} mismatches (fee diff total: INR {total_fee_diff})")

# ──────────────────────────────────────────────────────────────
# Step 10: Overcharge Detection
# Use enriched records (INR amount + INR fee) for correct rate math
# ──────────────────────────────────────────────────────────────
print("Detecting overcharges...")

# Contracted / expected rates (%)
RATES = {
    'upi':              0.0,
    'emi':              2.5,
    'domestic_card':    2.0,
    'intl_card':        3.0,
}

overcharges = []
for r in enriched:
    if r['amount_inr'] <= 0: continue
    actual_rate = rate(r['total_charges'], r['amount_inr'])

    m = r['method']
    if m == 'upi':
        expected = RATES['upi']
    elif m == 'emi':
        expected = RATES['emi']
    elif r['international']:
        expected = RATES['intl_card']
    else:
        expected = RATES['domestic_card']

    if actual_rate > expected + 0.5:   # 0.5% tolerance
        overcharges.append({
            'payment_id':    r['id'],
            'currency':      r['currency'],
            'amount_inr':    round(r['amount_inr'], 2),
            'method':        m,
            'international': r['international'],
            'card_network':  r['card_network'],
            'expected_rate': expected,
            'actual_rate':   actual_rate,
            'expected_fee':  round(r['amount_inr'] * expected / 100, 2),
            'actual_fee':    round(r['total_charges'], 2),
            'overcharge':    round(r['total_charges'] - r['amount_inr'] * expected / 100, 2),
        })

total_overcharge = round(sum(o['overcharge'] for o in overcharges), 2)
print(f"  {len(overcharges)} overcharged transactions, total INR {total_overcharge}")

# ──────────────────────────────────────────────────────────────
# Step 11: Savings Model
# For each card network present in both gateways, find cheapest
# ──────────────────────────────────────────────────────────────
print("Building savings model...")

savings_items = []
for n, data in by_card_network.items():
    a = data.get('gatewayA')
    b = data.get('gatewayB')
    if not (a and b):
        continue
    total_vol     = a['volume'] + b['volume']
    total_charges = a['charges'] + b['charges']
    if a['rate'] <= b['rate']:
        cheapest, cheapest_rate = 'Gateway A', a['rate']
    else:
        cheapest, cheapest_rate = 'Gateway B', b['rate']

    optimized = total_vol * cheapest_rate / 100
    saving    = total_charges - optimized
    savings_items.append({
        'network':          n,
        'total_volume':     round(total_vol, 2),
        'gateway_a_rate':   a['rate'],
        'gateway_b_rate':   b['rate'],
        'cheapest_gateway': cheapest,
        'current_charges':  round(total_charges, 2),
        'optimized_charges':round(optimized, 2),
        'potential_saving': round(saving, 2),
        'saving_pct':       round(saving / total_charges * 100, 2) if total_charges > 0 else 0,
    })

total_saving = round(sum(s['potential_saving'] for s in savings_items), 2)
print(f"  Potential saving: INR {total_saving}")

# ──────────────────────────────────────────────────────────────
# Step 12: Week-wise Time-Series Aggregation
# Groups data by ISO week for trend analysis within the period.
# If multiple months existed, this would naturally extend to monthly.
# ──────────────────────────────────────────────────────────────
print("Building week-wise time-series...")

def week_label(dt):
    """Return 'W<num> <Mon DD>' label for a datetime."""
    if dt is None: return 'Unknown'
    iso_yr, iso_wk, _ = dt.isocalendar()
    return f'W{iso_wk}'

def month_key(dt):
    """Return 'YYYY-MM' key."""
    if dt is None: return 'Unknown'
    return dt.strftime('%Y-%m')

# Gateway A: week-wise from enriched records
weekly_a = defaultdict(lambda: {'volume': 0, 'charges': 0, 'count': 0, 'settle_sum': 0, 'settle_count': 0})
monthly_a = defaultdict(lambda: {'volume': 0, 'charges': 0, 'count': 0, 'settle_sum': 0, 'settle_count': 0})
for r in enriched:
    wk = week_label(r['created_at'])
    mk = month_key(r['created_at'])
    for bucket, key in [(weekly_a, wk), (monthly_a, mk)]:
        bucket[key]['volume']  += r['amount_inr']
        bucket[key]['charges'] += r['total_charges']
        bucket[key]['count']   += 1
        if r['created_at'] and r['settled_at']:
            diff = (r['settled_at'].date() - r['created_at'].date()).days
            bucket[key]['settle_sum']   += diff
            bucket[key]['settle_count'] += 1

# Gateway B: week-wise from charge records
weekly_b = defaultdict(lambda: {'volume': 0, 'charges': 0, 'count': 0, 'settle_sum': 0, 'settle_count': 0})
monthly_b = defaultdict(lambda: {'volume': 0, 'charges': 0, 'count': 0, 'settle_sum': 0, 'settle_count': 0})
for t in gw_b_charges:
    d1 = t['created'] if isinstance(t['created'], datetime) else None
    d2 = t['available_on'] if isinstance(t['available_on'], datetime) else None
    wk = week_label(d1)
    mk = month_key(d1)
    for bucket, key in [(weekly_b, wk), (monthly_b, mk)]:
        bucket[key]['volume']  += t['gross']
        bucket[key]['charges'] += t['fee']
        bucket[key]['count']   += 1
        if d1 and d2:
            bucket[key]['settle_sum']   += (d2.date() - d1.date()).days
            bucket[key]['settle_count'] += 1

def build_timeseries(bucket):
    """Convert a weekly/monthly bucket into a sorted list of records."""
    result = []
    for key in sorted(bucket.keys()):
        b = bucket[key]
        avg_settle = round(b['settle_sum'] / b['settle_count'], 1) if b['settle_count'] > 0 else None
        result.append({
            'period': key,
            'volume': round(b['volume'], 2),
            'charges': round(b['charges'], 2),
            'count': b['count'],
            'rate': rate(b['charges'], b['volume']),
            'avg_settlement_days': avg_settle,
        })
    return result

ts_weekly_a  = build_timeseries(weekly_a)
ts_weekly_b  = build_timeseries(weekly_b)
ts_monthly_a = build_timeseries(monthly_a)
ts_monthly_b = build_timeseries(monthly_b)
print(f"  Gateway A: {len(ts_weekly_a)} weeks, {len(ts_monthly_a)} months")
print(f"  Gateway B: {len(ts_weekly_b)} weeks, {len(ts_monthly_b)} months")

# ──────────────────────────────────────────────────────────────
# Step 13: FX / Cross-Border Fee Isolation
# Separates domestic vs international effective rates per gateway
# and computes the cross-border fee premium.
# ──────────────────────────────────────────────────────────────
print("Isolating FX / cross-border fees...")

# Gateway A — domestic vs international (from enriched records)
fx_a_dom  = {'volume': 0, 'charges': 0, 'count': 0}
fx_a_intl = {'volume': 0, 'charges': 0, 'count': 0}
fx_a_by_currency = defaultdict(lambda: {'volume': 0, 'charges': 0, 'count': 0})
for r in enriched:
    if r['international']:
        fx_a_intl['volume']  += r['amount_inr']
        fx_a_intl['charges'] += r['total_charges']
        fx_a_intl['count']   += 1
        ccy = r['currency']
        fx_a_by_currency[ccy]['volume']  += r['amount_inr']
        fx_a_by_currency[ccy]['charges'] += r['total_charges']
        fx_a_by_currency[ccy]['count']   += 1
    else:
        fx_a_dom['volume']  += r['amount_inr']
        fx_a_dom['charges'] += r['total_charges']
        fx_a_dom['count']   += 1

# Gateway B — domestic (country=IN) vs international
fx_b_dom  = {'volume': 0, 'charges': 0, 'count': 0}
fx_b_intl = {'volume': 0, 'charges': 0, 'count': 0}
fx_b_by_country = defaultdict(lambda: {'volume': 0, 'charges': 0, 'count': 0})
for t in gw_b_charges:
    country = t['country'] or 'Unknown'
    is_intl = (country != 'IN')
    if is_intl:
        fx_b_intl['volume']  += t['gross']
        fx_b_intl['charges'] += t['fee']
        fx_b_intl['count']   += 1
        fx_b_by_country[country]['volume']  += t['gross']
        fx_b_by_country[country]['charges'] += t['fee']
        fx_b_by_country[country]['count']   += 1
    else:
        fx_b_dom['volume']  += t['gross']
        fx_b_dom['charges'] += t['fee']
        fx_b_dom['count']   += 1

def fx_summary(dom, intl):
    dom_rate  = rate(dom['charges'],  dom['volume'])
    intl_rate = rate(intl['charges'], intl['volume'])
    premium   = round(intl_rate - dom_rate, 2) if intl['volume'] > 0 else None
    return {
        'domestic': {
            'volume': round(dom['volume'], 2), 'charges': round(dom['charges'], 2),
            'count': dom['count'], 'rate': dom_rate
        },
        'international': {
            'volume': round(intl['volume'], 2), 'charges': round(intl['charges'], 2),
            'count': intl['count'], 'rate': intl_rate
        },
        'fx_premium_pct': premium,  # how much more intl costs vs domestic (pp)
    }

fx_analysis = {
    'gatewayA': {
        **fx_summary(fx_a_dom, fx_a_intl),
        'intl_by_currency': {
            k: {**{kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()}, 'rate': rate(v['charges'], v['volume'])}
            for k, v in sorted(fx_a_by_currency.items(), key=lambda x: -x[1]['volume'])
        },
    },
    'gatewayB': {
        **fx_summary(fx_b_dom, fx_b_intl),
        'intl_by_country': {
            k: {**{kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()}, 'rate': rate(v['charges'], v['volume'])}
            for k, v in sorted(fx_b_by_country.items(), key=lambda x: -x[1]['volume'])[:15]
        },
    },
}

print(f"  Gateway A — Domestic: {fx_a_dom['count']} txns @ {rate(fx_a_dom['charges'], fx_a_dom['volume'])}% | Intl: {fx_a_intl['count']} txns @ {rate(fx_a_intl['charges'], fx_a_intl['volume'])}%")
print(f"  Gateway B — Domestic: {fx_b_dom['count']} txns @ {rate(fx_b_dom['charges'], fx_b_dom['volume'])}% | Intl: {fx_b_intl['count']} txns @ {rate(fx_b_intl['charges'], fx_b_intl['volume'])}%")
print(f"  FX premium: Gw A = {fx_analysis['gatewayA']['fx_premium_pct']}pp | Gw B = {fx_analysis['gatewayB']['fx_premium_pct']}pp")

# ──────────────────────────────────────────────────────────────
# Step 14: Rate Renegotiation Recommendations
# Analyse overcharge patterns to generate actionable advice.
# ──────────────────────────────────────────────────────────────
print("Generating rate renegotiation recommendations...")

# Group overcharges by method+scope for pattern analysis
oc_by_category = defaultdict(lambda: {'count': 0, 'total_overcharge': 0, 'total_volume': 0,
                                       'max_actual_rate': 0, 'expected_rate': 0})
for o in overcharges:
    if o['international']:
        cat = f"International {o['method'].title()}"
    else:
        cat = f"Domestic {o['method'].title()}"
    oc_by_category[cat]['count']           += 1
    oc_by_category[cat]['total_overcharge'] += o['overcharge']
    oc_by_category[cat]['total_volume']     += o['amount_inr']
    oc_by_category[cat]['max_actual_rate']   = max(oc_by_category[cat]['max_actual_rate'], o['actual_rate'])
    oc_by_category[cat]['expected_rate']     = o['expected_rate']

# Also group by card network
oc_by_network = defaultdict(lambda: {'count': 0, 'total_overcharge': 0, 'avg_actual_rate': 0, 'rates': []})
for o in overcharges:
    n = o['card_network'] or 'Other'
    oc_by_network[n]['count']           += 1
    oc_by_network[n]['total_overcharge'] += o['overcharge']
    oc_by_network[n]['rates'].append(o['actual_rate'])

# Build recommendations
renegotiation = []
for cat, data in sorted(oc_by_category.items(), key=lambda x: -x[1]['total_overcharge']):
    avg_rate = rate(data['total_overcharge'] + data['total_volume'] * data['expected_rate'] / 100, data['total_volume']) if data['total_volume'] > 0 else 0
    # Recommend a target rate: expected + small buffer for volume
    target = min(data['expected_rate'] + 0.25, avg_rate)  # split the difference
    renegotiation.append({
        'category':        cat,
        'overcharge_count':data['count'],
        'total_overcharge':round(data['total_overcharge'], 2),
        'volume_affected': round(data['total_volume'], 2),
        'contracted_rate': data['expected_rate'],
        'avg_actual_rate': round(avg_rate, 2),
        'max_actual_rate': data['max_actual_rate'],
        'recommended_action': f"Renegotiate {cat} rate from {avg_rate}% down to {data['expected_rate']}% (contracted). Recoverable: INR {round(data['total_overcharge'], 0):,.0f}",
    })

# Network-level recommendations
network_reco = []
for n, data in sorted(oc_by_network.items(), key=lambda x: -x[1]['total_overcharge']):
    avg_r = round(sum(data['rates']) / len(data['rates']), 2) if data['rates'] else 0
    network_reco.append({
        'network':          n,
        'overcharge_count': data['count'],
        'total_overcharge': round(data['total_overcharge'], 2),
        'avg_actual_rate':  avg_r,
    })

# Gateway B cost comparison recommendation
gw_b_vs_a_premium = round(rate(gw_b_total_charges, gw_b_vol) - rate(gw_a_total_charges, gw_a_vol), 2)

reco_data = {
    'by_category':    renegotiation,
    'by_network':     network_reco,
    'gateway_comparison': {
        'gateway_a_rate':  rate(gw_a_total_charges, gw_a_vol),
        'gateway_b_rate':  rate(gw_b_total_charges, gw_b_vol),
        'rate_premium_pp': gw_b_vs_a_premium,
        'recommendation':  f"Gateway B is {gw_b_vs_a_premium}pp more expensive than Gateway A overall. Route Visa/MasterCard/Amex through Gateway A where possible to save INR {total_saving:,.0f}/month.",
    },
    'total_recoverable':  total_overcharge,
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

# ──────────────────────────────────────────────────────────────
# Step 12: Assemble Dashboard Data JSON
# ──────────────────────────────────────────────────────────────
def summarize(vol, charges, count):
    return {'volume': round(vol, 2), 'charges': round(charges, 2), 'count': count, 'rate': rate(charges, vol)}

dashboard_data = {
    'period':       'September 2026',
    'generated_at': datetime.now().isoformat(),

    'overview': {
        'gatewayA': {
            'name':               'Gateway A',
            'total_volume':       round(gw_a_vol, 2),
            'total_charges':      round(gw_a_total_charges, 2),
            'effective_rate':     rate(gw_a_total_charges, gw_a_vol),
            'txn_count':          gw_a_txn_count,
            'failed_count':       fail_count,
            'total_payments':     total_pay_count,
            'failure_rate':       round(fail_count / total_pay_count * 100, 2) if total_pay_count else 0,
            'refund_count':       len(gw_a_refunds),
            'refund_volume':      round(sum(r['amount'] for r in gw_a_refunds), 2),
            'avg_settlement_days':round(sum(settle_days) / len(settle_days), 1) if settle_days else 0,
            'min_settlement_days':min(settle_days) if settle_days else 0,
            'max_settlement_days':max(settle_days) if settle_days else 0,
            'settlement_distribution': {str(k): v for k, v in sorted(settle_dist_a.items())},
            'adj_deductions':     round(adj_deductions, 2),
            'domestic':           summarize(by_scope['domestic']['volume'],  by_scope['domestic']['charges'],  by_scope['domestic']['count']),
            'international':      summarize(by_scope['international']['volume'], by_scope['international']['charges'], by_scope['international']['count']),
        },
        'gatewayB': {
            'name':               'Gateway B',
            'total_volume':       round(gw_b_vol, 2),
            'total_charges':      round(gw_b_total_charges, 2),
            'effective_rate':     rate(gw_b_total_charges, gw_b_vol),
            'txn_count':          gw_b_txn_count,
            'refund_count':       len(gw_b_refunds),
            'refund_volume':      round(abs(sum(t['gross'] for t in gw_b_refunds)), 2),
            'dispute_count':      len(gw_b_disputes),
            'standalone_fees':    round(gw_b_standalone_fee, 2),
            'tds_amount':         round(gw_b_tds_amount, 2),      # TDS deducted at source (govt withholding)
            'avg_settlement_days':round(sum(settle_days_b) / len(settle_days_b), 1) if settle_days_b else 0,
            'min_settlement_days':min(settle_days_b) if settle_days_b else 0,
            'max_settlement_days':max(settle_days_b) if settle_days_b else 0,
            'settlement_distribution': {str(k): v for k, v in sorted(settle_dist_b.items())},
        }
    },

    'by_method': {
        k: summarize(v['volume'], v['charges'], v['count'])
        for k, v in sorted(by_method.items(), key=lambda x: -x[1]['volume'])
    },

    'by_currency': {
        'gatewayA': {
            k: {
                'fx_volume':  round(v['fx_volume'], 2),
                'inr_volume': round(v['inr_volume'], 2),
                'count':      v['count'],
                'charges':    round(v['charges'], 2),
                'rate':       rate(v['charges'], v['inr_volume']),
            }
            for k, v in sorted(by_currency_a.items(), key=lambda x: -x[1]['inr_volume'])
        },
        'gatewayB': {
            k: summarize(v['volume'], v['charges'], v['count'])
            for k, v in sorted(by_currency_b.items(), key=lambda x: -x[1]['volume'])
        },
    },

    'by_geography': {
        k: summarize(v['volume'], v['charges'], v['count'])
        for k, v in sorted(by_country.items(), key=lambda x: -x[1]['volume'])
    },

    'by_card_network': by_card_network,

    'by_card_funding': {
        'gatewayB': {
            k: summarize(v['volume'], v['charges'], v['count'])
            for k, v in sorted(by_funding_b.items(), key=lambda x: -x[1]['volume'])
        }
    },

    # NEW: Week-wise and month-wise time-series
    'timeseries': {
        'weekly': {
            'gatewayA': ts_weekly_a,
            'gatewayB': ts_weekly_b,
        },
        'monthly': {
            'gatewayA': ts_monthly_a,
            'gatewayB': ts_monthly_b,
        },
    },

    # NEW: FX / Cross-border fee isolation
    'fx_analysis': fx_analysis,

    'reconciliation': {
        'total_mismatches':  len(mismatches),
        'total_fee_diff':    total_fee_diff,
        'total_tax_diff':    total_tax_diff,
        'unsettled_count':   len(unsettled),
        'mismatches':        sorted(mismatches, key=lambda x: abs(x.get('fee_diff') or 0), reverse=True)[:50],
    },

    'overcharges': {
        'count':           len(overcharges),
        'total_overcharge':total_overcharge,
        'items':           sorted(overcharges, key=lambda x: -x['overcharge'])[:30],
        'contracted_rates': RATES,
    },

    'savings_model': {
        'items':                  sorted(savings_items, key=lambda x: -x['potential_saving']),
        'total_potential_saving': total_saving,
        'annualized_saving':      round(total_saving * 12, 2),
    },

    # NEW: Rate renegotiation recommendations
    'renegotiation': reco_data,

    'failed_transactions': {
        'gatewayA': {'count': fail_count, 'total': total_pay_count, 'failure_rate': round(fail_count / total_pay_count * 100, 2) if total_pay_count else 0}
    },

    'refunds_summary': {
        'gatewayA': {'count': len(gw_a_refunds), 'volume': round(sum(r['amount'] for r in gw_a_refunds), 2), 'items': gw_a_refunds},
        'gatewayB': {'count': len(gw_b_refunds), 'volume': round(abs(sum(t['gross'] for t in gw_b_refunds)), 2)},
    },
}

# Write output
out_path = os.path.join(DATA_DIR, 'dashboard_data.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(dashboard_data, f, indent=2, default=str)

print(f"\nDone. Output: {out_path}")
print(f"Gateway A: {gw_a_txn_count} txns | INR {gw_a_vol:,.2f} vol | {rate(gw_a_total_charges,gw_a_vol)}% eff rate | {round(sum(settle_days)/len(settle_days),1) if settle_days else 0}d settle")
print(f"Gateway B: {gw_b_txn_count} txns | INR {gw_b_vol:,.2f} vol | {rate(gw_b_total_charges,gw_b_vol)}% eff rate | {round(sum(settle_days_b)/len(settle_days_b),1) if settle_days_b else 0}d settle")
print(f"Reconciliation mismatches: {len(mismatches)} | Fee diff total: INR {total_fee_diff}")
print(f"Overcharges: {len(overcharges)} txns | INR {total_overcharge} recoverable")
print(f"Savings from smart routing: INR {total_saving}/mo | INR {total_saving*12}/yr")
