import asyncio
import json
import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_auth
from app.config import settings
from app.db import supabase

router = APIRouter()

OPENAI_API = "https://api.openai.com/v1/chat/completions"
TAVILY_API = "https://api.tavily.com/search"
SERPER_API = "https://google.serper.dev/shopping"

WINDOW_SIZE = 8
MEMORY_LIMIT = 20

SYSTEM_PROMPT = """\
You are LeafScan AI, an expert agricultural assistant specializing in plant disease diagnosis, \
treatment, and management. You have real-time web search access.

When discussing treatments or products:
- Bold ONLY retail brand names (e.g., **Daconil**, **Serenade**, **Bonide Copper Fungicide**). \
Do NOT bold generic chemical names like chlorothalonil, mancozeb, or azoxystrobin.
- Cite your sources inline. Every factual claim about products, dosages, or science should \
reference a real URL in parentheses or as a markdown link.
- Include both organic and conventional options when relevant.
- Mention application rates and safety precautions when available.
- Prefer EPA-registered products or university extension recommendations.

Be concise, practical, and farmer-friendly. Avoid hedging that makes answers useless.\
"""

SEARCH_KEYWORDS = frozenset([
    # symptoms / visual signs
    'disease', 'sick', 'dying', 'dead', 'yellow', 'yellowing', 'brown', 'browning',
    'spot', 'spots', 'lesion', 'lesions', 'wilt', 'wilting', 'droop', 'drooping',
    'stunted', 'discolored', 'discoloration', 'necrosis', 'chlorosis',
    # pest / pathogen terms
    'fungus', 'fungal', 'pest', 'bug', 'bugs', 'insect', 'insects', 'mite', 'mites',
    'rot', 'blight', 'mold', 'mould', 'rust', 'bacteria', 'bacterial', 'virus', 'viral',
    'aphid', 'aphids', 'thrip', 'thrips', 'whitefly', 'nematode',
    # treatment / action
    'treatment', 'treat', 'cure', 'fix', 'prevent', 'prevention', 'control',
    'apply', 'spray', 'spraying', 'fertilize', 'fertilizer', 'fertiliser',
    'pesticide', 'fungicide', 'insecticide', 'herbicide', 'organic', 'chemical',
    # plant anatomy / growth
    'leaves', 'leaf', 'stem', 'stems', 'root', 'roots', 'fruit', 'fruits',
    'flower', 'flowers', 'growth', 'nutrient', 'deficiency',
    # diagnosis / identification
    'symptom', 'symptoms', 'diagnosis', 'diagnose', 'identify', 'identification',
    'infection', 'infected', 'damage', 'damaged', 'issue', 'problem',
    # safety
    'safe', 'toxic', 'toxicity', 'recommend',
])

SCORE_THRESHOLD = 0.5
MAX_SOURCES = 3


def _needs_web_search(message: str) -> bool:
    words = set(message.lower().split())
    return bool(words & SEARCH_KEYWORDS)


GENERIC_TERMS = {
    # section subheadings LLM tends to bold
    'application', 'safety', 'rate', 'notes', 'instructions', 'note', 'warning',
    'method', 'frequency', 'coverage', 'conditions', 'symptoms', 'causes', 'cause',
    'location', 'halo', 'progression', 'pathogen', 'management', 'diagnosis',
    'prevention', 'treatment', 'timing', 'mixing', 'dilution', 'dosage',
    'overview', 'summary', 'key takeaway', 'bottom line', 'recommendation',
    # disease / pest names (not products)
    'early blight', 'late blight', 'powdery mildew', 'root cause', 'alternaria',
    'phytophthora',
    # generic descriptors
    'organic', 'conventional', 'worst case', 'worst-case', 'example', 'tip', 'important',
}


class ChatRequest(BaseModel):
    plant_id: str
    message: str
    image_url: str | None = None


class Source(BaseModel):
    url: str
    title: str = ""


class ShoppingLink(BaseModel):
    title: str
    url: str
    price: str = ""
    store: str = ""


class ChatResponse(BaseModel):
    reply: str
    sources: list[Source]
    shopping: list[ShoppingLink]
    credits_remaining: int


# ---------------------------------------------------------------------------
# Credit helpers
# ---------------------------------------------------------------------------

def _reset_credits_if_needed(profile: dict) -> int:
    reset_at = profile.get("credits_reset_at")
    if reset_at:
        reset_dt = datetime.fromisoformat(reset_at.replace("Z", "+00:00"))
        if (datetime.now(timezone.utc) - reset_dt).total_seconds() >= 86400:
            supabase.table("profiles").update({
                "chat_credits": settings.chat_daily_credits,
                "credits_reset_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", profile["id"]).execute()
            return settings.chat_daily_credits
    return profile.get("chat_credits", settings.chat_daily_credits)


# ---------------------------------------------------------------------------
# Tavily search
# ---------------------------------------------------------------------------

async def _search_tavily(query: str) -> list[dict]:
    if not settings.tavily_api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                TAVILY_API,
                json={
                    "api_key": settings.tavily_api_key,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": 5,
                },
            )
        resp.raise_for_status()
        return resp.json().get("results", [])
    except Exception:
        return []


# ---------------------------------------------------------------------------
# OpenAI chat completion
# ---------------------------------------------------------------------------

async def _call_openai(messages: list[dict], max_tokens: int = 1024) -> tuple[str, int, int]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            OPENAI_API,
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.2,
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"AI service error: {resp.text[:200]}")
    data = resp.json()
    usage = data.get("usage", {})
    return (
        data["choices"][0]["message"]["content"],
        usage.get("prompt_tokens", 0),
        usage.get("completion_tokens", 0),
    )


# ---------------------------------------------------------------------------
# Product name extraction (regex — no extra API call)
# ---------------------------------------------------------------------------

def _extract_product_names(reply: str) -> list[str]:
    # Exclude bold text that's a section header (immediately followed by ':')
    bold = re.findall(r'\*\*([^*]{3,60})\*\*(?!\s*:)', reply)
    seen: set[str] = set()
    products: list[str] = []
    for item in bold:
        lower = item.lower().strip()
        if lower in GENERIC_TERMS or lower in seen:
            continue
        seen.add(lower)
        products.append(item.strip())
    return products[:3]


# ---------------------------------------------------------------------------
# Serper shopping search
# ---------------------------------------------------------------------------

async def _shopping_search(product_names: list[str]) -> list[ShoppingLink]:
    if not product_names or not settings.serper_api_key:
        return []

    async def _one_search(name: str) -> list[ShoppingLink]:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(
                    SERPER_API,
                    headers={
                        "X-API-KEY": settings.serper_api_key,
                        "Content-Type": "application/json",
                    },
                    json={"q": f"{name} fungicide buy", "num": 3, "gl": "us"},
                )
            resp.raise_for_status()
            items = resp.json().get("shopping", [])
            return [
                ShoppingLink(
                    title=i.get("title", ""),
                    url=i.get("link", ""),
                    price=i.get("price", ""),
                    store=i.get("source", ""),
                )
                for i in items[:2] if i.get("link")
            ]
        except Exception:
            return []

    results = await asyncio.gather(*[_one_search(n) for n in product_names[:2]])
    seen_urls: set[str] = set()
    flat: list[ShoppingLink] = []
    for batch in results:
        for link in batch:
            if link.url not in seen_urls:
                seen_urls.add(link.url)
                flat.append(link)
    return flat[:6]


# ---------------------------------------------------------------------------
# Fact extraction for memory
# ---------------------------------------------------------------------------

async def _extract_facts(plant_label: str, user_msg: str, ai_reply: str) -> list[str]:
    prompt = (
        f"Plant: {plant_label}\n"
        f"User said: {user_msg}\n"
        f"AI replied (first 600 chars): {ai_reply[:600]}\n\n"
        "Extract 1-3 specific factual observations about THIS plant's condition or history. "
        "Exclude general disease knowledge. "
        'Return ONLY a JSON array, e.g. ["fact1", "fact2"]. Return [] if none.'
    )
    try:
        reply, _, _ = await _call_openai(
            [{"role": "user", "content": prompt}],
            max_tokens=200,
        )
        start, end = reply.find("["), reply.rfind("]") + 1
        return json.loads(reply[start:end]) if start != -1 else []
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Main chat endpoint
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, user_id: str = Depends(require_auth)):
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="Chat service not configured")

    plant_row = (
        supabase.table("plants")
        .select("id, plant_type, nickname, user_id, field_id")
        .eq("id", body.plant_id)
        .single()
        .execute()
    )
    if not plant_row.data or plant_row.data["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Plant not found")

    plant = plant_row.data
    plant_label = plant.get("nickname") or plant.get("plant_type") or "Unknown plant"

    field_name: str | None = None
    if plant.get("field_id"):
        try:
            field_row = (
                supabase.table("fields")
                .select("name")
                .eq("id", plant["field_id"])
                .single()
                .execute()
            )
            field_name = field_row.data.get("name") if field_row.data else None
        except Exception:
            pass

    profile_row = (
        supabase.table("profiles")
        .select("id, chat_credits, credits_reset_at")
        .eq("id", user_id)
        .single()
        .execute()
    )
    profile = profile_row.data or {
        "id": user_id,
        "chat_credits": settings.chat_daily_credits,
        "credits_reset_at": None,
    }
    credits = _reset_credits_if_needed(profile)

    if credits <= 0:
        raise HTTPException(status_code=429, detail="Daily chat limit reached. Resets in 24 hours.")

    scans_row = (
        supabase.table("scans")
        .select("disease_name, is_healthy, confidence, severity, created_at")
        .eq("plant_id", body.plant_id)
        .is_("deleted_at", None)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    scans = scans_row.data or []

    memories_row = (
        supabase.table("plant_memories")
        .select("fact")
        .eq("plant_id", body.plant_id)
        .order("created_at", desc=True)
        .limit(MEMORY_LIMIT)
        .execute()
    )
    memories = [m["fact"] for m in (memories_row.data or [])]

    history_row = (
        supabase.table("chat_messages")
        .select("role, content")
        .eq("plant_id", body.plant_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(WINDOW_SIZE)
        .execute()
    )
    recent = list(reversed(history_row.data or []))

    # Build plant context block
    context_parts = [f"Plant: {plant_label}" + (f" (Field: {field_name})" if field_name else "")]
    if scans:
        lines = []
        for s in scans[:5]:
            date = s["created_at"][:10]
            status = "Healthy" if s["is_healthy"] else s.get("disease_name", "Diseased")
            conf = round(s.get("confidence", 0) * 100)
            lines.append(f"  {date}: {status} ({conf}% confidence)")
        context_parts.append("Recent scans:\n" + "\n".join(lines))
    if memories:
        context_parts.append("Known facts about this plant:\n" + "\n".join(f"  - {m}" for m in memories))

    plant_context = "\n\n".join(context_parts)

    # Tavily web search — only for messages with research intent
    raw_results = []
    if _needs_web_search(body.message):
        raw_results = await _search_tavily(
            f"{plant_label} plant {body.message} disease treatment"
        )
    # Keep only high-confidence results, capped at MAX_SOURCES
    search_results = [
        r for r in raw_results if r.get("score", 0) >= SCORE_THRESHOLD
    ][:MAX_SOURCES]

    sources_block = "\n".join(
        f"[{i+1}] {r.get('title', '')} — {r.get('url', '')}\n{r.get('content', '')[:300]}"
        for i, r in enumerate(search_results)
    )

    user_content = body.message
    if sources_block:
        user_content = f"Web search results for context:\n{sources_block}\n\nQuestion: {body.message}"

    messages = [{"role": "system", "content": SYSTEM_PROMPT + "\n\n" + plant_context}]
    messages.extend({"role": m["role"], "content": m["content"]} for m in recent)

    if body.image_url:
        user_msg_content = [
            {"type": "text", "text": user_content},
            {"type": "image_url", "image_url": {"url": body.image_url}},
        ]
    else:
        user_msg_content = user_content
    messages.append({"role": "user", "content": user_msg_content})

    # LLM response + shopping search run concurrently after reply is ready
    reply, _, _ = await _call_openai(messages)

    sources = [
        Source(url=r.get("url", ""), title=r.get("title", ""))
        for r in search_results if r.get("url")
    ]

    product_names = _extract_product_names(reply)
    shopping, new_facts = await asyncio.gather(
        _shopping_search(product_names),
        _extract_facts(plant_label, body.message, reply),
    )

    # Persist
    supabase.table("chat_messages").insert([
        {
            "plant_id": body.plant_id, "user_id": user_id,
            "role": "user", "content": body.message,
            "sources": [], "shopping": [],
        },
        {
            "plant_id": body.plant_id, "user_id": user_id,
            "role": "assistant", "content": reply,
            "sources": [s.model_dump() for s in sources],
            "shopping": [s.model_dump() for s in shopping],
        },
    ]).execute()

    supabase.table("profiles").update({"chat_credits": credits - 1}).eq("id", user_id).execute()

    if new_facts:
        supabase.table("plant_memories").insert([
            {"plant_id": body.plant_id, "user_id": user_id, "fact": f}
            for f in new_facts
        ]).execute()

    return ChatResponse(
        reply=reply,
        sources=sources,
        shopping=shopping,
        credits_remaining=credits - 1,
    )


# ---------------------------------------------------------------------------
# History endpoint
# ---------------------------------------------------------------------------

@router.get("/chat/{plant_id}/history")
async def chat_history(plant_id: str, user_id: str = Depends(require_auth)):
    plant_row = (
        supabase.table("plants")
        .select("id, user_id")
        .eq("id", plant_id)
        .single()
        .execute()
    )
    if not plant_row.data or plant_row.data["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Plant not found")

    rows = (
        supabase.table("chat_messages")
        .select("id, role, content, sources, shopping, created_at")
        .eq("plant_id", plant_id)
        .eq("user_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )
    return {"messages": rows.data or []}
