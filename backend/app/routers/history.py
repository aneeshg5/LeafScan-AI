from fastapi import APIRouter, Depends, Query
from typing import Literal
from app.schemas import HistoryResponse
from app.auth import require_auth

router = APIRouter()


@router.get("/history", response_model=HistoryResponse)
async def history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    filter: Literal["all", "healthy", "diseased"] = "all",
    user_id: str = Depends(require_auth),
):
    """Return authenticated user's scan history. Implemented in Phase 2."""
    return HistoryResponse(scans=[], total=0, has_more=False)
