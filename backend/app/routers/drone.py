import math

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.auth import require_api_key
from app.config import settings
from app.db import supabase
from app.models.classifier import classifier
from app.schemas import PredictResponse

router = APIRouter(prefix="/drone", tags=["drone"])


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.post("/scan", response_model=PredictResponse)
async def drone_scan(
    file: UploadFile = File(...),
    lat: float = Form(...),
    lon: float = Form(...),
    field_id: str | None = Form(None),
    auth: tuple[str, str] = Depends(require_api_key),
):
    user_id, key_id = auth

    if not classifier.is_loaded():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Model is not loaded")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="File must be an image")

    plants_res = supabase.table("plants").select("id, latitude, longitude").eq("user_id", user_id).execute()

    plant_id: str | None = None
    min_dist = float("inf")
    for plant in (plants_res.data or []):
        d = _haversine_m(lat, lon, float(plant["latitude"]), float(plant["longitude"]))
        if d < min_dist:
            min_dist = d
            if d <= 10:
                plant_id = plant["id"]

    if plant_id is None:
        new_plant = supabase.table("plants").insert({
            "user_id": user_id,
            "field_id": field_id,
            "latitude": lat,
            "longitude": lon,
        }).execute()
        if new_plant.data:
            plant_id = new_plant.data[0]["id"]

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
        "source": "drone",
    }).execute()

    if plant_id:
        supabase.table("plants").update({
            "plant_type": result["plant_type"],
            "last_scanned_at": result["created_at"],
        }).eq("id", plant_id).execute()

    supabase.table("api_keys").update({
        "last_used_at": result["created_at"],
    }).eq("id", key_id).execute()

    return PredictResponse(**result)
