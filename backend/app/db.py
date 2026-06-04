from __future__ import annotations

from supabase import Client, create_client

from app.config import settings


class _LazyClient:
    _client: Client | None = None

    def _get(self) -> Client:
        if self._client is None:
            self._client = create_client(settings.supabase_url, settings.supabase_service_key)
        return self._client

    def __getattr__(self, name: str):
        return getattr(self._get(), name)


supabase: Client = _LazyClient()  # type: ignore[assignment]
