from fastapi import APIRouter
from app.schemas import HealthResponse
from app.models.classifier import classifier

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        model_loaded=classifier.is_loaded(),
        version="1.0.0",
    )
