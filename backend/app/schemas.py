from pydantic import BaseModel
from typing import Optional
import uuid


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


class HistoryItem(BaseModel):
    id: str
    image_url: str
    disease_name: str
    is_healthy: bool
    confidence: float
    severity: Optional[str]
    plant_type: Optional[str]
    created_at: str


class HistoryResponse(BaseModel):
    scans: list[HistoryItem]
    total: int
    has_more: bool


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str


class ErrorResponse(BaseModel):
    error: str
    code: str
