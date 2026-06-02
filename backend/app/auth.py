import hashlib

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import supabase

bearer = HTTPBearer()


async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    try:
        response = supabase.auth.get_user(credentials.credentials)
        return response.user.id
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def require_api_key(x_api_key: str = Header(...)) -> tuple[str, str]:
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
    result = supabase.table("api_keys").select("id, user_id").eq("key_hash", key_hash).is_("revoked_at", None).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    row = result.data[0]
    return row["user_id"], row["id"]
