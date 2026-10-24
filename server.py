"""
server.py — PayAnalytics HTTP Server
Replaces `npx serve` with a server that:
  1. Serves all static files (HTML, JS, JSON, etc.)
  2. POST /api/upload  — receives 4 Excel files, runs process_data.py
  3. POST /api/narrate — runs ai_narrate.py on the generated dashboard_data.json
  4. GET  /api/status  — returns current processing status

Usage:
  py server.py            (port 3000)
  py server.py --port 8080
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
# Shared processing state (thread-safe enough for single user)
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


def run_pipeline(files: dict, out_dir: str):
    """
    Run process_data.py (and optionally ai_narrate.py) in a background thread.
    files = {
        "gwa_payments": "/path/to/file.xlsx",
        "gwa_transactions": "/path/to/file.xlsx",
        "gwa_refunds": "/path/to/file.xlsx",
        "gwb": "/path/to/file.xlsx",
    }
    """
    _state["log"] = []
    _state["result_data"] = None
    _state["ai_narratives"] = None
    _set_state("processing", "Starting data processing...")

    try:
        cmd = [
            sys.executable, PROCESS_SCRIPT,
            "--gwa-payments",     files["gwa_payments"],
            "--gwa-transactions", files["gwa_transactions"],
            "--gwa-refunds",      files["gwa_refunds"],
            "--gwb",              files["gwb"],
            "--out-dir",          out_dir,
        ]
        _set_state("processing", "Running process_data.py...")
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

        # Automatically generate AI Insights directly!
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
        # suppress default per-request logs; keep errors
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

        # API routes
        if path == "/api/status":
            self._send_json({
                "status": _state["status"],
                "step": _state["step"],
                "log": _state["log"][-50:],   # last 50 lines
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
            # Strip leading /
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

        if path == "/api/upload":
            self._handle_upload()
        elif path == "/api/narrate":
            self._handle_narrate()
        else:
            self._send_json({"error": "Unknown endpoint"}, 404)

    def _handle_upload(self):
        """
        Accepts multipart/form-data with fields:
          gwa_payments, gwa_transactions, gwa_refunds, gwb
        Saves files to a temp directory, then kicks off the pipeline.
        """
        if _state["status"] == "processing":
            self._send_json({"error": "Already processing. Please wait."}, 409)
            return

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._send_json({"error": "Expected multipart/form-data"}, 400)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length)

            raw_header = f"Content-Type: {content_type}\r\n\r\n".encode("latin-1")
            msg = BytesParser(policy=default).parsebytes(raw_header + body)

            uploaded_parts = {}
            for part in msg.iter_parts():
                name = part.get_param("name", header="content-disposition")
                if name:
                    filename = part.get_filename() or f"{name}.xlsx"
                    payload = part.get_payload(decode=True)
                    if payload is not None and len(payload) > 0:
                        uploaded_parts[name] = (filename, payload)

            required = ["gwa_payments", "gwa_transactions", "gwa_refunds", "gwb"]
            missing = [k for k in required if k not in uploaded_parts]
            if missing:
                self._send_json({"error": f"Missing files: {', '.join(missing)}"}, 400)
                return

            # Save uploaded files to a temp directory
            upload_dir = tempfile.mkdtemp(prefix="payanalytics_")
            saved = {}
            for key in required:
                filename, data = uploaded_parts[key]
                dest = os.path.join(upload_dir, filename)
                with open(dest, "wb") as f:
                    f.write(data)
                saved[key] = dest

            # Start processing in a background thread
            t = threading.Thread(
                target=run_pipeline,
                args=(saved, BASE_DIR),
                daemon=True,
            )
            t.start()

            self._send_json({
                "ok": True,
                "message": "Files uploaded. Processing started.",
                "files": {k: os.path.basename(v) for k, v in saved.items()},
            })

        except Exception as e:
            self._send_json({"error": str(e), "trace": traceback.format_exc()}, 500)

    def _handle_narrate(self):
        """Run ai_narrate.py on the existing dashboard_data.json."""
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
                cmd = [sys.executable, NARRATE_SCRIPT,
                       "--input", dashboard_path,
                       "--output", os.path.join(BASE_DIR, "ai_narratives.json")]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                for line in result.stdout.splitlines():
                    _state["log"].append(line)
                if result.returncode != 0:
                    _set_state("error", "ai_narrate.py failed", error=result.stderr)
                else:
                    _set_state("done", "AI narratives generated successfully.")
            except Exception as e:
                _set_state("error", str(e), error=traceback.format_exc())

        threading.Thread(target=_run, daemon=True).start()
        self._send_json({"ok": True, "message": "AI narration started."})


# ──────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="PayAnalytics HTTP Server")
    ap.add_argument("--port", type=int, default=3000)
    ap.add_argument("--host", default="localhost")
    cfg = ap.parse_args()

    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")

    http.server.ThreadingHTTPServer.allow_reuse_address = True
    try:
        server = http.server.ThreadingHTTPServer((cfg.host, cfg.port), Handler)
    except OSError as e:
        print(f"\n[Error] Could not bind to port {cfg.port}: {e}")
        print(f"If another instance is running, stop it or pass --port <number> (e.g. py server.py --port 3001)\n")
        sys.exit(1)

    print(f"\n=== PayAnalytics Server ===")
    print(f"    http://{cfg.host}:{cfg.port}")
    print(f"    Serving from: {BASE_DIR}")
    print(f"    Press Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
