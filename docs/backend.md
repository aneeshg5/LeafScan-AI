# Backend — Line by Line

This document explains every line of the backend. You have CS fundamentals, so
the focus is on what's FastAPI/Python-specific rather than what's general programming.

---

## The big picture before reading any file

The backend is a **FastAPI** web server. FastAPI is a Python framework — think of
it like Express (Node) or Spring (Java) but for Python, with one key feature: it
reads Python type annotations and uses them to automatically validate requests,
serialize responses, and generate API docs at `/docs`.

The server does one job: receive an image, run it through a PyTorch model, return
a JSON diagnosis. Everything else (auth, history, health check) exists to support
or gate that flow.

Request lifecycle:
```
Mobile app → POST /predict (multipart image)
  → auth middleware checks JWT
  → predict router reads the file
  → classifier.predict() runs the model
  → response serialized to JSON via Pydantic schema
  → JSON back to mobile app
```

---

## `app/config.py`

```python
from pydantic_settings import BaseSettings
```
`pydantic_settings` is a separate package from Pydantic. It provides `BaseSettings`,
a special base class that reads values from environment variables (and `.env` files)
rather than being constructed manually. Keeps all config in one place, no
`os.environ.get()` scattered throughout the codebase.

```python
class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_key: str = ""
    model_weights_path: str = "./ml/weights/efficientnet_plantvillage.pt"
    supabase_storage_bucket: str = "leaf-images"
    port: int = 8000
    environment: str = "development"
```
Each field is a typed class attribute with a default value. When `Settings()` is
instantiated, pydantic-settings looks for environment variables matching each field
name (case-insensitive). So `supabase_url` maps to the `SUPABASE_URL` env var. If
the env var exists, it overrides the default. If not, the default is used.

The type annotation (`str`, `int`) is not just documentation — pydantic will coerce
and validate the value. If `PORT=abc` is in the env, it raises a validation error
rather than silently passing a string where an int is expected.

```python
    class Config:
        env_file = ".env"
```
Inner `Config` class is pydantic's configuration hook. `env_file = ".env"` tells
pydantic-settings to also read from a `.env` file in the working directory if it
exists. This is only for local dev — in production (Render), the real env vars
are set directly on the server and the `.env` file doesn't exist.

```python
settings = Settings()
```
Instantiates the settings object once at module import time. Every other file does
`from app.config import settings` and reads values off this singleton. This means
config is read once when the server starts, not on every request.

---

## `app/schemas.py`

```python
from pydantic import BaseModel
from typing import Optional
import uuid
```
`BaseModel` is the core Pydantic class. Any class that inherits from it gets
automatic validation, serialization, and JSON conversion. `Optional` is a type
hint meaning the field can be either the specified type or `None`. The `uuid`
import is unused right now — leftover, will be cleaned up.

```python
class PredictResponse(BaseModel):
    scan_id: str
    disease_name: str
    is_healthy: bool
    confidence: float
    severity: Optional[str]
    description: str
    treatments: list[str]
    plant_type: str
    created_at: str
```
This is the shape of the JSON the mobile app receives after a scan. FastAPI uses
this class in two directions:

1. **Output validation** — when the router returns a `PredictResponse` instance,
   FastAPI serializes it to JSON automatically. If a required field is missing,
   FastAPI raises a 500 before it reaches the client.
2. **Documentation** — FastAPI reads this class and generates the response schema
   in the auto-generated Swagger UI at `/docs`.

`severity: Optional[str]` means this field can be `null` in the JSON — a healthy
plant has no severity level.

`treatments: list[str]` — Pydantic handles nested types. This serializes to a
JSON array of strings: `["Remove infected parts", "Apply fungicide"]`.

```python
class HistoryItem(BaseModel): ...
class HistoryResponse(BaseModel): ...
```
`HistoryResponse` wraps a list of `HistoryItem` objects. This pattern (wrapper
with pagination metadata) is standard for list endpoints — the mobile app needs
`total` and `has_more` to know whether to fetch more pages.

```python
class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str
```
Simple uptime check shape. `model_loaded` is important for the mobile app to know
whether to show a "server is warming up" state versus a real error.

```python
class ErrorResponse(BaseModel):
    error: str
    code: str
```
All failure responses across the API will use this shape. Having a consistent error
format means the mobile app only needs one error-handling path.

---

## `app/auth.py`

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
```
`Depends` is FastAPI's dependency injection system — covered more below.
`HTTPBearer` is a built-in FastAPI security helper that extracts a Bearer token
from the `Authorization` header. `HTTPException` raises HTTP errors with a status
code and message. `status` is just a collection of named HTTP status code
constants (`status.HTTP_401_UNAUTHORIZED == 401`).

```python
bearer = HTTPBearer()
```
Creates an instance of the Bearer token extractor. When used as a dependency, it
reads the `Authorization: Bearer <token>` header from the request and parses it
into an `HTTPAuthorizationCredentials` object.

```python
async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
```
This is a **dependency function** — the core of FastAPI's auth pattern.

`Depends(bearer)` means: before calling `require_auth`, FastAPI should first call
`bearer(request)` and pass the result in as `credentials`. If the request has no
`Authorization` header, `bearer` itself raises a 403 before `require_auth` even
runs.

The return type `-> str` signals to callers that this function yields a `user_id`
string. Any router that declares `user_id: str = Depends(require_auth)` gets the
user_id injected automatically — no manual header parsing in the router.

```python
    token = credentials.credentials
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    return "placeholder_user_id"
```
Right now this is a stub — it accepts any Bearer token and returns a hardcoded
user ID. In Phase 2 this is replaced with real JWT verification against Supabase's
public key. The function signature and return type stay the same, so every router
that uses `require_auth` gets real auth for free without changing.

---

## `app/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.routers import health, predict, history
from app.models.classifier import classifier
```
Standard imports. `asynccontextmanager` is a Python stdlib decorator for writing
async context managers using `yield` syntax — used for the lifespan handler below.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    classifier.load()
    yield
```
**Lifespan** is FastAPI's startup/shutdown hook. Code before `yield` runs once
when the server starts. Code after `yield` (if any) runs when the server shuts
down. This is where the ML model weights are loaded into memory — you want that
to happen once at startup, not on every request.

`classifier.load()` currently does nothing if no weights file exists, so the
server still boots cleanly without the model.

```python
app = FastAPI(title="LeafScan API", version="1.0.0", lifespan=lifespan)
```
Creates the FastAPI application. `title` and `version` appear in the auto-generated
docs at `/docs`. `lifespan=lifespan` wires up the startup hook above.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```
**CORS** (Cross-Origin Resource Sharing) is a browser security policy that blocks
web pages from making requests to a different domain than the one that served them.
The mobile app isn't a browser so CORS doesn't technically apply, but leaving it
open with `"*"` means this API can also be hit from a web browser during
development. In production you'd tighten this to the specific app origin.

```python
app.include_router(health.router)
app.include_router(predict.router)
app.include_router(history.router)
```
Each router module exports a `router` object containing one or more route
definitions. `include_router` mounts all those routes onto the main app. This is
the FastAPI equivalent of Express's `app.use('/path', router)`, except we're not
using path prefixes here — routes are defined with their full paths inside each
router file.

---

## `app/routers/health.py`

```python
from fastapi import APIRouter
from app.schemas import HealthResponse
from app.models.classifier import classifier
```
`APIRouter` is a mini-app that holds route definitions. It gets mounted onto the
main `app` in `main.py`. Structurally identical to the main `FastAPI` instance for
defining routes, just not a full application.

```python
router = APIRouter()
```
Creates the router instance that `main.py` imports.

```python
@router.get("/health", response_model=HealthResponse)
async def health():
```
`@router.get("/health")` registers this function as the handler for `GET /health`.
`response_model=HealthResponse` tells FastAPI two things: validate the return value
against `HealthResponse` before sending, and document this shape in `/docs`.

`async def` — FastAPI is built on asyncio. Declaring handlers as `async` lets the
server handle many concurrent requests without blocking. For this endpoint it
doesn't matter much (no I/O), but it's consistent with endpoints that do await I/O.

```python
    return HealthResponse(
        status="ok",
        model_loaded=classifier.is_loaded(),
        version="1.0.0",
    )
```
Instantiates the Pydantic model and returns it. FastAPI sees a `BaseModel` instance
returned from a route and serializes it to JSON automatically. `classifier.is_loaded()`
is `False` until the weights file exists and `load()` completes.

---

## `app/routers/predict.py`

```python
from fastapi import APIRouter, UploadFile, File, Form, Depends
from typing import Optional
from app.schemas import PredictResponse
from app.auth import require_auth
```
`UploadFile` is FastAPI's file upload type — wraps the raw bytes with metadata
(filename, content type). `File(...)` and `Form(None)` are FastAPI field
descriptors that declare where in the request each parameter comes from.

```python
@router.post("/predict", response_model=PredictResponse)
async def predict(
    file: UploadFile = File(...),
    plant_type: Optional[str] = Form(None),
    user_id: str = Depends(require_auth),
):
```
The `POST /predict` handler takes three things:

- `file: UploadFile = File(...)` — the image file from a `multipart/form-data`
  request body. `...` (Ellipsis) means required — FastAPI returns 422 if missing.
- `plant_type: Optional[str] = Form(None)` — an optional text field in the same
  multipart body. The mobile app can send `"tomato"` here as a hint to the model,
  or omit it entirely.
- `user_id: str = Depends(require_auth)` — not a request parameter at all.
  FastAPI sees `Depends(require_auth)`, calls `require_auth` (which calls `bearer`),
  and injects the returned user_id. If auth fails, the request never reaches the
  function body.

Using `File(...)` and `Form(...)` together in the same handler is why we need
`python-multipart` in `requirements.txt` — FastAPI delegates multipart parsing
to that library.

```python
    image_bytes = await file.read()
    raise NotImplementedError("Phase 1: implement classifier call here")
```
`await file.read()` reads the uploaded file into memory as bytes. It's `await`
because file reading is I/O — in async Python, I/O operations must be awaited so
the event loop can handle other requests while waiting. Phase 1 replaces the
`NotImplementedError` with the actual classifier call.

---

## `app/routers/history.py`

```python
from fastapi import APIRouter, Depends, Query
from typing import Literal
from app.schemas import HistoryResponse
from app.auth import require_auth
```
`Query` is to URL query parameters what `File` and `Form` are to request bodies —
a field descriptor that tells FastAPI where to read the value from and how to
validate it. `Literal` constrains a string to a fixed set of allowed values.

```python
@router.get("/history", response_model=HistoryResponse)
async def history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    filter: Literal["all", "healthy", "diseased"] = "all",
    user_id: str = Depends(require_auth),
):
```
`Query(20, ge=1, le=100)` — default value of `20`, with validation constraints:
`ge=1` (greater-than-or-equal, minimum 1), `le=100` (maximum 100). FastAPI returns
422 automatically if the client sends `?limit=0` or `?limit=999`.

`Literal["all", "healthy", "diseased"]` — FastAPI validates that the value is one
of those three strings. Anything else is a 422. This is equivalent to an enum
without the extra ceremony.

```python
    return HistoryResponse(scans=[], total=0, has_more=False)
```
Stub that returns an empty history. Phase 2 replaces this with a Supabase query
filtered by `user_id`.

---

## `app/models/classifier.py`

```python
import os
from app.config import settings
```
`os` is used to check if the weights file exists before trying to load it.

```python
class PlantClassifier:
    def __init__(self):
        self._loaded = False
```
Plain Python class. `_loaded` is a private flag (the leading underscore is a
Python convention for "internal, don't touch from outside"). Starts as `False`
because the model hasn't been loaded yet.

```python
    def load(self):
        if not os.path.exists(settings.model_weights_path):
            return
        # Phase 1: torch.load + model.eval() here
        self._loaded = True
```
Called once at server startup via `lifespan`. The early return means the server
still starts cleanly even without the weights file — `is_loaded()` will return
`False` and the health endpoint will reflect that. Phase 1 fills in the PyTorch
loading logic between the check and `self._loaded = True`.

```python
    def predict(self, image_bytes: bytes) -> dict:
        if not self._loaded:
            raise RuntimeError("Model not loaded")
        raise NotImplementedError("Phase 1")
```
Takes raw image bytes (exactly what `await file.read()` returns in the predict
router) and returns a dict. The guard clause up front means calling predict without
weights raises a `RuntimeError` with a clear message rather than a cryptic PyTorch
error. Phase 1 replaces the second raise with actual inference.

```python
classifier = PlantClassifier()
```
Module-level singleton. Python executes module-level statements once when the
module is first imported. Every file that does `from app.models.classifier import
classifier` gets the same object — the one that gets `.load()` called on it at
startup. This is how the loaded model stays in memory across requests without
being a global variable in the traditional sense.

---

## `requirements.txt`

```
fastapi==0.115.0          # The web framework
uvicorn[standard]==0.30.6 # ASGI server that runs FastAPI (like Gunicorn but async)
python-multipart==0.0.9   # Parses multipart/form-data (required for file uploads)
pydantic==2.8.2           # Data validation (FastAPI depends on this)
pydantic-settings==2.4.0  # The BaseSettings env-var loader in config.py
torch==2.4.1              # PyTorch — the ML framework
torchvision==0.19.1       # Computer vision utilities + pretrained models
Pillow==10.4.0            # Image decoding (bytes → PIL Image → tensor)
httpx==0.27.2             # Async HTTP client (used in tests, and later for Supabase calls)
supabase==2.7.4           # Official Supabase Python client (Phase 2)
python-jose[cryptography]==3.3.0  # JWT decoding for Supabase token verification (Phase 2)
ruff==0.6.8               # Linter (replaces flake8 + black + isort)
pytest==8.3.3             # Test runner
pytest-asyncio==0.24.0    # Lets pytest run async test functions
```

All versions are pinned (`==`) rather than using ranges (`>=`). This ensures the
Docker container and every developer's machine run identical code. If a dependency
releases a breaking change, pinning means it doesn't silently break the build.

---

## `Dockerfile`

```dockerfile
FROM python:3.11-slim AS base
```
Uses the official Python 3.11 image, slim variant. `slim` drops documentation,
test files, and some build tools, reducing the image from ~900MB to ~130MB. The
`AS base` names this stage for multi-stage builds — not used yet, but the pattern
is in place for a future builder/runner split.

```dockerfile
WORKDIR /app
```
Sets the working directory inside the container. All subsequent `COPY`, `RUN`, and
`CMD` instructions operate relative to `/app`.

```dockerfile
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
```
Copies only `requirements.txt` first and installs deps before copying the rest of
the code. This is a deliberate Docker layer caching optimization — Docker caches
each instruction as a layer. If only the application code changes (not
`requirements.txt`), Docker reuses the cached `pip install` layer and the rebuild
takes seconds instead of minutes.

`--no-cache-dir` tells pip not to cache downloaded packages inside the image,
keeping the final image smaller.

```dockerfile
COPY . .
```
Copies the rest of the backend code into `/app`. Happens after the pip install
so the expensive layer is cached independently.

```dockerfile
EXPOSE 8000
```
Documents that the container listens on port 8000. Doesn't actually open the port —
that's done at `docker run -p 8000:8000`. This is metadata for tooling and humans.

```dockerfile
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```
The default command when the container starts. `app.main:app` tells uvicorn the
module path (`app/main.py`) and the FastAPI instance name (`app`). `--host 0.0.0.0`
binds to all network interfaces inside the container — without this, the server
only accepts connections from localhost inside the container and is unreachable
from outside.
