import urllib.request, urllib.parse, mimetypes, os

files = {
    'gwa_payments': 'GatewayA_payments_Sep26_dummy.xlsx',
    'gwa_transactions': 'GatewayA_transactions_Sep26_dummy.xlsx',
    'gwa_refunds': 'GatewayA_refunds_Sep26_dummy.xlsx',
    'gwb': 'GatewayB_Sep26_dummy.xlsx'
}

boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
body = bytearray()
for key, fn in files.items():
    body.extend(f'--{boundary}\r\n'.encode())
    body.extend(f'Content-Disposition: form-data; name="{key}"; filename="{fn}"\r\n'.encode())
    body.extend(b'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n')
    with open(fn, 'rb') as f:
        body.extend(f.read())
    body.extend(b'\r\n')
body.extend(f'--{boundary}--\r\n'.encode())

req = urllib.request.Request('http://localhost:3000/api/upload', data=body)
req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
try:
    resp = urllib.request.urlopen(req, timeout=10)
    print('STATUS:', resp.status, resp.read().decode())
except Exception as e:
    print('ERR:', e)
