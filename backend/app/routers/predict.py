from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.auth import require_auth
from app.config import settings
from app.db import supabase
from app.models.classifier import classifier
from app.schemas import PredictResponse

router = APIRouter()


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
    result = classifier.predict(image_bytes)
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
