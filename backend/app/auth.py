from typing import Optional

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)


async def require_auth(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> str:
    return "placeholder_user_id"
