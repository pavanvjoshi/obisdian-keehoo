Two URLs matter:

**1. Token server URL** (in `index.html` line 185):

```js
const TOKEN_SERVER_URL = "https://api.dev.yourdomain/token";
```

Replace `/token` (relative) with absolute dev FastAPI URL. Must be `https://` if you later host frontend non-locally; for `localhost` HTTP fine.

**2. LiveKit URL** — not in frontend. FastAPI returns it from `LIVEKIT_URL` env var ([main.py:70](vscode-webview://01kpvifait1nvfgg699raks4o5mguqlak722mnb96ngpv1mfgovc/voice_agent/backend/main.py#L70)). Set on dev FastAPI to public `wss://livekit.dev.yourdomain`. Browser open this wss directly — so it must be reachable from your laptop, TLS valid.

**Flow:**

```
browser → GET https://api.dev.../token  (FastAPI mints token + returns LIVEKIT_URL)
browser → wss://livekit.dev.../  (joins room, agent worker auto-dispatch)
```

**Run frontend local:**

```bash
cd voice_agent/frontend
python -m http.server 8000
# open http://localhost:8000
```

Mic works on `localhost` even over http. CORS already `*` in FastAPI so no block.

**Checklist before test:**

- Dev FastAPI reachable: `curl https://api.dev.yourdomain/health` → `{"status":"ok"}`
- Dev LiveKit reachable: `curl https://livekit.dev.yourdomain` → `OK`
- Dev agent log shows `registered worker`
- Open localhost:8000 → pick language → click connect → speak → agent reply

If fail: browser devtools Network tab → check `/token` 200 + `url` field is `wss://` public



```
Run commands (from `backend/`):

- Token server: `uvicorn app.main:app --port 8080 --reload`
- Agent worker: `python -m app.agent dev`
```

local and dev running
```
uvicorn app.main:app --reload

python -m app.agent dev

python -m http.server 5173
```

