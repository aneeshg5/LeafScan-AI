from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.auth import require_auth
from app.models.classifier import classifier
from app.schemas import PredictResponse

router = APIRouter()


@router.post("/predict", response_model=PredictResponse)
async def predict(
    file: UploadFile = File(...),
    plant_type: Optional[str] = Form(None),
    user_id: str = Depends(require_auth),
):
    if not classifier.is_loaded():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model is not loaded",
        )

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File must be an image",
        )

    image_bytes = await file.read()
    result = classifier.predict(image_bytes)
    return PredictResponse(**result)
