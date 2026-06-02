import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import require_auth
from app.db import supabase
from app.schemas import ApiKeyCreate, ApiKeyCreateResponse, ApiKeyItem

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


@router.post("", response_model=ApiKeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(body: ApiKeyCreate, user_id: str = Depends(require_auth)):
    raw_key = "lscan_" + secrets.token_hex(32)
    result = supabase.table("api_keys").insert({
        "user_id": user_id,
        "label": body.label,
        "key_hash": _hash_key(raw_key),
    }).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create API key")
    row = result.data[0]
    return ApiKeyCreateResponse(id=row["id"], label=row["label"], created_at=row["created_at"], key=raw_key)


@router.get("", response_model=list[ApiKeyItem])
async def list_api_keys(user_id: str = Depends(require_auth)):
    result = supabase.table("api_keys").select(
        "id, label, created_at, last_used_at, revoked_at"
    ).eq("user_id", user_id).order("created_at", desc=True).execute()
    return [ApiKeyItem(**row) for row in (result.data or [])]


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(key_id: str, user_id: str = Depends(require_auth)):
    result = supabase.table("api_keys").update({
        "revoked_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", key_id).eq("user_id", user_id).is_("revoked_at", None).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found or already revoked")
