from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.auth import require_auth
from app.config import settings
from app.db import supabase
from app.models.classifier import OODException, classifier
from app.schemas import PredictResponse

router = APIRouter()

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/predict", response_model=PredictResponse)
async def predict(
    file: UploadFile = File(...),
    plant_id: str | None = Query(None),
    user_id: str = Depends(require_auth),
):
    if not classifier.is_loaded():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Model is not loaded")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="File must be an image")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image exceeds the 10 MB size limit.",
        )

    # Run inference (+ OOD check) before the rate-limit query so rejected
    # images don't consume the user's daily scan quota.
    try:
        result = classifier.predict(image_bytes)
    except OODException:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image doesn't appear to be a plant leaf. Please photograph a leaf clearly in good lighting.",
        )

    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    count_res = (
        supabase.table("scans")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .gte("created_at", since)
        .execute()
    )
    if (count_res.count or 0) >= settings.scan_daily_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily scan limit of {settings.scan_daily_limit} reached. Resets in 24 hours.",
        )

    scan_id = result["scan_id"]
    storage_path = f"{user_id}/{scan_id}.jpg"

    supabase.storage.from_(settings.supabase_storage_bucket).upload(
        path=storage_path,
        file=image_bytes,
        file_options={"content-type": file.content_type},
    )

    supabase.table("scans").insert({
        "id": scan_id,
        "user_id": user_id,
        "plant_id": plant_id,
        "image_url": storage_path,
        "disease_name": result["disease_name"],
        "is_healthy": result["is_healthy"],
        "confidence": result["confidence"],
        "severity": result.get("severity"),
        "plant_type": result["plant_type"],
        "description": result["description"],
        "treatments": result["treatments"],
        "source": "mobile",
    }).execute()

    if plant_id:
        supabase.table("plants").update({
            "plant_type": result["plant_type"],
            "last_scanned_at": result["created_at"],
        }).eq("id", plant_id).execute()

    return PredictResponse(**result)
