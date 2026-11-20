#!/usr/bin/env python3
"""Hi3D MCP client for batch pipelines (no LLM in the loop).

Talks to the Hi3D MCP server over streamable HTTP with its own OAuth client,
so large reference images are uploaded straight from disk.

  python3 hi3d_client.py login                      # one-time browser authorization
  python3 hi3d_client.py balance
  python3 hi3d_client.py call <tool> '<json args>'
  python3 hi3d_client.py gen <image> <name> <out_dir> [--version v3.0]
         [--quality high_quality] [--max-points 70] [--dry-run]

The token is stored next to this script in .hi3d_token.json (mode 600).
"""
import base64, hashlib, http.server, json, os, secrets, sys, threading, time
import urllib.parse, urllib.request, webbrowser

MCP_URL = "https://agent.hi3d.ai/mcp"
AUTH_URL = "https://www.hi3d.ai/authorize"
TOKEN_URL = "https://www.hi3d.ai/aigc/api/auth/mcp/token"
REGISTER_URL = "https://www.hi3d.ai/aigc/api/auth/mcp/register"
SCOPES = "account:read generation:create task:read"
TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".hi3d_token.json")
PORT = 53682


def _post(url, data, headers=None, form=False):
    body = urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode()
    h = {"Content-Type": "application/x-www-form-urlencoded" if form else "application/json"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=body, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, dict(r.headers), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()


def _save(tok):
    with open(TOKEN_FILE, "w") as f:
        json.dump(tok, f)
    os.chmod(TOKEN_FILE, 0o600)


def login():
    redirect = f"http://127.0.0.1:{PORT}/callback"
    st, _, body = _post(REGISTER_URL, {
        "client_name": "hi3d-fps pipeline", "redirect_uris": [redirect],
        "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
        "token_endpoint_auth_method": "none", "scope": SCOPES})
    if st >= 300:
        sys.exit(f"register failed {st}: {body}")
    client_id = json.loads(body)["client_id"]
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    got = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            u = urllib.parse.urlparse(self.path)
            if u.path == "/callback":
                got.update({k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("授权完成，可以关闭这个页面。".encode())

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = AUTH_URL + "?" + urllib.parse.urlencode({
        "response_type": "code", "client_id": client_id, "redirect_uri": redirect,
        "code_challenge": challenge, "code_challenge_method": "S256", "state": state,
        "scope": SCOPES, "resource": MCP_URL})
    print("在浏览器里完成 Hi3D 授权；如果没有自动打开，请访问：\n" + url, flush=True)
    webbrowser.open(url)
    for _ in range(1800):  # up to 15 minutes for the person to finish in the browser
        if "code" in got or "error" in got:
            break
        time.sleep(0.5)
    srv.shutdown()
    if got.get("state") != state or "code" not in got:
        sys.exit(f"authorization failed: {got}")
    st, _, body = _post(TOKEN_URL, {
        "grant_type": "authorization_code", "code": got["code"], "redirect_uri": redirect,
        "client_id": client_id, "code_verifier": verifier, "resource": MCP_URL}, form=True)
    if st >= 300:
        sys.exit(f"token exchange failed {st}: {body}")
    tok = json.loads(body)
    tok["client_id"] = client_id
    tok["obtained_at"] = time.time()
    _save(tok)
    print("Hi3D 授权成功。")


def _token():
    import fcntl
    if not os.path.exists(TOKEN_FILE):
        sys.exit("not logged in: run `hi3d_client.py login` first")
    # one process refreshes at a time: refresh tokens rotate, so parallel jobs racing
    # on the same one would invalidate each other
    with open(TOKEN_FILE + ".lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        tok = json.load(open(TOKEN_FILE))
        if tok.get("expires_in") and time.time() > tok["obtained_at"] + tok["expires_in"] - 300:
            st, _, body = _post(TOKEN_URL, {"grant_type": "refresh_token", "refresh_token": tok.get("refresh_token", ""),
                                            "client_id": tok["client_id"], "resource": MCP_URL}, form=True)
            if st >= 300:
                sys.exit(f"Hi3D token expired and refresh failed ({st}: {body[:120]}); run `hi3d_client.py login` again")
            new = json.loads(body)
            new.setdefault("refresh_token", tok.get("refresh_token"))
            new["client_id"], new["obtained_at"] = tok["client_id"], time.time()
            _save(new)
            tok = new
    return tok["access_token"]


def refresh_now():
    """Force a refresh (to check the server's refresh-token behaviour)."""
    tok = json.load(open(TOKEN_FILE))
    tok["obtained_at"] = 0
    _save(tok)
    _token()
    print("refresh ok")


class MCP:
    def __init__(self):
        self.h = {"Authorization": "Bearer " + _token(), "Accept": "application/json, text/event-stream"}
        self.id = 0
        r = self._rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                     "clientInfo": {"name": "wanwu-duijue", "version": "0.1"}})
        self._rpc("notifications/initialized", None, notify=True)
        self.server = r

    def _rpc(self, method, params, notify=False):
        msg = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        if not notify:
            self.id += 1
            msg["id"] = self.id
        st, hdr, body = _post(MCP_URL, msg, self.h)
        sid = hdr.get("Mcp-Session-Id") or hdr.get("mcp-session-id")
        if sid:
            self.h["Mcp-Session-Id"] = sid
        if notify:
            return None
        if st >= 300:
            raise RuntimeError(f"{method} HTTP {st}: {body[:500]}")
        if body.lstrip().startswith("{"):
            data = json.loads(body)
        else:  # SSE: take the last data line carrying our id
            data = None
            for line in body.splitlines():
                if line.startswith("data:"):
                    d = json.loads(line[5:].strip())
                    if d.get("id") == msg["id"]:
                        data = d
        if data is None:
            raise RuntimeError(f"{method}: no response")
        if "error" in data:
            raise RuntimeError(f"{method}: {data['error']}")
        return data["result"]

    def call(self, tool, args):
        res = self._rpc("tools/call", {"name": tool, "arguments": args})
        texts = [c.get("text", "") for c in res.get("content", []) if c.get("type") == "text"]
        out = None
        for t in texts:
            try:
                out = json.loads(t)
            except ValueError:
                pass
        if res.get("isError"):
            raise RuntimeError(f"{tool}: {' '.join(texts)[:800]}")
        return out if out is not None else {"text": texts, "raw": res}


def _download(url, path):
    with urllib.request.urlopen(url, timeout=600) as r, open(path, "wb") as f:
        f.write(r.read())
    return path


def gen(image, name, out_dir, version="v3.0", quality="high_quality", max_points=70, dry=False):
    os.makedirs(out_dir, exist_ok=True)
    mime = "image/png" if image.lower().endswith(".png") else "image/jpeg"
    b64 = base64.b64encode(open(image, "rb").read()).decode()
    m = MCP()
    up = m.call("upload_input", {"image_base64": b64, "mime_type": mime})
    q = m.call("quote_generation", {"file_tokens": [up["file_token"]], "version": version,
                                    "model_type": quality, "generation_type": "model_with_texture",
                                    "pbr": True, "license": "private"})
    pts = q.get("estimated_points")
    if dry or pts is None or pts > max_points:
        return {"name": name, "status": "quoted_only", "points": pts, "available": q.get("available_points")}
    t0 = time.time()
    c = m.call("create_generation", {"quote_id": q["quote_id"], "confirmed": True})
    task_id = c.get("task_id") or c.get("task", {}).get("task_id")
    task = c
    while time.time() - t0 < 1800:
        task = m.call("get_task", {"task_id": task_id})
        if task.get("status") in ("succeeded", "failed"):
            break
        time.sleep(max(5, int(task.get("next_poll_after") or 10)))
    result = {"name": name, "task_id": task_id, "points": task.get("actual_points", pts),
              "status": task.get("status"), "seconds": round(time.time() - t0),
              "model_page_url": task.get("model_page_url"), "error": task.get("error")}
    if task.get("status") == "succeeded":
        outs = m.call("get_task_outputs", {"task_id": task_id})
        json.dump(outs, open(os.path.join(out_dir, f"{name}_outputs.json"), "w"), indent=1, ensure_ascii=False)
        # signed links expire within about an hour and get_task_outputs keeps
        # returning the same ones, so download right away
        files = []
        for a in outs.get("assets", []) or []:
            u = a.get("url")
            if not u:
                continue
            p = urllib.parse.urlparse(u).path
            ext = os.path.splitext(p)[1] or ".bin"
            kind = "preview" if "/preview/" in p else ("cover" if "/cover/" in p else "model")
            files.append(_download(u, os.path.join(out_dir, f"{name}_{kind}{ext}")))
        result["files"] = files
    return result


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == "login":
        login()
    elif a[0] == "refresh":
        refresh_now()
    elif a[0] == "balance":
        print(json.dumps(MCP().call("get_balance", {}), ensure_ascii=False))
    elif a[0] == "call":
        print(json.dumps(MCP().call(a[1], json.loads(a[2]) if len(a) > 2 else {}), ensure_ascii=False, indent=1))
    elif a[0] == "gen":
        opts = {"version": "v3.0", "quality": "high_quality", "max_points": 70, "dry": False}
        rest, i = a[1:], 0
        pos = []
        while i < len(rest):
            if rest[i] == "--version": opts["version"] = rest[i + 1]; i += 2
            elif rest[i] == "--quality": opts["quality"] = rest[i + 1]; i += 2
            elif rest[i] == "--max-points": opts["max_points"] = int(rest[i + 1]); i += 2
            elif rest[i] == "--dry-run": opts["dry"] = True; i += 1
            else: pos.append(rest[i]); i += 1
        print(json.dumps(gen(*pos, **opts), ensure_ascii=False))
    else:
        sys.exit(__doc__)
