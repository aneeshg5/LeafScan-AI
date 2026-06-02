# Architecture

## System overview

LeafScan is split into three independently deployable pieces: a React Native mobile app, a FastAPI backend, and Supabase (managed Postgres + object storage + auth).

```
Mobile App          FastAPI Backend         Supabase
──────────          ───────────────         ────────
Expo/RN        →    Docker (Render)    →    Postgres (RLS)
anon key            service role key        Storage buckets
expo-router         EfficientNet-B0         Auth (JWT)
                    GPT-4o-mini
                    Tavily + Serper
```

The mobile app **never** holds the service role key. It uses the anon key, and Supabase's Row Level Security policies enforce that each user can only read and write their own data. The backend is the only client with the service role key, and it only uses it for writes that need to cross user boundaries (e.g., inserting a scan on behalf of a drone API key owner).

---

## Backend

### Startup

On container start, `lifespan()` in `main.py` calls `classifier.load()`, which reads `ml/weights/efficientnet_plantvillage.pt` into memory via `torch.load`. The model stays in RAM for the lifetime of the process — inference is synchronous and returns in < 200 ms on CPU.

If the weights file is missing, the server boots with `model_loaded: false` and all `/predict` and `/drone/scan` requests return 503 until the weights are present.

### Request lifecycle — `/predict`

```
POST /predict  multipart/form-data
  1. HTTPBearer extracts Authorization header
  2. require_auth() calls supabase.auth.get_user(token) → user_id
  3. Rate limit: COUNT scans WHERE user_id = ? AND created_at >= now()-24h
  4. file.read() → image_bytes (checked ≤ 10 MB)
  5. classifier.predict(image_bytes)
       PIL.Image.open → resize 224×224 → normalize → unsqueeze
       model(tensor) → softmax → argmax → class_key
       class_names.json[class_key] → disease_metadata.json[class_key]
  6. supabase.storage.upload(path, image_bytes)
  7. supabase.table("scans").insert(...)
  8. supabase.table("plants").update(last_scanned_at) if plant_id given
  9. Return PredictResponse
```

### Request lifecycle — `/chat`

```
POST /chat  { plant_id, message, image_url? }
  1. Verify JWT → user_id
  2. Load plant row, verify ownership
  3. Load profile → check/reset 24h credit window
  4. Load last 10 scans + last 20 plant_memories (per-plant facts)
  5. Load last 8 chat messages (sliding window context)
  6. _needs_web_search(message) → keyword intersection check
     If true: Tavily search → top 3 results above score 0.5
  7. Build messages[] for OpenAI: system + plant context + history + user
  8. GPT-4o-mini completion (temp 0.2, max 1024 tokens)
  9. Concurrently:
       _extract_product_names(reply) → regex over **bold** terms
       _shopping_search(names) → Serper shopping API
       _extract_facts(plant_label, message, reply) → mini GPT call (200 tokens)
  10. Persist user message, assistant message, decrement credits
  11. Insert new facts into plant_memories
  12. Return ChatResponse { reply, sources, shopping, credits_remaining }
```

### Authentication — two paths

**Mobile (JWT):**
`require_auth` calls `supabase.auth.get_user(token)` which validates the token against Supabase's auth service. Returns the Supabase user ID. No local key verification.

**Drone (API key):**
`require_api_key` reads `X-API-KEY`, SHA-256-hashes it, and looks up the hash in `api_keys` where `revoked_at IS NULL`. Returns `(user_id, key_id)`. The key ID is used to update `last_used_at`.

---

## ML model

| Property | Value |
|----------|-------|
| Architecture | EfficientNet-B0 |
| Parameters | 5.3M (head replaced: 1280 → 38) |
| Training set | PlantVillage (87,000 images, 38 classes) |
| Input size | 224 × 224 RGB |
| Normalization | ImageNet mean/std |
| Output | Softmax probabilities over 38 classes |
| Inference device | CPU |
| Weights size | ~16 MB |

The `disease_metadata.json` file maps each of the 38 class keys to a human-readable disease name, severity, description, and treatment list. This is loaded once at startup alongside the weights.

---

## Database schema (key tables)

```sql
profiles        -- one row per user; holds display_name, chat_credits, credits_reset_at
fields          -- user-defined geographic groupings of plants
plants          -- individual tracked plants; lat/lon; belongs to a field
scans           -- inference results; foreign key to plants; soft-deleted via deleted_at
chat_messages   -- role/content pairs per plant; sources and shopping stored as JSONB
plant_memories  -- per-plant fact strings extracted from chat history
api_keys        -- drone API keys; key_hash (SHA-256), last_used_at, revoked_at
```

All tables have `user_id` columns with RLS policies ensuring `user_id = auth.uid()`. The backend bypasses RLS with the service role key only when inserting drone scans (where the auth principal is the API key, not a JWT user).

---

## Storage buckets

| Bucket | Contents | Access |
|--------|----------|--------|
| `scan-images` | Inference photos at `{user_id}/{scan_id}.jpg` | Private; signed URLs generated per-request |
| `avatars` | User profile photos | Public read |

---

## Mobile

The mobile app uses [expo-router](https://expo.github.io/router/docs) with a file-based routing convention:

```
app/
  (auth)/          -- unauthenticated routes (sign-in, sign-up)
  (tabs)/
    index.tsx      -- Dashboard
    scan.tsx       -- Camera + upload
    map.tsx        -- Field map
    history.tsx    -- Scan history + plant management
    settings.tsx   -- API key management
  chat.tsx         -- Crop Advisor (per-plant, navigated to from Dashboard/Map/History)
  result/          -- Scan result screen
```

Global state (selected field) is provided via a `FieldContext` React context wrapping the tab layout. The `useField()` hook is consumed by Dashboard, Map, and History to filter data to the currently selected field.

The Supabase client is initialized once in `lib/supabase.ts` with the anon key and used throughout. Auth state changes (sign-in, sign-out) trigger automatic re-renders via `supabase.auth.onAuthStateChange`.

---

## CI / CD

**CI (GitHub Actions):** Two jobs run on every push and PR to `main`:
- `backend`: Python 3.11, pip install, `ruff check`, `pytest tests/`
- `mobile`: Node 18, npm install, `npx tsc --noEmit`

Neither job requires secrets. The two backend tests only call `/health` and unauthenticated `/predict` (expects 403).

**CD (Render):** Every push to `main` triggers an automatic Docker rebuild and rolling deploy via Render's GitHub integration. Zero-downtime deploys require a paid Render plan; the free tier briefly interrupts service during deploys.

**Mobile releases (EAS):** `eas build --platform [ios|android] --profile [preview|production]` builds are triggered manually. OTA updates via `eas update` are possible for JS-only changes without a new store release.
