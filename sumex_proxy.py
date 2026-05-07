import http.server
import socketserver
import threading
import time
import logging
import logging.handlers
import uuid
import json
import sys
import os
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ── Configuration ────────────────────────────────────────────────────────────
LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 8080
CONNECT_TIMEOUT = 5    # seconds to establish connection to backend
READ_TIMEOUT    = 30   # seconds to wait for backend to send data
LOG_DIR         = r"C:\Logs\SumexProxy"
LOG_FILE        = os.path.join(LOG_DIR, "proxy.log")

ROUTES = {
    "/tardocValidatorServer100":               "http://127.0.0.1:34228",
    "/acfValidatorServer100":                  "http://127.0.0.1:34008",
    "/generalInvoiceRequestManagerServer500":  "http://127.0.0.1:35430",
    "/generalInvoiceResponseManagerServer500": "http://127.0.0.1:35843",
}

# ── Logging setup ─────────────────────────────────────────────────────────────
os.makedirs(LOG_DIR, exist_ok=True)

log = logging.getLogger("sumex_proxy")
log.setLevel(logging.INFO)

# Rotating file: 10 MB × 5 files
file_handler = logging.handlers.RotatingFileHandler(
    LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
)
file_handler.setFormatter(
    logging.Formatter("%(asctime)s  %(levelname)-8s  %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
)
log.addHandler(file_handler)

# Also log to console (useful when running interactively)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(logging.Formatter("%(asctime)s  %(levelname)-8s  %(message)s"))
log.addHandler(console_handler)

# ── HTTP session with connection pooling + retries ────────────────────────────
def build_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=2,
        backoff_factor=0.3,
        status_forcelist=[502, 503, 504],
        allowed_methods=["GET", "POST", "PUT", "DELETE", "HEAD"],
    )
    adapter = HTTPAdapter(
        max_retries=retry,
        pool_connections=10,   # one pool per unique host
        pool_maxsize=50,       # max connections per pool
    )
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

SESSION = build_session()

# ── Proxy handler ─────────────────────────────────────────────────────────────
# Headers that must not be forwarded (hop-by-hop)
# Note: We handle 'host' separately to rewrite it for the backend
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
    "content-length",  # requests sets this automatically
}

HEALTH_PATH = "/health"

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    # ── routing ──────────────────────────────────────────────────────────────
    def _resolve_backend(self):
        """Return (backend_base_url, matched_prefix) or (None, None)."""
        for prefix, target in ROUTES.items():
            if self.path.startswith(prefix):
                return target, prefix
        return None, None

    # ── health check ─────────────────────────────────────────────────────────
    def _handle_health(self):
        status = {"status": "ok", "backends": {}}
        overall_ok = True
        for prefix, target in ROUTES.items():
            try:
                r = SESSION.get(target + "/", timeout=(2, 2))
                up = r.status_code < 500
            except Exception:
                up = False
            status["backends"][prefix] = "up" if up else "down"
            if not up:
                overall_ok = False

        code = 200 if overall_ok else 503
        body = json.dumps(status).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── main proxy logic ─────────────────────────────────────────────────────
    def handle_request(self, method: str):
        request_id = str(uuid.uuid4())[:8]

        # Health check — no backend needed
        if self.path == HEALTH_PATH:
            self._handle_health()
            return

        backend, prefix = self._resolve_backend()
        if backend is None:
            log.warning("[%s] 404  No route for: %s", request_id, self.path)
            self._send_error(404, f"No route for path: {self.path}")
            return

        target_url = backend + self.path

        # Read request body
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length > 0 else None
        except Exception as exc:
            log.error("[%s] Failed to read request body: %s", request_id, exc)
            self._send_error(400, "Bad request body")
            return

        # Forward headers (strip hop-by-hop, but handle Host separately)
        fwd_headers = {}
        for k, v in self.headers.items():
            if k.lower() not in HOP_BY_HOP and k.lower() != "host":
                fwd_headers[k] = v
        
        # Rewrite Host header to match backend (critical for Sumex)
        # Extract host:port from backend URL
        from urllib.parse import urlparse
        parsed = urlparse(backend)
        if parsed.port:
            backend_host = f"{parsed.hostname}:{parsed.port}"
        else:
            backend_host = parsed.hostname or "127.0.0.1"
        
        fwd_headers["Host"] = backend_host
        fwd_headers["X-Request-ID"] = request_id
        fwd_headers["X-Forwarded-For"] = self.client_address[0]
        fwd_headers["X-Forwarded-Host"] = self.headers.get("Host", "")
        
        log.info("[%s] Host rewrite: %s -> %s", request_id, self.headers.get("Host"), backend_host)

        t0 = time.perf_counter()
        try:
            resp = SESSION.request(
                method,
                target_url,
                data=body,
                headers=fwd_headers,
                timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                stream=True,          # stream so we don't buffer large PDFs etc.
                allow_redirects=False,
            )
        except requests.exceptions.ConnectTimeout:
            log.error("[%s] Connect timeout  -> %s", request_id, target_url)
            self._send_error(504, "Backend connect timeout")
            return
        except requests.exceptions.ReadTimeout:
            log.error("[%s] Read timeout     -> %s", request_id, target_url)
            self._send_error(504, "Backend read timeout")
            return
        except requests.exceptions.ConnectionError as exc:
            log.error("[%s] Unreachable      -> %s  (%s)", request_id, target_url, exc)
            self._send_error(503, "Backend unreachable")
            return
        except Exception as exc:
            log.exception("[%s] Unexpected error -> %s", request_id, target_url)
            self._send_error(500, str(exc))
            return

        elapsed = time.perf_counter() - t0
        log.info("[%s] %s %s -> %s  status=%d  %.2fs",
                 request_id, method, self.path, backend, resp.status_code, elapsed)

        # Stream response back to client
        try:
            self.send_response(resp.status_code)
            for header, value in resp.headers.items():
                if header.lower() not in HOP_BY_HOP:
                    self.send_header(header, value)
            self.end_headers()
            for chunk in resp.iter_content(chunk_size=65536):
                if chunk:
                    self.wfile.write(chunk)
        except BrokenPipeError:
            log.warning("[%s] Client disconnected mid-response", request_id)
        except Exception as exc:
            log.error("[%s] Error streaming response: %s", request_id, exc)

    def do_GET(self):    self.handle_request("GET")
    def do_POST(self):   self.handle_request("POST")
    def do_PUT(self):    self.handle_request("PUT")
    def do_DELETE(self): self.handle_request("DELETE")
    def do_HEAD(self):   self.handle_request("HEAD")

    def _send_error(self, code: int, message: str):
        body = json.dumps({"error": message}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass  # suppress default stdout noise; we use structured logging above

# ── Threaded server ───────────────────────────────────────────────────────────
class ThreadedServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128  # OS listen() backlog

# ── Windows Service wrapper ───────────────────────────────────────────────────
def run_server():
    server = ThreadedServer((LISTEN_HOST, LISTEN_PORT), ProxyHandler)
    log.info("Sumex Proxy listening on %s:%d", LISTEN_HOST, LISTEN_PORT)
    for prefix, target in ROUTES.items():
        log.info("  %s  ->  %s", prefix, target)
    server.serve_forever()

try:
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager

    class SumexProxyService(win32serviceutil.ServiceFramework):
        _svc_name_        = "SumexProxy"
        _svc_display_name_= "Sumex Proxy Service"
        _svc_description_ = "Reverse proxy for Sumex1 generalInvoice REST servers"

        def __init__(self, args):
            super().__init__(args)
            self._stop_event = win32event.CreateEvent(None, 0, 0, None)
            self._thread = None

        def SvcStop(self):
            log.info("Service stop requested")
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            win32event.SetEvent(self._stop_event)

        def SvcDoRun(self):
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, "")
            )
            log.info("Service started")
            self._thread = threading.Thread(target=run_server, daemon=True)
            self._thread.start()
            win32event.WaitForSingleObject(self._stop_event, win32event.INFINITE)
            log.info("Service stopped")

    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if HAS_WIN32 and len(sys.argv) > 1:
        win32serviceutil.HandleCommandLine(SumexProxyService)
    else:
        # Run directly (development / Linux)
        run_server()
