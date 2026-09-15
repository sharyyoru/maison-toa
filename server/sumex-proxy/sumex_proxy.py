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

# Use "localhost" — Sumex http.sys URL ACLs are typically registered against
# localhost, not 127.0.0.1. Using the wrong one yields HTTP 400 "Invalid Hostname".
ROUTES = {
    "/tardocValidatorServer100":               "http://localhost:34228",
    "/acfValidatorServer100":                  "http://localhost:34008",
    "/generalInvoiceRequestManagerServer500":  "http://localhost:35430",
    "/generalInvoiceResponseManagerServer500": "http://localhost:35843",
}

# Paths matching these substrings will have their full request AND response
# bodies logged (truncated to 4000 chars). Useful for debugging Sumex silently
# failing — it often returns 200 with an empty output file.
VERBOSE_TAGS = (
    "/GetXML",
    "/Print",
    "/GetAbortInfo",
    "/AddService",
    "/Finalize",
    "/GetLogSettings",
    "/SetLogSettings",
)

# ── Logging setup ─────────────────────────────────────────────────────────────

os.makedirs(LOG_DIR, exist_ok=True)

log = logging.getLogger("sumex_proxy")
log.setLevel(logging.INFO)

# Rotating file: 10 MB × 5 files
file_handler = logging.handlers.RotatingFileHandler(
    LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
)
file_handler.setFormatter(logging.Formatter(
    "%(asctime)s  %(levelname)-8s  %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
))
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
        pool_connections=10,
        pool_maxsize=50,
    )
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

SESSION = build_session()

# ── Proxy handler ─────────────────────────────────────────────────────────────

# Headers that must not be forwarded.
# - Standard hop-by-hop headers (RFC 7230)
# - "host": must be rewritten to the upstream (requests sets it from the URL)
# - "content-length": requests sets this automatically
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
    "content-length",
    "host",
}

HEALTH_PATH = "/health"
BATCH_PATH  = "/batch"
BATCH_MAX_CALLS = 200


class ProxyHandler(http.server.BaseHTTPRequestHandler):

    # ── routing ──────────────────────────────────────────────────────────────

    def _resolve_backend(self, path=None):
        """Return (backend_base_url, matched_prefix) or (None, None)."""
        p = path if path is not None else self.path
        for prefix, target in ROUTES.items():
            if p.startswith(prefix):
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
        self._send_json(code, status)

    # ── batch endpoint ────────────────────────────────────────────────────────
    #
    # POST /batch
    #   { "calls": [ {"method": "POST", "path": "/generalInvoiceRequestManagerServer500/IGeneralInvoiceRequest/SetTreatment",
    #                 "body": {...}},                       # JSON body (object) or null
    #                {"method": "GET",  "path": "/...", "stopOnError": true}, ... ],
    #     "stopOnError": true }                             # default true
    #
    # Executes the calls SEQUENTIALLY against the local Sumex servers (order is
    # significant — the COM interfaces are stateful) and returns:
    #   { "results": [ {"status": 200, "ms": 12.3, "json": {...}} |
    #                  {"status": 200, "ms": 12.3, "text": "..."} |
    #                  {"error": "...", "ms": 5000.0}, ... ],
    #     "totalMs": 123.4, "completed": N, "aborted": false }
    #
    # A call "fails" (for stopOnError purposes) when: transport error, HTTP >= 400,
    # or the JSON body contains pbStatus === false. On failure with stopOnError,
    # remaining calls are skipped (their slots are filled with {"skipped": true}).
    #
    # This collapses the ~35-45 WAN round-trips of one invoice generation into a
    # single request; each hop is now VM-local (~1 ms).

    def _handle_batch(self):
        request_id = str(uuid.uuid4())[:8]
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            payload = json.loads(raw.decode("utf-8"))
            calls = payload.get("calls", [])
            stop_on_error = bool(payload.get("stopOnError", True))
        except Exception as exc:
            self._send_json(400, {"error": f"Invalid batch payload: {exc}"})
            return

        if not isinstance(calls, list) or len(calls) == 0:
            self._send_json(400, {"error": "calls must be a non-empty array"})
            return
        if len(calls) > BATCH_MAX_CALLS:
            self._send_json(400, {"error": f"too many calls (max {BATCH_MAX_CALLS})"})
            return

        results = []
        aborted = False
        t_batch = time.perf_counter()

        for i, call in enumerate(calls):
            if aborted:
                results.append({"skipped": True})
                continue

            method = str(call.get("method", "POST")).upper()
            path = str(call.get("path", ""))
            body = call.get("body", None)
            backend, _prefix = self._resolve_backend(path)
            if backend is None:
                results.append({"error": f"No route for path: {path}", "ms": 0.0})
                if stop_on_error:
                    aborted = True
                continue

            data = None
            headers = {"X-Request-ID": f"{request_id}:{i}"}
            if body is not None:
                data = json.dumps(body).encode("utf-8")
                headers["Content-Type"] = "application/json"

            t0 = time.perf_counter()
            try:
                resp = SESSION.request(
                    method, backend + path, data=data, headers=headers,
                    timeout=(CONNECT_TIMEOUT, READ_TIMEOUT), allow_redirects=False,
                )
                ms = round((time.perf_counter() - t0) * 1000, 1)
                entry = {"status": resp.status_code, "ms": ms}
                ctype = resp.headers.get("Content-Type", "")
                if "json" in ctype or (resp.content[:1] in (b"{", b"[")):
                    try:
                        entry["json"] = resp.json()
                    except Exception:
                        entry["text"] = resp.text[:100000]
                else:
                    entry["text"] = resp.text[:100000]
                results.append(entry)

                failed = resp.status_code >= 400 or (
                    isinstance(entry.get("json"), dict)
                    and entry["json"].get("pbStatus") is False
                )
                if failed and stop_on_error:
                    aborted = True
            except Exception as exc:
                ms = round((time.perf_counter() - t0) * 1000, 1)
                results.append({"error": str(exc), "ms": ms})
                if stop_on_error:
                    aborted = True

        total_ms = round((time.perf_counter() - t_batch) * 1000, 1)
        completed = sum(1 for r in results if "skipped" not in r)
        slow = sorted(
            (r.get("ms", 0.0) for r in results if "ms" in r), reverse=True
        )[:3]
        log.info(
            "[%s] BATCH %d calls  completed=%d aborted=%s  total=%.0fms  slowest=%s",
            request_id, len(calls), completed, aborted, total_ms, slow,
        )
        self._send_json(200, {
            "results": results,
            "totalMs": total_ms,
            "completed": completed,
            "aborted": aborted,
        })

    # ── main proxy logic ─────────────────────────────────────────────────────

    def handle_request(self, method: str):
        request_id = str(uuid.uuid4())[:8]

        if self.path == HEALTH_PATH:
            self._handle_health()
            return

        if self.path == BATCH_PATH:
            if method != "POST":
                self._send_error(405, "Batch endpoint requires POST")
                return
            self._handle_batch()
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

        verbose = any(tag in self.path for tag in VERBOSE_TAGS)

        if verbose and body:
            try:
                log.info(
                    "[%s] REQ BODY %s %s: %s",
                    request_id, method, self.path,
                    body.decode("utf-8", errors="replace")[:4000],
                )
            except Exception:
                pass

        # Forward headers (strip hop-by-hop + Host so upstream gets the right Host)
        fwd_headers = {
            k: v for k, v in self.headers.items()
            if k.lower() not in HOP_BY_HOP
        }
        fwd_headers["X-Request-ID"] = request_id
        fwd_headers["X-Forwarded-For"] = self.client_address[0]

        t0 = time.perf_counter()
        try:
            resp = SESSION.request(
                method,
                target_url,
                data=body,
                headers=fwd_headers,
                timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                stream=not verbose,   # buffer small verbose responses so we can log them
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
        log.info(
            "[%s] %s %s -> %s  status=%d  %.2fs",
            request_id, method, self.path, backend, resp.status_code, elapsed
        )

        # Stream response back to client (expose upstream time for profiling)
        try:
            self.send_response(resp.status_code)
            for header, value in resp.headers.items():
                if header.lower() not in HOP_BY_HOP:
                    self.send_header(header, value)
            self.send_header("X-Upstream-Ms", str(round(elapsed * 1000, 1)))
            self.end_headers()

            if verbose:
                content = resp.content
                try:
                    log.info(
                        "[%s] RES BODY %s %s status=%d: %s",
                        request_id, method, self.path, resp.status_code,
                        content.decode("utf-8", errors="replace")[:4000],
                    )
                except Exception:
                    pass
                self.wfile.write(content)
            else:
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

    def _send_json(self, code: int, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, code: int, message: str):
        self._send_json(code, {"error": message})

    def log_message(self, format, *args):
        pass  # suppress default stdout noise; we use structured logging above


# ── Threaded server ───────────────────────────────────────────────────────────

class ThreadedServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128


# ── Windows Service wrapper ───────────────────────────────────────────────────

def run_server():
    server = ThreadedServer((LISTEN_HOST, LISTEN_PORT), ProxyHandler)
    log.info("Sumex Proxy listening on %s:%d", LISTEN_HOST, LISTEN_PORT)
    for prefix, target in ROUTES.items():
        log.info("  %s  ->  %s", prefix, target)
    log.info("  %s  (sequential multi-call endpoint)", BATCH_PATH)
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
        run_server()
