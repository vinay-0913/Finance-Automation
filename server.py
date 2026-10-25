"""
server.py — PayAnalytics HTTP Server
Supports:
  1. Static file serving (HTML, JS, CSS, JSON, etc.)
  2. POST /api/inspect — fast file inspection (columns, detected schema role, candidate join keys)
  3. POST /api/upload  — accepts single consolidated files or multi-file uploads with custom join keys & months
  4. POST /api/narrate — runs ai_narrate.py on existing dashboard_data.json
  5. GET  /api/status  — returns pipeline state, progress logs, latest dataset, and AI insights
  6. GET  /api/latest-data — returns cached dataset & AI narratives
"""

import argparse
import http.server
import json
import mimetypes
import os
import subprocess
import sys
import threading
import time
import tempfile
import traceback
import urllib.parse
from email.parser import BytesParser
from email.policy import default
from pathlib import Path

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROCESS_SCRIPT = os.path.join(BASE_DIR, "process_data.py")
NARRATE_SCRIPT = os.path.join(BASE_DIR, "ai_narrate.py")

# ──────────────────────────────────────────────────────────────
# Shared processing state
# ──────────────────────────────────────────────────────────────
_state = {
    "status": "idle",       # idle | processing | done | error
    "step": "",
    "log": [],
    "error": None,
    "last_run": None,
    "result_data": None,
    "ai_narratives": None,
}

def _set_state(status, step="", error=None):
    _state["status"] = status
    _state["step"] = step
    _state["error"] = error
    _state["last_run"] = time.time()
    if step:
        _state["log"].append(step)

def inspect_file(filepath):
    """Inspects an Excel/CSV file to detect schema role, columns, and candidate join keys."""
    try:
        import pandas as pd
        xl = pd.ExcelFile(filepath, engine='openpyxl')
        sheet = xl.sheet_names[0]
        for s in xl.sheet_names:
            if any(w in s.lower() for w in ['gateway', 'charge', 'txn', 'transaction', 'settlement', 'payment', 'sheet1']):
                sheet = s
                break
        df0 = pd.read_excel(filepath, sheet_name=sheet, header=0, nrows=10, engine='openpyxl')
        df1 = pd.read_excel(filepath, sheet_name=sheet, header=1, nrows=10, engine='openpyxl')
        cols0 = [str(c).strip() for c in df0.columns if not str(c).startswith('Unnamed')]
        cols1 = [str(c).strip() for c in df1.columns if not str(c).startswith('Unnamed')]
        if len(cols1) > len(cols0):
            cols = cols1
            df_sample = df1
        else:
            cols = cols0
            df_sample = df0
            
        cols_lower = set(c.lower() for c in cols)
        fn_lower = os.path.basename(filepath).lower()
        
        # 1. Filename keyword priority
        if 'payment' in fn_lower:
            role = 'payment_metadata'
            role_label = 'Payment Metadata'
        elif 'refund' in fn_lower:
            role = 'refunds_ledger'
            role_label = 'Refunds Ledger'
        elif 'transaction' in fn_lower or 'settle' in fn_lower:
            role = 'settlement_ledger'
            role_label = 'Settlement Ledger (INR Amounts)'
        elif 'gatewayb' in fn_lower or any(k in cols_lower for k in ['balance_transaction_id', 'reporting_category']):
            role = 'consolidated_ledger'
            role_label = 'Consolidated Ledger (Standalone Ready)'
        # 2. Schema-based fallback for arbitrary filenames
        elif any(k in cols_lower for k in ['balance_transaction_id', 'reporting_category', 'gross']):
            role = 'consolidated_ledger'
            role_label = 'Consolidated Ledger (Standalone Ready)'
        elif any(k in cols_lower for k in ['settled_at', 'tax_inr', 'settlement_id', 'amount_inr']):
            role = 'settlement_ledger'
            role_label = 'Settlement Ledger (INR Amounts)'
        elif any(k in cols_lower for k in ['refund_id']):
            role = 'refunds_ledger'
            role_label = 'Refunds Ledger'
        elif any(k in cols_lower for k in ['fx_amount', 'status', 'international']):
            role = 'payment_metadata'
            role_label = 'Payment Metadata'
        else:
            role = 'unknown'
            role_label = 'Custom Financial Data'
            
        candidate_id_cols = [c for c in cols if any(term in c.lower() for term in ['id', 'ref', 'arn', 'key', 'token', 'entity'])]
        sample_ids = {}
        for c in candidate_id_cols[:6]:
            vals = [str(v) for v in df_sample[c].dropna().head(3).tolist()]
            sample_ids[c] = vals

        return {
            'name': os.path.basename(filepath),
            'filename': os.path.basename(filepath),
            'role': role,
            'role_label': role_label,
            'columns': cols,
            'detected_columns': cols,
            'candidate_ids': candidate_id_cols,
            'sample_ids': sample_ids,
            'size_bytes': os.path.getsize(filepath) if os.path.exists(filepath) else 0
        }
    except Exception as e:
        return {
            'name': os.path.basename(filepath),
            'filename': os.path.basename(filepath),
            'role': 'unknown',
            'role_label': 'Custom File',
            'columns': [],
            'detected_columns': [],
            'candidate_ids': [],
            'sample_ids': {},
            'error': str(e)
        }

def run_pipeline(files: list, out_dir: str, months: str = None, join_keys: dict = None, gateway_config: dict = None):
    """
    Executes process_data.py with dynamic files, per-gateway config, join keys, and month scope,
    then automatically triggers ai_narrate.py for Gemini insights.
    """
    _state["log"] = []
    _state["result_data"] = None
    _state["ai_narratives"] = None
    _set_state("processing", "Starting data processing...")

    try:
        if gateway_config and len(gateway_config.get("gateways", [])) > 0:
            cfg_path = os.path.join(out_dir, "temp_gw_config.json")
            with open(cfg_path, "w", encoding="utf-8") as gf:
                json.dump(gateway_config, gf, indent=2)
            cmd = [sys.executable, PROCESS_SCRIPT, "--gateway-config", cfg_path, "--out-dir", out_dir]
        else:
            cmd = [sys.executable, PROCESS_SCRIPT, "--files"] + files + ["--out-dir", out_dir]

        if months and months.lower() not in ['all', 'auto', '']:
            cmd += ["--months", months]
        if join_keys and len(join_keys) > 0:
            cmd += ["--join-keys", json.dumps(join_keys)]

        _set_state("processing", "Running process_data.py on uploaded files...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        for line in result.stdout.splitlines():
            _state["log"].append(line)
        if result.returncode != 0:
            err = result.stderr or result.stdout or "Unknown error"
            _set_state("error", "process_data.py failed", error=err)
            return

        json_path = os.path.join(out_dir, "dashboard_data.json")
        if os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as jf:
                _state["result_data"] = json.load(jf)

        # Automatically generate AI Insights directly
        _set_state("processing", "Calculations complete. Automatically generating AI insights with Gemini...")
        ai_cmd = [
            sys.executable, NARRATE_SCRIPT,
            "--input", json_path,
            "--output", os.path.join(out_dir, "ai_narratives.json"),
        ]
        ai_res = subprocess.run(ai_cmd, capture_output=True, text=True, timeout=180)
        for line in ai_res.stdout.splitlines():
            _state["log"].append(line)
        if ai_res.returncode != 0:
            _state["log"].append(f"[Notice] AI narration note: {ai_res.stderr or 'Completed with warnings'}")

        ai_path = os.path.join(out_dir, "ai_narratives.json")
        if os.path.exists(ai_path):
            with open(ai_path, "r", encoding="utf-8") as af:
                _state["ai_narratives"] = json.load(af)

        _set_state("done", "Processing & AI narration complete. Dashboard data updated.")

    except subprocess.TimeoutExpired:
        _set_state("error", "Timed out (>5 minutes)", error="Processing timed out.")
    except Exception as e:
        _set_state("error", f"Exception: {e}", error=traceback.format_exc())

# ──────────────────────────────────────────────────────────────
# HTTP Handler
# ──────────────────────────────────────────────────────────────
class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        if args and str(args[1]) >= "400":
            super().log_message(fmt, *args)

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: str):
        mime, _ = mimetypes.guess_type(path)
        mime = mime or "application/octet-stream"
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/api/status":
            self._send_json({
                "status": _state["status"],
                "step": _state["step"],
                "log": _state["log"][-50:],
                "error": _state["error"],
                "last_run": _state["last_run"],
                "data": _state.get("result_data"),
                "ai": _state.get("ai_narratives"),
            })
            return

        if path == "/api/latest-data":
            if _state.get("result_data"):
                self._send_json({
                    "data": _state["result_data"],
                    "ai": _state.get("ai_narratives"),
                })
            else:
                self._send_json({"error": "No dataset processed in this session"}, 404)
            return

        if path == "/api/vendor-compliance":
            vc_path = os.path.join(BASE_DIR, "vendor_compliance_data.json")
            if os.path.isfile(vc_path):
                self._send_file(vc_path)
            else:
                self._send_json({"error": "Vendor compliance dataset not found"}, 404)
            return

        if path == "/ai_narratives.json":
            if _state.get("ai_narratives"):
                self._send_json(_state["ai_narratives"])
            elif os.path.isfile(os.path.join(BASE_DIR, "ai_narratives.json")):
                self._send_file(os.path.join(BASE_DIR, "ai_narratives.json"))
            else:
                self._send_json({"error": "AI narratives not generated yet"}, 404)
            return

        # Static files
        if path == "/" or path == "/index.html":
            target = os.path.join(BASE_DIR, "index.html")
        else:
            rel = path.lstrip("/")
            target = os.path.join(BASE_DIR, rel)

        if os.path.isfile(target):
            self._send_file(target)
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/inspect":
            self._handle_inspect()
        elif path == "/api/upload":
            self._handle_upload()
        elif path == "/api/narrate":
            self._handle_narrate()
        elif path == "/api/vendor-compliance/process":
            self._handle_vendor_compliance_process()
        else:
            self._send_json({"error": "Unknown endpoint"}, 404)

    def _parse_multipart(self):
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            return None, None
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)
        raw_header = f"Content-Type: {content_type}\r\n\r\n".encode("latin-1")
        msg = BytesParser(policy=default).parsebytes(raw_header + body)

        files = []
        fields = {}
        for part in msg.iter_parts():
            name = part.get_param("name", header="content-disposition")
            filename = part.get_filename()
            payload = part.get_payload(decode=True)
            if filename:
                if payload:
                    files.append((filename, payload))
            elif name:
                fields[name] = payload.decode("utf-8", errors="ignore") if payload else ""
        return files, fields

    def _handle_inspect(self):
        """Inspects uploaded files and returns schema breakdown & candidate join keys."""
        files, fields = self._parse_multipart()
        if not files:
            self._send_json({"error": "No files received for inspection"}, 400)
            return

        temp_dir = tempfile.mkdtemp(prefix="payanalytics_inspect_")
        inspections = []
        try:
            for fn, data in files:
                fpath = os.path.join(temp_dir, fn)
                with open(fpath, "wb") as f:
                    f.write(data)
                inspections.append(inspect_file(fpath))

            roles = [i['role'] for i in inspections]
            has_consolidated = 'consolidated_ledger' in roles
            has_settlement = 'settlement_ledger' in roles
            has_payment = 'payment_metadata' in roles

            needs_mapping = False
            suggested_mapping = {}

            if has_settlement and has_payment:
                pay_file = next(i for i in inspections if i['role'] == 'payment_metadata')
                settle_file = next(i for i in inspections if i['role'] == 'settlement_ledger')
                
                # Check candidate overlap
                p_cands = pay_file['candidate_ids']
                s_cands = settle_file['candidate_ids']
                
                p_cands_lower = [c.lower() for c in p_cands]
                s_cands_lower = [c.lower() for c in s_cands]
                exact = [c for c in p_cands if c.lower() in s_cands_lower]
                if 'id' in p_cands_lower and 'entity_id' in s_cands_lower:
                    suggested_mapping = {'payment_key': 'id', 'settlement_key': 'entity_id'}
                elif 'id' in p_cands_lower and 'payment_id' in s_cands_lower:
                    suggested_mapping = {'payment_key': 'id', 'settlement_key': 'payment_id'}
                elif exact:
                    suggested_mapping = {'payment_key': exact[0], 'settlement_key': exact[0]}
                else:
                    needs_mapping = True
                    suggested_mapping = {
                        'payment_key': p_cands[0] if p_cands else '',
                        'settlement_key': s_cands[0] if s_cands else ''
                    }

            mode = 'single_consolidated' if (has_consolidated and len(files) == 1) else ('multi_file_join' if has_settlement else 'custom')

            self._send_json({
                "ok": True,
                "files": inspections,
                "mode": mode,
                "needs_mapping": needs_mapping,
                "suggested_mapping": suggested_mapping,
            })
        finally:
            # Clean temp inspection dir
            try:
                for fn, _ in files:
                    fp = os.path.join(temp_dir, fn)
                    if os.path.exists(fp): os.remove(fp)
                os.rmdir(temp_dir)
            except Exception:
                pass

    def _handle_upload(self):
        """Accepts 1 to N files, months, and optional join key mapping."""
        if _state["status"] == "processing":
            self._send_json({"error": "Already processing. Please wait."}, 409)
            return

        files, fields = self._parse_multipart()
        if not files or len(files) == 0:
            self._send_json({"error": "No files provided in upload."}, 400)
            return

        months = fields.get("months") or fields.get("period") or "all"
        mapping = {}
        if fields.get("mapping"):
            try:
                mapping = json.loads(fields["mapping"])
            except Exception:
                pass

        # Save files to temp directory
        upload_dir = tempfile.mkdtemp(prefix="payanalytics_upload_")
        saved_paths = []
        for filename, data in files:
            dest = os.path.join(upload_dir, filename)
            with open(dest, "wb") as f:
                f.write(data)
            saved_paths.append(dest)

        # Quick validation check: if multiple files, check if mapping is required
        inspections = [inspect_file(p) for p in saved_paths]
        roles = [i['role'] for i in inspections]
        has_settlement = 'settlement_ledger' in roles
        has_payment = 'payment_metadata' in roles

        if has_settlement and has_payment and not mapping:
            pay_file = next(i for i in inspections if i['role'] == 'payment_metadata')
            settle_file = next(i for i in inspections if i['role'] == 'settlement_ledger')
            p_cands = [c.lower() for c in pay_file['candidate_ids']]
            s_cands = [c.lower() for c in settle_file['candidate_ids']]
            common = set(p_cands) & set(s_cands)
            has_standard_pair = ('id' in p_cands and 'entity_id' in s_cands)
            if not common and not has_standard_pair:
                self._send_json({
                    "status": "needs_mapping",
                    "files": inspections,
                    "message": "Payment metadata and settlement ledger lack a standard linking identifier. Please map the connecting columns."
                }, 200)
                return

        # Resolve gateways_config if passed
        gateway_config = None
        gw_config_raw = fields.get("gateways_config")
        if gw_config_raw:
            try:
                parsed_gw_list = json.loads(gw_config_raw)
                resolved_gateways = []
                for gw in parsed_gw_list:
                    gw_name = gw.get("name", "Gateway")
                    target_names = [fn.lower() for fn in gw.get("file_names", [])]
                    matched_paths = [p for p in saved_paths if os.path.basename(p).lower() in target_names]
                    if matched_paths:
                        resolved_gateways.append({
                            "name": gw_name,
                            "files": matched_paths,
                            "mapping": gw.get("mapping")
                        })
                if resolved_gateways:
                    gateway_config = {"gateways": resolved_gateways}
            except Exception as e:
                print(f"[Warning] Failed to parse gateways_config: {e}")

        # Start pipeline
        t = threading.Thread(
            target=run_pipeline,
            args=(saved_paths, BASE_DIR, months, mapping, gateway_config),
            daemon=True,
        )
        t.start()

        self._send_json({
            "ok": True,
            "message": f"Processing {len(saved_paths)} file(s) for period: {months}.",
            "files": [os.path.basename(p) for p in saved_paths],
            "months": months
        })

    def _handle_narrate(self):
        """Run ai_narrate.py on existing dashboard_data.json."""
        if _state["status"] == "processing":
            self._send_json({"error": "Already processing. Please wait."}, 409)
            return

        dashboard_path = os.path.join(BASE_DIR, "dashboard_data.json")
        if not os.path.exists(dashboard_path):
            self._send_json({"error": "dashboard_data.json not found. Run processing first."}, 400)
            return

        def _run():
            _set_state("processing", "Running AI narrative generation...")
            try:
                cmd = [sys.executable, NARRATE_SCRIPT, "--input", dashboard_path, "--output", os.path.join(BASE_DIR, "ai_narratives.json")]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
                for line in res.stdout.splitlines():
                    _state["log"].append(line)
                ai_path = os.path.join(BASE_DIR, "ai_narratives.json")
                if os.path.exists(ai_path):
                    with open(ai_path, "r", encoding="utf-8") as af:
                        _state["ai_narratives"] = json.load(af)
                _set_state("done", "AI narratives updated.")
            except Exception as e:
                _set_state("error", f"AI narrative error: {e}")

        threading.Thread(target=_run, daemon=True).start()
        self._send_json({"ok": True, "message": "AI narrative generation started."})

    def _handle_vendor_compliance_process(self):
        """Run process_vendor_compliance.py on master compliance datasets."""
        etl_script = os.path.join(BASE_DIR, "process_vendor_compliance.py")
        if not os.path.exists(etl_script):
            self._send_json({"error": "process_vendor_compliance.py not found."}, 404)
            return

        try:
            cmd = [sys.executable, etl_script]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if res.returncode != 0:
                self._send_json({"error": f"ETL failed: {res.stderr}"}, 500)
                return

            vc_path = os.path.join(BASE_DIR, "vendor_compliance_data.json")
            if os.path.exists(vc_path):
                with open(vc_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._send_json({
                    "ok": True,
                    "message": "Vendor GST & TDS compliance audit completed successfully.",
                    "summary": data.get("summary"),
                    "data": data
                })
            else:
                self._send_json({"error": "Output JSON not produced."}, 500)
        except Exception as e:
            self._send_json({"error": f"Execution error: {str(e)}"}, 500)


def main():
    parser = argparse.ArgumentParser(description="PayAnalytics Server")
    parser.add_argument("--port", type=int, default=3000, help="Port to listen on (default: 3000)")
    args = parser.parse_args()

    server = http.server.ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    print(f"PayAnalytics server running on http://localhost:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

if __name__ == "__main__":
    main()
