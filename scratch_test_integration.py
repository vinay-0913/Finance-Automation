import urllib.request
import urllib.parse
import json
import os
import time

def encode_multipart_data(data_dict, files_list):
    boundary = '----PayAnalyticsBoundary' + str(int(time.time()))
    body = bytearray()
    for k, v in data_dict.items():
        body.extend(f'--{boundary}\r\n'.encode('utf-8'))
        body.extend(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode('utf-8'))
        body.extend(f'{v}\r\n'.encode('utf-8'))
    for field_name, file_path in files_list:
        fn = os.path.basename(file_path)
        with open(file_path, 'rb') as f:
            content = f.read()
        body.extend(f'--{boundary}\r\n'.encode('utf-8'))
        body.extend(f'Content-Disposition: form-data; name="{field_name}"; filename="{fn}"\r\n'.encode('utf-8'))
        body.extend(b'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n')
        body.extend(content)
        body.extend(b'\r\n')
    body.extend(f'--{boundary}--\r\n'.encode('utf-8'))
    return boundary, bytes(body)

def post_multipart(url, fields, files):
    boundary, body = encode_multipart_data(fields, files)
    req = urllib.request.Request(url, data=body, method='POST')
    req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))

def poll_status(timeout=60):
    start = time.time()
    while time.time() - start < timeout:
        with urllib.request.urlopen('http://localhost:3000/api/status', timeout=5) as r:
            st = json.loads(r.read().decode('utf-8'))
            if st.get('status') in ['done', 'error']:
                return st
        time.sleep(1)
    raise TimeoutError('Polling timed out')

if __name__ == '__main__':
    print('--- Test 1: Inspect Single Consolidated Ledger (Gateway B) ---')
    res1 = post_multipart('http://localhost:3000/api/inspect', {}, [('file_0', 'GatewayB_Sep26_dummy.xlsx')])
    print('Mode:', res1.get('mode'))
    print('Needs mapping:', res1.get('needs_mapping'))
    print('Files inspected:', len(res1.get('files', [])))
    assert res1.get('mode') == 'single_consolidated', 'Expected single_consolidated mode'
    assert not res1.get('needs_mapping'), 'Expected no mapping needed for consolidated ledger'

    print('\n--- Test 2: Inspect Multi-File Split Ledgers (Gateway A) ---')
    gwa_files = [
        ('file_0', 'GatewayA_payments_Sep26_dummy.xlsx'),
        ('file_1', 'GatewayA_transactions_Sep26_dummy.xlsx'),
        ('file_2', 'GatewayA_refunds_Sep26_dummy.xlsx'),
    ]
    res2 = post_multipart('http://localhost:3000/api/inspect', {}, gwa_files)
    print('Mode:', res2.get('mode'))
    print('Needs mapping:', res2.get('needs_mapping'))
    print('Suggested mapping:', res2.get('suggested_mapping'))
    for f in res2.get('files', []):
        print(f"  {f['filename']}: role={f['role']}, candidate_ids={f['candidate_ids']}")
    assert res2.get('mode') == 'multi_file_join', 'Expected multi_file_join mode'
    assert res2.get('suggested_mapping') == {'payment_key': 'id', 'settlement_key': 'entity_id'}, 'Expected id <-> entity_id mapping'

    print('\n--- Test 3: Upload Single Consolidated File (Gateway B) ---')
    up1 = post_multipart('http://localhost:3000/api/upload', {'months': 'September 2026'}, [('file_0', 'GatewayB_Sep26_dummy.xlsx')])
    print('Upload response:', up1)
    st1 = poll_status(90)
    print('Status after upload:', st1.get('status'))
    print('Step:', st1.get('step'))
    data1 = st1.get('data', {})
    print('Calculated mode:', data1.get('mode'))
    print('Overview Gateway B volume:', data1.get('overview', {}).get('gatewayB', {}).get('total_volume'))
    assert st1.get('status') == 'done', f"Expected status done, got {st1.get('status')}: {st1.get('error')}"

    print('\n--- Test 4: Upload Multi-File Dataset (All 4 Files) with Months Scope ---')
    all_4 = [
        ('file_0', 'GatewayA_payments_Sep26_dummy.xlsx'),
        ('file_1', 'GatewayA_transactions_Sep26_dummy.xlsx'),
        ('file_2', 'GatewayA_refunds_Sep26_dummy.xlsx'),
        ('file_3', 'GatewayB_Sep26_dummy.xlsx'),
    ]
    up2 = post_multipart('http://localhost:3000/api/upload', {
        'months': 'September 2026',
        'mapping': json.dumps({'payment_key': 'id', 'settlement_key': 'entity_id'})
    }, all_4)
    print('Upload response:', up2)
    st2 = poll_status(120)
    print('Status after 4-file upload:', st2.get('status'))
    print('Step:', st2.get('step'))
    data2 = st2.get('data', {})
    print('Calculated mode:', data2.get('mode'))
    print('Master table info:', data2.get('master_table_info'))
    print('\n--- Test 5: Upload via Dynamic gateways_config (Separate Gateway A & Gateway B) ---')
    gw_config = [
        {
            'name': 'Gateway A',
            'file_names': ['GatewayA_payments_Sep26_dummy.xlsx', 'GatewayA_transactions_Sep26_dummy.xlsx', 'GatewayA_refunds_Sep26_dummy.xlsx'],
            'mapping': {'payment_key': 'id', 'settlement_key': 'entity_id'}
        },
        {
            'name': 'Gateway B',
            'file_names': ['GatewayB_Sep26_dummy.xlsx'],
            'mapping': None
        }
    ]
    up3 = post_multipart('http://localhost:3000/api/upload', {
        'months': 'September 2026',
        'gateways_config': json.dumps(gw_config)
    }, all_4)
    print('Upload response with gateways_config:', up3)
    st3 = poll_status(120)
    print('Status after gateways_config upload:', st3.get('status'))
    data3 = st3.get('data', {})
    print('Gateway names configured:', data3.get('gateway_names'))
    print('Gateways in overview:', list(data3.get('overview', {}).get('gateways', {}).keys()))
    print('AI narrative present:', bool(st3.get('ai')))
    assert st3.get('status') == 'done', f"Expected status done, got {st3.get('status')}: {st3.get('error')}"
    assert 'Gateway A' in data3.get('overview', {}).get('gateways', {}), 'Expected Gateway A in gateways overview'
    assert 'Gateway B' in data3.get('overview', {}).get('gateways', {}), 'Expected Gateway B in gateways overview'

    print('\nALL INTEGRATION TESTS PASSED PERFECTLY!')
