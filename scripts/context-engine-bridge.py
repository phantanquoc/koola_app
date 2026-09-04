
"""
Context Engine bridge — auto codebase-retrieval như Claude Code.
Router: http://127.0.0.1:6699  Repo endpoint: /mcp-repo/d__desktop_app_koola (.mcp.json)
Dùng ở session mới:
  exec(open("scripts/context-engine-bridge.py", encoding="utf-8").read())
  ce("How does AuthContext restore session?")
"""
import http.client, json, re
BASE="127.0.0.1"; PORT=6699; MCP_PATH="/mcp-repo/d__desktop_app_koola"; WORKSPACE="d:\\desktop\\app_koola"
def _new_sid(timeout=30):
    import http.client, json
    c=http.client.HTTPConnection(BASE,PORT,timeout=timeout)
    c.request("POST",MCP_PATH,json.dumps({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"omp-bridge","version":"1.0"}}}),{"Accept":"application/json, text/event-stream","Content-Type":"application/json"})
    r=c.getresponse(); sid=r.getheader("mcp-session-id") or r.getheader("Mcp-Session-Id") or ""; r.read()
    if not sid: raise RuntimeError("No mcp-session-id")
    return sid
def ce(query, workspace=WORKSPACE, timeout=240):
    """Auto codebase-retrieval. query: natural language. Returns snippets with file#L."""
    sid=_new_sid()
    c=http.client.HTTPConnection(BASE,PORT,timeout=timeout)
    c.request("POST",MCP_PATH,json.dumps({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"codebase-retrieval","arguments":{"information_request":query,"workspace_full_path":workspace}}}),{"Accept":"application/json, text/event-stream","Content-Type":"application/json","mcp-session-id":sid})
    raw=c.getresponse().read().decode(errors="replace")
    out=None
    for m in re.finditer(r"^data:\s*(\{.*)$", raw, re.M):
        try:
            o=json.loads(m.group(1))
            if "result" in o or "error" in o: out=o
        except: pass
    if not out: return raw[:8000]
    if "error" in out: return f"ERROR {out['error']}"
    return out["result"]["content"][0]["text"]
try:
    import builtins as _b; _b.ce=ce
except: pass
