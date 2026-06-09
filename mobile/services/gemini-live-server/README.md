# Aboy AI — Gemini Live WebSocket proxy

A small Node service that bridges the mobile app and the Gemini Live API
(`BidiGenerateContent`). The phone never holds the Gemini key — it talks only
to this proxy, which holds the key and pipes frames both ways.

```
phone  <--WS-->  this proxy  <--WS-->  Gemini Live API
```

## What it does
- Accepts a WebSocket from the phone (`wss://<this-service>/?userId=<uuid>`)
- Opens an upstream WebSocket to Gemini Live with `GEMINI_API_KEY`
- Pipes all frames in both directions (audio in, audio + transcript out)
- Parses `inputTranscription` / `outputTranscription` to build a transcript
- On disconnect, writes the transcript to Supabase `ai_live_sessions`
- Reconnects to Gemini with exponential backoff (1s→8s) and surfaces
  `rate_limited` / `reconnecting` status frames to the phone on 429/overload

## Run locally
```bash
cd mobile/services/gemini-live-server
cp .env.example .env   # fill in the values
npm install
npm start              # listens on :8080, /health returns 200
```

## Deploy on Railway (separate service)
1. Railway → your project → **New** → **GitHub Repo** → select `Dstbobo/aboy-ai`
2. Set **Root Directory** to `mobile/services/gemini-live-server`
3. Add variables:
   - `GEMINI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `PORT=8080`
4. Deploy. Copy the public URL and use its `wss://` form as `GEMINI_LIVE_URL`
   in the mobile app (e.g. `wss://aboy-live-production.up.railway.app`).

## Control frames (phone → proxy)
- `{"type":"auth","userId":"<uuid>"}` — associates the session with a user
  (also accepted via `?userId=` query param)

## Status frames (proxy → phone)
- `{"type":"proxy_status","status":"connected"}`
- `{"type":"proxy_status","status":"reconnecting","attempt":n}`
- `{"type":"proxy_status","status":"rate_limited"}`
- `{"type":"proxy_status","status":"error","detail":"upstream_unavailable"}`

All other frames are raw Gemini Live protocol messages (setup, clientContent,
realtimeInput, serverContent, etc.) passed straight through.
