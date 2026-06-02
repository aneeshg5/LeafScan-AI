# LeafScan

A plant disease detection system for farmers — point your phone at a leaf, get a diagnosis in under a second, then ask an AI agronomist what to do about it.

**Live API:** `https://leafscan-api-1due.onrender.com` · **[Interactive Docs](https://leafscan-api-1due.onrender.com/docs)**

![Stack](https://img.shields.io/badge/React_Native-Expo_54-black?logo=expo)
![Stack](https://img.shields.io/badge/FastAPI-Python_3.11-009688?logo=fastapi)
![Stack](https://img.shields.io/badge/PyTorch-EfficientNet--B0-EE4C2C?logo=pytorch)
![Stack](https://img.shields.io/badge/Supabase-Postgres_+_Storage-3ECF8E?logo=supabase)
![CI](https://github.com/aneeshg5/tensor-crop-tracker/actions/workflows/ci.yml/badge.svg)

---

## Try it

**On your phone — fastest path:**
1. Install [Expo Go](https://expo.dev/go) on iOS or Android
2. Clone this repo, create `mobile/.env` (see [Mobile setup](#mobile)), run `npx expo start`
3. Scan the QR code that appears in the terminal

**Explore the live API:**
```bash
curl https://leafscan-api-1due.onrender.com/health
# {"status":"ok","model_loaded":true,"version":"1.0.0"}
```
Full interactive docs at `/docs` (Swagger UI). All endpoints except `/health` require a Bearer token or API key.

> The free-tier server cold-starts in ~30 seconds after inactivity.

---

## Screenshots

<!-- Add screenshots to docs/assets/ to display them here -->
| Dashboard | Scan Result | Field Map | Crop Advisor |
|:---------:|:-----------:|:---------:|:------------:|
| <img src="docs/assets/dashboard.png" width="200"> | <img src="docs/assets/result.png" width="200"> | <img src="docs/assets/map.png" width="200"> | <img src="docs/assets/chat.png" width="200"> |

---

## What it does

| Screen | Description |
|--------|-------------|
| **Dashboard** | Field health stats — overdue plants, weekly scan count with avg model confidence, field health % vs. prior week, at-risk count. 7-day stacked bar chart, disease intelligence (prevalence + confidence per disease), field monitoring coverage, and a triage list for plants needing attention |
| **Scan** | Camera or photo library → multipart upload → EfficientNet-B0 inference → disease name, severity, description, and treatment list in under 1 s |
| **Map** | Google Maps hybrid view with color-coded pins (green = healthy, red = diseased). Tap a pin for a slide-up panel with the latest scan photo, confidence score, severity, and quick links to history and AI chat |
| **History** | Paginated scan log filterable by field. Plants can be renamed with uniqueness validation |
| **Crop Advisor** | Per-plant AI chat backed by GPT-4o-mini + Tavily web search + Serper shopping links. Builds persistent per-plant memory across conversations |
| **Settings** | Drone API key management — create and revoke keys. Raw key shown once at creation; SHA-256 hash stored at rest |

---

## Architecture

```
┌──────────────────────────────────────┐
│        Mobile App (Expo/RN)          │
│  expo-router · Supabase anon key     │
│  Row Level Security on all reads     │
└────────────┬─────────────────────────┘
             │  Bearer JWT
             ▼
┌──────────────────────────────────────┐
│      FastAPI  (Docker → Render)      │
│                                      │
│  /predict     EfficientNet-B0        │
│  /chat        GPT-4o-mini + search   │
│  /drone/scan  API-key auth, GPS      │
│  /history     paginated scan log     │
│  /api-keys    key lifecycle CRUD     │
└──────┬──────────┬──────────┬─────────┘
       │          │          │
       ▼          ▼          ▼
  Supabase    Tavily      OpenAI / Serper
  Postgres    Search      GPT-4o-mini +
  + Storage   (grounded   shopping links
  (RLS)        answers)
```

Scan data flow:
1. Mobile uploads `multipart/form-data` image + optional `plant_id`
2. Backend checks a rolling 24-hour rate limit against the `scans` table count
3. EfficientNet-B0 infers the class index; metadata JSON resolves it to disease name, severity, treatments
4. Image stored in Supabase Storage; scan row inserted; plant `last_scanned_at` updated
5. `PredictResponse` returned in < 1 s

---

## Engineering highlights

**EfficientNet-B0 for inference-per-cost**
EfficientNet-B0 achieves ~97% top-1 accuracy on the 38-class PlantVillage benchmark at 5.3M parameters — roughly a tenth the size of ResNet-50. Inference runs in under 200 ms on a CPU-only Render free instance with no quantization needed. The head is replaced with a 1280 → 38 linear layer fine-tuned on PlantVillage, with standard ImageNet normalization applied at inference time.

**Keyword-gated web search**
The chat router maintains a frozenset of 60+ agricultural terms covering symptoms, pathogens, treatments, and plant anatomy. Only messages that intersect this set trigger a Tavily API call. Purely conversational turns skip the search, cutting latency and API cost by ~70% in typical use.

**Rolling 24-hour rate limiting without schema changes**
`POST /predict` enforces a configurable daily limit by counting rows in the existing `scans` table filtered by `user_id` and `created_at >= now() - 24h`. Limit is controlled by `SCAN_DAILY_LIMIT` env var. No Redis, no new columns — same pattern as the chat credit rolling window.

**Haversine auto-matching for drone scans**
`POST /drone/scan` accepts latitude and longitude alongside the image. The backend computes Haversine distance from the submitted point to every plant owned by the API key's user. A match within 10 m attributes the scan to that plant; otherwise a new plant record is created at those coordinates. A drone can map an entire field without any pre-registration.

**API keys as SHA-256 hashes**
Keys are prefixed `lscan_` and generated with `secrets.token_hex(32)` (256 bits of entropy). Only the SHA-256 hash lands in the database. The raw key is surfaced exactly once in the Settings screen. Revocation flips a `revoked_at` timestamp; the auth lookup filters `IS NULL` on that column.

**Per-plant AI memory**
After each chat exchange, a second lightweight GPT-4o-mini call (capped at 200 tokens) extracts 1–3 plant-specific observations and writes them to a `plant_memories` table. Future sessions prepend these facts to the system prompt, giving the model continuity across conversations without storing full message history.

**Security boundary: anon key on mobile, service role on server**
The mobile app ships only the Supabase anon key. Every DB write is enforced by Row Level Security. The service role key — which bypasses RLS — lives exclusively in the backend's environment variables and is never present in the mobile bundle.

---

## Getting started

### Backend

Requirements: Python 3.11+

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

### Mobile

Requirements: Node 18+, [Expo Go](https://expo.dev/go) on your phone

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

---

## Drone / machine API

Any program with an API key can submit scans autonomously. Full reference in **[docs/api.md](docs/api.md)**.

```bash
# 1. Create a key: mobile app → Settings → API Keys
# 2. Submit a scan from a drone or script
curl -X POST https://leafscan-api-1due.onrender.com/drone/scan \
  -H "X-API-KEY: lscan_your_key_here" \
  -F "file=@leaf.jpg" \
  -F "lat=40.1106" \
  -F "lon=-88.2073"
```

The response is the same `PredictResponse` JSON as `/predict`. GPS coordinates trigger automatic plant-record creation or matching (10 m radius using Haversine distance).

---

## Deployment

**Backend — Render**

`render.yaml` is included at the repo root. Connect the repo in Render and set these env vars in the dashboard:

| Variable | Source |
|----------|--------|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` key |
| `OPENAI_API_KEY` | platform.openai.com |
| `TAVILY_API_KEY` | app.tavily.com |
| `SERPER_API_KEY` | serper.dev (optional) |

**Mobile — EAS Build**

```bash
cd mobile
eas build --platform ios --profile preview     # ad-hoc IPA
eas build --platform android --profile preview  # APK
```

EAS project: `@practicegod13/leafscan`

---

## CI

GitHub Actions runs on every push and PR to `main`:
- **Backend**: `ruff check` + `pytest tests/`
- **Mobile**: `npx tsc --noEmit`

Tests run without secrets — they only check `/health` and unauthenticated `/predict` (expects 403).
