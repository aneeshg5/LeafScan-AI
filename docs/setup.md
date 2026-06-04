# Setup Guide

## Backend

**Requirements:** Python 3.11+

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
SERPER_API_KEY=...          # optional
```

```bash
uvicorn app.main:app --reload --port 8000
# Interactive docs at http://localhost:8000/docs
```

Run tests (no secrets needed):
```bash
pytest tests/ -v
```

Lint:
```bash
ruff check .
```

## Mobile

**Requirements:** Node 18+, [Expo Go](https://expo.dev/go) on your phone

```bash
cd mobile
npm install --legacy-peer-deps
```

Create `mobile/.env`:
```
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
GOOGLE_MAPS_API_KEY=your_maps_key
```

Find your local IP with `ipconfig getifaddr en0` (Mac) or `ip addr` (Linux).

```bash
npx expo start
# Scan the QR in Expo Go, or press i for iOS simulator
```

Type check:
```bash
npx tsc --noEmit
```

## Deployment

### Backend — Render

`render.yaml` is included at the repo root. Connect the repo in Render and set these env vars in the dashboard:

| Variable | Source |
|----------|--------|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` key |
| `OPENAI_API_KEY` | platform.openai.com |
| `TAVILY_API_KEY` | app.tavily.com |
| `SERPER_API_KEY` | serper.dev (optional) |

### Mobile — EAS Build

```bash
cd mobile
eas build --platform android --profile preview  # APK
eas build --platform ios --profile preview      # IPA
```

EAS project: `@practicegod13/leafscan`

## CI

GitHub Actions runs on every push and PR to `main`:
- **Backend**: `ruff check` + `pytest tests/`
- **Mobile**: `npx tsc --noEmit`

Tests run without secrets — they only check `/health` and unauthenticated `/predict` (expects 403).
