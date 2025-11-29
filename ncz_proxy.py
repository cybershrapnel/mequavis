#!/usr/bin/env python3
import json
import base64
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib import request as urlrequest
from urllib import error as urlerror


class NczRpcProxyHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, extra_headers=None):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()

    def log_message(self, fmt, *args):
        # keep it but prefix so you know it's HTTP-level
        print("[proxy-http] " + fmt % args)

    def do_OPTIONS(self):
        self._set_headers(204)

    def do_POST(self):
        if self.path != "/rpc":
            print(f"\n[proxy] 404 for path: {self.path}")
            self._set_headers(404)
            self.wfile.write(b'{"error":"Not Found"}')
            return

        # --- Read request body ---
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            length = 0

        body = self.rfile.read(length)
        body_text = body.decode("utf-8", "replace")

        print("\n================= NCZ PROXY REQUEST =================")
        print(f"[proxy] Incoming POST {self.path}")
        print(f"[proxy] Raw body from browser:\n{body_text}")

        # --- Parse JSON from browser ---
        try:
            data = json.loads(body_text)
        except Exception as e:
            print("[proxy] !! Failed to parse JSON body:", e)
            traceback.print_exc()
            self._set_headers(400)
            self.wfile.write(json.dumps({
                "error": {"code": -32700, "message": "Invalid JSON body"}
            }).encode("utf-8"))
            return

        url = data.get("url") or "http://127.0.0.1"
        port = str(data.get("port") or "12782")
        user = data.get("user") or ""
        pw   = data.get("pass") or ""
        method = data.get("method")
        params = data.get("params") or []

        rpc_url = url.rstrip("/") + ":" + port + "/"

        print("[proxy] Parsed RPC config:")
        print(f"         url   = {url!r}")
        print(f"         port  = {port!r}")
        print(f"         user  = {user!r}")
        print(f"         pass? = {'YES' if pw else 'NO'}")
        print(f"         method= {method!r}")
        print(f"         params= {params!r}")
        print(f"[proxy] → Target NCZ RPC URL: {rpc_url}")

        # --- Build JSON-RPC request to NCZ node ---
        rpc_payload = {
            "jsonrpc": "1.0",
            "id": "ncz-proxy",
            "method": method,
            "params": params,
        }
        rpc_bytes = json.dumps(rpc_payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}

        if user or pw:
            token = base64.b64encode(f"{user}:{pw}".encode("utf-8")).decode("ascii")
            headers["Authorization"] = "Basic " + token

        print("[proxy] Outgoing RPC payload to NCZ:")
        print(json.dumps(rpc_payload, indent=2))

        req = urlrequest.Request(rpc_url, data=rpc_bytes, headers=headers)

        # --- Talk to NCZ node ---
        try:
            with urlrequest.urlopen(req, timeout=10) as resp:
                status = resp.getcode()
                resp_body = resp.read()
                resp_text = resp_body.decode("utf-8", "replace")

                print(f"[proxy] ← NCZ RPC HTTP {status}")
                print("[proxy] ← NCZ RPC raw body:")
                print(resp_text)
                print("=====================================================")

                self._set_headers(status)
                self.wfile.write(resp_body)

        except urlerror.HTTPError as e:
            # HTTP-level error from NCZ node (401, 403, 500, etc.)
            err_body = e.read()
            err_text = err_body.decode("utf-8", "replace")

            print("[proxy] !! HTTPError talking to NCZ RPC")
            print(f"        Status: {e.code}")
            print(f"        Reason: {e.reason}")
            print("        Body:")
            print(err_text)
            traceback.print_exc()
            print("=====================================================")

            self._set_headers(e.code)
            # if node gave us JSON, just forward it
            if err_body:
                self.wfile.write(err_body)
            else:
                self.wfile.write(json.dumps({
                    "error": {
                        "code": e.code,
                        "message": f"HTTPError from NCZ RPC: {e.reason}"
                    }
                }).encode("utf-8"))

        except Exception as e:
            # Network error / refused / timeout / etc.
            print("[proxy] !! General exception talking to NCZ RPC:", e)
            traceback.print_exc()
            print("=====================================================")

            self._set_headers(502)
            self.wfile.write(json.dumps({
                "error": {
                    "code": 502,
                    "message": f"Bad gateway: {e}"
                }
            }).encode("utf-8"))


def run(host="127.0.0.1", port=12780):
    server_address = (host, port)
    httpd = HTTPServer(server_address, NczRpcProxyHandler)
    print("=====================================================")
    print(f"[proxy] NanoCheeZe RPC proxy listening on http://{host}:{port}/rpc")
    print("        Press Ctrl+C to stop.")
    print("=====================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[proxy] Shutting down proxy...")
    finally:
        httpd.server_close()
        print("[proxy] Proxy stopped.")


if __name__ == "__main__":
    run()
