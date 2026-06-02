# API Reference

Base URL: `https://leafscan-api-1due.onrender.com`

Interactive docs (Swagger UI): `GET /docs`

---

## Authentication

Two auth schemes are supported depending on the caller:

| Scheme | Header | Used by |
|--------|--------|---------|
| Supabase JWT | `Authorization: Bearer <jwt>` | Mobile app (all user-facing endpoints) |
| API Key | `X-API-KEY: lscan_<token>` | Drones, scripts, machines (`/drone/*` only) |

JWTs are issued by Supabase Auth when a user signs in. API keys are created through the mobile app (Settings → API Keys) and stored as SHA-256 hashes — the raw key is shown only once at creation.

---

## Endpoints

### `GET /health`

Health check. No auth required.

**Response 200**
```json
{
  "status": "ok",
  "model_loaded": true,
  "version": "1.0.0"
}
```

`model_loaded: false` means the EfficientNet weights failed to load at startup. All `/predict` calls will return 503 in that state.

---

### `POST /predict`

Submit a leaf image for disease classification.

**Auth:** Bearer JWT

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | image/* | Yes | JPEG, PNG, or any PIL-readable format. Max 10 MB |
| `plant_id` | string (UUID) | No | Associates the scan with an existing plant record |

**Rate limit:** 20 scans per rolling 24-hour window per user (configurable via `SCAN_DAILY_LIMIT`).

**Response 200** — `PredictResponse`
```json
{
  "scan_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "disease_name": "Tomato Early Blight",
  "is_healthy": false,
  "confidence": 0.9231,
  "severity": "moderate",
  "description": "Early blight is caused by Alternaria solani...",
  "treatments": [
    "Remove and destroy infected leaves",
    "Apply chlorothalonil-based fungicide",
    "Avoid overhead irrigation"
  ],
  "plant_type": "Tomato",
  "created_at": "2026-06-01T23:45:00.000Z"
}
```

`severity` is one of `low`, `moderate`, `high`, `severe`, or `null` for healthy plants.

**Error responses**

| Status | Condition |
|--------|-----------|
| 401 | Missing or invalid JWT |
| 413 | Image exceeds 10 MB |
| 422 | File is not an image |
| 429 | Daily scan limit reached |
| 503 | Model not loaded |

---

### `POST /drone/scan`

Submit a scan from a drone or automated system with GPS coordinates.

**Auth:** `X-API-KEY` header

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | image/* | Yes | Leaf image. Same constraints as `/predict` |
| `lat` | float | Yes | Latitude of the capture point (decimal degrees) |
| `lon` | float | Yes | Longitude of the capture point (decimal degrees) |
| `field_id` | string (UUID) | No | Assign to a specific field if creating a new plant |

**Plant matching behavior:**
The backend computes Haversine distance from `(lat, lon)` to every plant owned by the API key's user. If a plant is found within **10 meters**, the scan is attributed to that plant. Otherwise, a new plant record is created at the submitted coordinates (optionally assigned to `field_id`).

This means a drone can fly a grid pattern and incrementally build a plant map — no pre-registration required.

**Response 200** — same `PredictResponse` shape as `/predict`

**Error responses**

| Status | Condition |
|--------|-----------|
| 401 | Missing, invalid, or revoked API key |
| 422 | File is not an image, or `lat`/`lon` missing |
| 503 | Model not loaded |

**Example (curl):**
```bash
curl -X POST https://leafscan-api-1due.onrender.com/drone/scan \
  -H "X-API-KEY: lscan_your_key_here" \
  -F "file=@capture_0042.jpg" \
  -F "lat=40.1106" \
  -F "lon=-88.2073" \
  -F "field_id=optional-uuid"
```

**Example (Python):**
```python
import requests

response = requests.post(
    "https://leafscan-api-1due.onrender.com/drone/scan",
    headers={"X-API-KEY": "lscan_your_key_here"},
    data={"lat": 40.1106, "lon": -88.2073},
    files={"file": open("capture.jpg", "rb")},
)
result = response.json()
print(result["disease_name"], result["confidence"])
```

---

### `GET /history`

Paginated scan history for the authenticated user.

**Auth:** Bearer JWT

**Query params**

| Param | Default | Range | Description |
|-------|---------|-------|-------------|
| `limit` | 20 | 1–100 | Page size |
| `offset` | 0 | ≥ 0 | Pagination offset |
| `filter` | `all` | `all`, `healthy`, `diseased` | Filter by health status |
| `plant_id` | — | UUID | Filter to a specific plant |

**Response 200**
```json
{
  "scans": [
    {
      "id": "...",
      "image_url": "user-id/scan-id.jpg",
      "disease_name": "Tomato Early Blight",
      "is_healthy": false,
      "confidence": 0.9231,
      "severity": "moderate",
      "plant_type": "Tomato",
      "created_at": "2026-06-01T23:45:00.000Z"
    }
  ],
  "total": 143,
  "has_more": true
}
```

`image_url` is a relative Supabase Storage path. To render the image, generate a signed URL via the Supabase client.

---

### `POST /chat`

Send a message to the Crop Advisor for a specific plant.

**Auth:** Bearer JWT

**Request body (JSON)**
```json
{
  "plant_id": "uuid",
  "message": "The lower leaves are yellowing and I see brown spots with a yellow halo",
  "image_url": "https://optional-image-url"
}
```

`image_url` is passed to GPT-4o-mini as a vision input when provided.

**Credit limit:** 20 messages per rolling 24-hour window per user (configurable via `CHAT_DAILY_CREDITS`).

**Response 200**
```json
{
  "reply": "The halo pattern you're describing is characteristic of early blight...",
  "sources": [
    { "url": "https://extension.umn.edu/...", "title": "Early Blight Management" }
  ],
  "shopping": [
    {
      "title": "Bonide Copper Fungicide 32 oz",
      "url": "https://www.amazon.com/...",
      "price": "$14.99",
      "store": "Amazon"
    }
  ],
  "credits_remaining": 18
}
```

`sources` contains Tavily search results used to ground the answer (empty if the message didn't trigger a web search). `shopping` contains Serper product results for treatment products mentioned in the reply (empty if `SERPER_API_KEY` is not set).

---

### `GET /chat/{plant_id}/history`

Retrieve full chat history for a plant.

**Auth:** Bearer JWT

**Response 200**
```json
{
  "messages": [
    {
      "id": "...",
      "role": "user",
      "content": "The lower leaves are yellowing...",
      "sources": [],
      "shopping": [],
      "created_at": "2026-06-01T23:50:00.000Z"
    },
    {
      "id": "...",
      "role": "assistant",
      "content": "The halo pattern...",
      "sources": [...],
      "shopping": [...],
      "created_at": "2026-06-01T23:50:02.000Z"
    }
  ]
}
```

---

### `POST /api-keys`

Create a drone API key.

**Auth:** Bearer JWT

**Request body (JSON)**
```json
{ "label": "DJI Mini 4 Pro" }
```

**Response 201**
```json
{
  "id": "uuid",
  "label": "DJI Mini 4 Pro",
  "created_at": "2026-06-01T...",
  "key": "lscan_a1b2c3..."
}
```

The `key` field contains the raw key — store it securely. It is not retrievable after this response.

---

### `GET /api-keys`

List all API keys for the authenticated user.

**Auth:** Bearer JWT

**Response 200**
```json
[
  {
    "id": "uuid",
    "label": "DJI Mini 4 Pro",
    "created_at": "2026-06-01T...",
    "last_used_at": "2026-06-01T...",
    "revoked_at": null
  }
]
```

`revoked_at` is non-null for revoked keys.

---

### `DELETE /api-keys/{key_id}`

Revoke an API key. Sets `revoked_at` — does not delete the row.

**Auth:** Bearer JWT

**Response:** 204 No Content

---

## Data types

### `PredictResponse`

Returned by both `/predict` and `/drone/scan`.

```typescript
{
  scan_id:     string   // UUID
  disease_name: string  // e.g. "Tomato Early Blight"
  is_healthy:  boolean
  confidence:  number   // 0.0–1.0 (softmax probability)
  severity:    string | null  // "low" | "moderate" | "high" | "severe" | null
  description: string  // 1–3 sentence description
  treatments:  string[]
  plant_type:  string  // e.g. "Tomato"
  created_at:  string  // ISO 8601 UTC
}
```

### Supported plant classes (38 total)

Apple (healthy, scab, black rot, cedar rust) · Blueberry (healthy) · Cherry (healthy, powdery mildew) · Corn (healthy, cercospora leaf spot, common rust, northern leaf blight) · Grape (healthy, black rot, esca, leaf blight) · Orange (haunglongbing) · Peach (healthy, bacterial spot) · Pepper (healthy, bacterial spot) · Potato (healthy, early blight, late blight) · Raspberry (healthy) · Soybean (healthy) · Squash (powdery mildew) · Strawberry (healthy, leaf scorch) · Tomato (healthy, bacterial spot, early blight, late blight, leaf mold, septoria leaf spot, spider mites, target spot, mosaic virus, yellow leaf curl virus)
