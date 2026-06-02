"""
LeafScan AI Chat — Method Comparison Evaluation
================================================
Runs 5 plant-disease questions through 5 chat methods and produces a
structured report comparing latency, citation count, citation validity,
shopping link quality, estimated cost, and auto-scored quality.

Usage
-----
  cd backend
  pip install openai tavily-python httpx rich   # eval-only deps
  python -m eval.chat_eval

Required env vars (set in .env or shell):
  OPENAI_API_KEY        — needed for Methods 1, 2, 3, and 5
  TAVILY_API_KEY        — needed for Methods 1 and 5 (free tier at tavily.com)
  YOU_API_KEY           — needed for Method 4 ($100 free credits at you.com/platform)
  SERPER_API_KEY        — needed for Method 5 (serper.dev)

Methods
-------
  1  Tavily search  → GPT-4o-mini (search results injected into context)
  2  OpenAI Responses API with web_search_preview (gpt-4o-mini-search-preview)
  3  GPT-4o-mini only — no web search
  4  You.com Research API Lite — agentic multi-step search + synthesis + citations
  5  Tavily + GPT-4o-mini + Serper shopping — production pipeline with purchase links
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
YOU_API_KEY    = os.getenv("YOU_API_KEY", "")
SERPER_API_KEY = os.getenv("SERPER_API_KEY", "")

# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

PLANT_CONTEXT = (
    "Plant: Tomato (nickname: Garden Patch #1)\n"
    "Recent scans:\n"
    "  2026-05-28: Early Blight (87% confidence, severity: moderate)\n"
    "  2026-05-14: Early Blight (72% confidence, severity: low)\n"
    "  2026-04-30: Healthy (95% confidence)"
)

TEST_CASES = [
    {
        "id": "TC1",
        "question": "My tomato has early blight again. What's the most cost-effective fungicide I can buy right now, and how do I apply it?",
        "expects_product": True,
        "expects_citation": True,
    },
    {
        "id": "TC2",
        "question": "Are there organic alternatives to chemical fungicides for early blight that actually work at field scale?",
        "expects_product": True,
        "expects_citation": True,
    },
    {
        "id": "TC3",
        "question": "The blight keeps coming back every few weeks. What's the root cause and how do I break the cycle?",
        "expects_product": False,
        "expects_citation": False,
    },
    {
        "id": "TC4",
        "question": "What's the difference between early blight and late blight? How do I tell which one I actually have?",
        "expects_product": False,
        "expects_citation": True,
    },
    {
        "id": "TC5",
        "question": "If I do nothing, how bad can this get and what's the worst case yield loss I should expect?",
        "expects_product": False,
        "expects_citation": True,
    },
]

SYSTEM_PROMPT = (
    "You are LeafScan AI, an expert agricultural assistant specializing in plant disease "
    "diagnosis, treatment, and management.\n\n"
    "When discussing products:\n"
    "- Bold ONLY retail brand names (e.g., **Daconil**, **Serenade**, **Bonide Copper Fungicide**). "
    "Do NOT bold generic chemical names like chlorothalonil, mancozeb, or azoxystrobin.\n"
    "- Include approximate application rates and safety notes.\n"
    "- Cite your sources with real URLs.\n\n"
    "Be concise, practical, and farmer-friendly."
)

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Citation:
    url: str
    title: str = ""
    reachable: bool | None = None


@dataclass
class ShoppingItem:
    title: str
    url: str
    price: str = ""
    store: str = ""
    reachable: bool | None = None


@dataclass
class MethodResult:
    method_id: int
    method_name: str
    test_case_id: str
    question: str
    reply: str = ""
    citations: list[Citation] = field(default_factory=list)
    shopping: list[ShoppingItem] = field(default_factory=list)
    latency_s: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    estimated_cost_usd: float = 0.0
    quality_score: float | None = None
    quality_breakdown: dict = field(default_factory=dict)
    error: str | None = None
    skipped: bool = False


# ---------------------------------------------------------------------------
# Cost tables (per million tokens, USD)
# ---------------------------------------------------------------------------

GPT4O_MINI_IN  = 0.15 / 1_000_000
GPT4O_MINI_OUT = 0.60 / 1_000_000
TAVILY_PER_SEARCH  = 0.001         # free tier; paid ~$0.001/search
OPENAI_SEARCH_TOOL = 0.030         # $30/1000 per OpenAI docs
YOU_LITE_PER_QUERY = 0.012         # $12/1000 queries (Lite tier)
SERPER_PER_SEARCH  = 0.001         # $50/50k queries

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

async def check_url(url: str, client: httpx.AsyncClient) -> bool:
    try:
        r = await client.head(url, timeout=5.0, follow_redirects=True)
        return r.status_code < 400
    except Exception:
        return False


async def validate_citations(citations: list[Citation]) -> list[Citation]:
    if not citations:
        return citations
    async with httpx.AsyncClient() as client:
        tasks = [check_url(c.url, client) for c in citations]
        results = await asyncio.gather(*tasks)
    for c, ok in zip(citations, results):
        c.reachable = ok
    return citations


def extract_urls_from_text(text: str) -> list[str]:
    return re.findall(r'https?://[^\s\)\]>\"\']+', text)


def _openai_headers() -> dict:
    return {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

# ---------------------------------------------------------------------------
# Method 1 — Tavily + GPT-4o-mini
# ---------------------------------------------------------------------------

async def run_method_1(tc: dict, plant_context: str) -> MethodResult:
    result = MethodResult(
        method_id=1,
        method_name="Tavily + GPT-4o-mini",
        test_case_id=tc["id"],
        question=tc["question"],
    )

    if not TAVILY_API_KEY or not OPENAI_API_KEY:
        result.skipped = True
        result.error = "TAVILY_API_KEY or OPENAI_API_KEY not set"
        return result

    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            tavily_resp = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": f"plant disease {tc['question']}",
                    "search_depth": "basic",
                    "max_results": 5,
                    "include_answer": False,
                },
            )
        tavily_resp.raise_for_status()
        tavily_data = tavily_resp.json()
        search_results = tavily_data.get("results", [])

        sources_block = "\n".join(
            f"[{i+1}] {r.get('title', '')} — {r.get('url', '')}\n{r.get('content', '')[:300]}"
            for i, r in enumerate(search_results)
        )

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT + f"\n\n{plant_context}"},
            {
                "role": "user",
                "content": (
                    f"Web search results for context:\n{sources_block}\n\n"
                    f"Question: {tc['question']}"
                ),
            },
        ]

        async with httpx.AsyncClient(timeout=60.0) as client:
            chat_resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=_openai_headers(),
                json={
                    "model": "gpt-4o-mini",
                    "messages": messages,
                    "max_tokens": 800,
                    "temperature": 0.2,
                },
            )
        chat_resp.raise_for_status()
        chat_data = chat_resp.json()

        result.reply = chat_data["choices"][0]["message"]["content"]
        usage = chat_data.get("usage", {})
        result.prompt_tokens = usage.get("prompt_tokens", 0)
        result.completion_tokens = usage.get("completion_tokens", 0)
        result.estimated_cost_usd = (
            result.prompt_tokens * GPT4O_MINI_IN
            + result.completion_tokens * GPT4O_MINI_OUT
            + TAVILY_PER_SEARCH
        )

        citations = [
            Citation(url=r.get("url", ""), title=r.get("title", ""))
            for r in search_results if r.get("url")
        ]
        result.citations = await validate_citations(citations)

    except Exception as e:
        result.error = str(e)

    result.latency_s = time.perf_counter() - t0
    return result


# ---------------------------------------------------------------------------
# Method 2 — OpenAI Responses API (gpt-4o-mini-search-preview)
# ---------------------------------------------------------------------------

async def run_method_2(tc: dict, plant_context: str) -> MethodResult:
    result = MethodResult(
        method_id=2,
        method_name="OpenAI Responses API (search-preview)",
        test_case_id=tc["id"],
        question=tc["question"],
    )

    if not OPENAI_API_KEY:
        result.skipped = True
        result.error = "OPENAI_API_KEY not set"
        return result

    t0 = time.perf_counter()
    try:
        import openai as _openai
        client = _openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

        input_messages = [
            {"role": "system", "content": SYSTEM_PROMPT + f"\n\n{plant_context}"},
            {"role": "user", "content": tc["question"]},
        ]

        resp = await client.responses.create(
            model="gpt-4o-mini-search-preview",
            tools=[{"type": "web_search_preview"}],
            input=input_messages,
        )

        output_text = ""
        raw_citations: list[Citation] = []

        for item in resp.output:
            if item.type == "message":
                for content in item.content:
                    if content.type == "output_text":
                        output_text += content.text
                        for ann in content.annotations:
                            if ann.type == "url_citation":
                                raw_citations.append(Citation(
                                    url=ann.url,
                                    title=getattr(ann, "title", ""),
                                ))

        result.reply = output_text
        usage = resp.usage
        result.prompt_tokens = getattr(usage, "input_tokens", 0)
        result.completion_tokens = getattr(usage, "output_tokens", 0)
        result.estimated_cost_usd = (
            result.prompt_tokens * GPT4O_MINI_IN
            + result.completion_tokens * GPT4O_MINI_OUT
            + OPENAI_SEARCH_TOOL
        )
        result.citations = await validate_citations(raw_citations)

    except Exception as e:
        err = str(e)
        if "not found" in err.lower() or "404" in err:
            result.skipped = True
            result.error = "gpt-4o-mini-search-preview not available on this account (limited rollout)"
        else:
            result.error = err

    result.latency_s = time.perf_counter() - t0
    return result


# ---------------------------------------------------------------------------
# Method 3 — GPT-4o-mini only (no web search)
# ---------------------------------------------------------------------------

async def run_method_3(tc: dict, plant_context: str) -> MethodResult:
    result = MethodResult(
        method_id=3,
        method_name="GPT-4o-mini (no search)",
        test_case_id=tc["id"],
        question=tc["question"],
    )

    if not OPENAI_API_KEY:
        result.skipped = True
        result.error = "OPENAI_API_KEY not set"
        return result

    t0 = time.perf_counter()
    try:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT + f"\n\n{plant_context}"},
            {"role": "user", "content": tc["question"]},
        ]

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=_openai_headers(),
                json={
                    "model": "gpt-4o-mini",
                    "messages": messages,
                    "max_tokens": 800,
                    "temperature": 0.2,
                },
            )
        resp.raise_for_status()
        data = resp.json()

        result.reply = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        result.prompt_tokens = usage.get("prompt_tokens", 0)
        result.completion_tokens = usage.get("completion_tokens", 0)
        result.estimated_cost_usd = (
            result.prompt_tokens * GPT4O_MINI_IN
            + result.completion_tokens * GPT4O_MINI_OUT
        )

        inline_urls = extract_urls_from_text(result.reply)
        if inline_urls:
            raw = [Citation(url=u) for u in inline_urls]
            result.citations = await validate_citations(raw)

    except Exception as e:
        result.error = str(e)

    result.latency_s = time.perf_counter() - t0
    return result


# ---------------------------------------------------------------------------
# Method 4 — You.com Research API (Lite)
# ---------------------------------------------------------------------------

async def run_method_4(tc: dict, plant_context: str) -> MethodResult:
    result = MethodResult(
        method_id=4,
        method_name="You.com Research API (Lite)",
        test_case_id=tc["id"],
        question=tc["question"],
    )

    if not YOU_API_KEY:
        result.skipped = True
        result.error = "YOU_API_KEY not set — get $100 free credits at you.com/platform"
        return result

    t0 = time.perf_counter()
    try:
        input_text = (
            f"{plant_context}\n\n"
            "You are an expert agricultural assistant. Focus on plant disease treatment and "
            "management. Include specific product names, application rates, and safety "
            f"information where relevant.\n\nQuestion: {tc['question']}"
        )

        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                "https://api.you.com/v1/research",
                headers={
                    "Authorization": f"Bearer {YOU_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"input": input_text},
            )
        resp.raise_for_status()
        data = resp.json()

        output = data.get("output", data)
        result.reply = output.get("content", "")
        sources = output.get("sources", [])

        raw_citations = [
            Citation(url=s.get("url", ""), title=s.get("title", ""))
            for s in sources if s.get("url")
        ]
        result.citations = await validate_citations(raw_citations)
        result.estimated_cost_usd = YOU_LITE_PER_QUERY

    except Exception as e:
        result.error = str(e)

    result.latency_s = time.perf_counter() - t0
    return result


# ---------------------------------------------------------------------------
# Method 5 — Tavily + GPT-4o-mini + Serper shopping (production pipeline)
# ---------------------------------------------------------------------------

GENERIC_TERMS = {
    'application', 'safety', 'rate', 'notes', 'instructions', 'note', 'warning',
    'method', 'frequency', 'coverage', 'conditions', 'symptoms', 'causes', 'cause',
    'location', 'halo', 'progression', 'pathogen', 'management', 'diagnosis',
    'prevention', 'treatment', 'timing', 'mixing', 'dilution', 'dosage',
    'overview', 'summary', 'key takeaway', 'bottom line', 'recommendation',
    'early blight', 'late blight', 'powdery mildew', 'root cause', 'alternaria',
    'phytophthora',
    'organic', 'conventional', 'worst case', 'worst-case', 'example', 'tip', 'important',
}


def _extract_product_names(reply: str) -> list[str]:
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


async def _serper_shopping(product_names: list[str]) -> list[ShoppingItem]:
    if not product_names or not SERPER_API_KEY:
        return []

    async def _one(name: str) -> list[ShoppingItem]:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(
                    "https://google.serper.dev/shopping",
                    headers={"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"},
                    json={"q": f"{name} fungicide buy", "num": 3, "gl": "us"},
                )
            resp.raise_for_status()
            items = resp.json().get("shopping", [])
            return [
                ShoppingItem(
                    title=i.get("title", ""),
                    url=i.get("link", ""),
                    price=i.get("price", ""),
                    store=i.get("source", ""),
                )
                for i in items[:2] if i.get("link")
            ]
        except Exception:
            return []

    batches = await asyncio.gather(*[_one(n) for n in product_names[:2]])
    seen_urls: set[str] = set()
    flat: list[ShoppingItem] = []
    for batch in batches:
        for item in batch:
            if item.url not in seen_urls:
                seen_urls.add(item.url)
                flat.append(item)
    return flat[:6]


async def validate_shopping(items: list[ShoppingItem]) -> list[ShoppingItem]:
    if not items:
        return items
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*[check_url(i.url, client) for i in items])
    for item, ok in zip(items, results):
        item.reachable = ok
    return items


async def run_method_5(tc: dict, plant_context: str) -> MethodResult:
    result = MethodResult(
        method_id=5,
        method_name="Tavily + GPT + Serper (production)",
        test_case_id=tc["id"],
        question=tc["question"],
    )

    if not TAVILY_API_KEY or not OPENAI_API_KEY:
        result.skipped = True
        result.error = "TAVILY_API_KEY or OPENAI_API_KEY not set"
        return result

    if not SERPER_API_KEY:
        result.skipped = True
        result.error = "SERPER_API_KEY not set — sign up at serper.dev"
        return result

    t0 = time.perf_counter()
    try:
        # Step 1: Tavily search
        async with httpx.AsyncClient(timeout=15.0) as client:
            tavily_resp = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": f"plant disease {tc['question']}",
                    "search_depth": "basic",
                    "max_results": 5,
                    "include_answer": False,
                },
            )
        tavily_resp.raise_for_status()
        search_results = tavily_resp.json().get("results", [])

        sources_block = "\n".join(
            f"[{i+1}] {r.get('title', '')} — {r.get('url', '')}\n{r.get('content', '')[:300]}"
            for i, r in enumerate(search_results)
        )

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT + f"\n\n{plant_context}"},
            {
                "role": "user",
                "content": (
                    f"Web search results for context:\n{sources_block}\n\n"
                    f"Question: {tc['question']}"
                ),
            },
        ]

        # Step 2: GPT-4o-mini
        async with httpx.AsyncClient(timeout=60.0) as client:
            chat_resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=_openai_headers(),
                json={
                    "model": "gpt-4o-mini",
                    "messages": messages,
                    "max_tokens": 800,
                    "temperature": 0.2,
                },
            )
        chat_resp.raise_for_status()
        chat_data = chat_resp.json()

        result.reply = chat_data["choices"][0]["message"]["content"]
        usage = chat_data.get("usage", {})
        result.prompt_tokens = usage.get("prompt_tokens", 0)
        result.completion_tokens = usage.get("completion_tokens", 0)

        # Step 3: Serper shopping (parallel with citation validation)
        product_names = _extract_product_names(result.reply)
        research_citations = [
            Citation(url=r.get("url", ""), title=r.get("title", ""))
            for r in search_results if r.get("url")
        ]

        validated_citations, shopping = await asyncio.gather(
            validate_citations(research_citations),
            _serper_shopping(product_names),
        )
        result.citations = validated_citations
        result.shopping = await validate_shopping(shopping)

        result.estimated_cost_usd = (
            result.prompt_tokens * GPT4O_MINI_IN
            + result.completion_tokens * GPT4O_MINI_OUT
            + TAVILY_PER_SEARCH
            + SERPER_PER_SEARCH * len(product_names[:2])
        )

    except Exception as e:
        result.error = str(e)

    result.latency_s = time.perf_counter() - t0
    return result


# ---------------------------------------------------------------------------
# Quality scoring (LLM-as-judge via GPT-4o-mini)
# ---------------------------------------------------------------------------

async def score_result(r: MethodResult) -> MethodResult:
    if r.error or r.skipped or not r.reply or not OPENAI_API_KEY:
        return r

    prompt = f"""Score this plant disease assistant response on three criteria.
Return ONLY valid JSON: {{"accuracy": N, "specificity": N, "actionability": N, "rationale": "..."}}
where N is 1 (poor) to 5 (excellent).

Question: {r.question}
Response: {r.reply[:1200]}

Criteria:
- accuracy: Are the disease/treatment facts scientifically correct?
- specificity: Does it give concrete product names, rates, or steps (not vague)?
- actionability: Can a farmer immediately act on this advice?"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=_openai_headers(),
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                    "temperature": 0.0,
                },
            )
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        start = text.find("{")
        end = text.rfind("}") + 1
        parsed = json.loads(text[start:end])
        scores = [parsed.get("accuracy", 0), parsed.get("specificity", 0), parsed.get("actionability", 0)]
        r.quality_score = round(sum(scores) / len(scores), 2)
        r.quality_breakdown = {k: parsed.get(k) for k in ("accuracy", "specificity", "actionability", "rationale")}
    except Exception:
        pass

    return r


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------

def _bar(val: float, max_val: float = 5.0, width: int = 12) -> str:
    filled = round((val / max_val) * width)
    return "█" * filled + "░" * (width - filled)


def print_report(all_results: list[MethodResult]) -> None:
    method_names = {1: "Tavily+GPT", 2: "OAI Search", 3: "GPT only", 4: "You.com", 5: "Tavily+Serper"}

    print("\n" + "═" * 72)
    print("  LEAFSCAN CHAT — METHOD EVALUATION REPORT")
    print("═" * 72)

    for tc in TEST_CASES:
        tc_results = [r for r in all_results if r.test_case_id == tc["id"]]
        print(f"\n{'─'*72}")
        print(f"  {tc['id']}: {tc['question'][:70]}")
        print(f"{'─'*72}")

        for r in sorted(tc_results, key=lambda x: x.method_id):
            tag = method_names[r.method_id]
            if r.skipped:
                print(f"  [{tag}] SKIPPED — {r.error}")
                continue
            if r.error:
                print(f"  [{tag}] ERROR — {r.error[:80]}")
                continue

            valid_cit = sum(1 for c in r.citations if c.reachable)
            total_cit = len(r.citations)
            valid_shop = sum(1 for s in r.shopping if s.reachable)
            total_shop = len(r.shopping)
            quality = f"{r.quality_score:.1f}/5  {_bar(r.quality_score or 0)}" if r.quality_score else "—"

            print(f"\n  ┌─ Method {r.method_id}: {r.method_name}")
            print(f"  │  Latency:   {r.latency_s:.1f}s")
            print(f"  │  Citations: {valid_cit}/{total_cit} reachable")
            if total_shop > 0:
                print(f"  │  Shopping:  {valid_shop}/{total_shop} reachable")
                for s in r.shopping[:3]:
                    reach = "✓" if s.reachable else "✗"
                    print(f"  │    [{reach}] {s.store:15} {s.price:8}  {s.title[:45]}")
            print(f"  │  Tokens:    {r.prompt_tokens}in / {r.completion_tokens}out")
            print(f"  │  Cost est:  ${r.estimated_cost_usd:.5f}")
            print(f"  │  Quality:   {quality}")
            if r.quality_breakdown.get("rationale"):
                print(f"  │  Judge:     {r.quality_breakdown['rationale'][:100]}")
            print("  │  Reply↓")
            for line in r.reply[:600].split("\n"):
                print(f"  │    {line}")
            if len(r.reply) > 600:
                print(f"  │    … ({len(r.reply)} chars total)")
            print(f"  └{'─'*65}")

    print("\n" + "═" * 72)
    print("  AGGREGATE SUMMARY")
    print("═" * 72)
    print(f"  {'Method':<32}  {'Avg Latency':>12}  {'Avg Citations':>13}  {'Avg Quality':>11}  {'Total Cost':>10}")
    print(f"  {'─'*32}  {'─'*12}  {'─'*13}  {'─'*11}  {'─'*10}")

    for method_id in [1, 2, 3, 4, 5]:
        rs = [r for r in all_results if r.method_id == method_id and not r.error and not r.skipped]
        if not rs:
            continue
        avg_lat = sum(r.latency_s for r in rs) / len(rs)
        avg_cit = sum(len(r.citations) for r in rs) / len(rs)
        scored = [r for r in rs if r.quality_score is not None]
        avg_q = sum(r.quality_score for r in scored) / len(scored) if scored else None
        total_cost = sum(r.estimated_cost_usd for r in rs)
        name = rs[0].method_name
        q_str = f"{avg_q:.2f}/5" if avg_q else "—"
        print(f"  {name:<32}  {avg_lat:>10.1f}s  {avg_cit:>12.1f}  {q_str:>11}  ${total_cost:>9.5f}")

    print()


def save_json(all_results: list[MethodResult], path: Path) -> None:
    data = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "results": [asdict(r) for r in all_results],
    }
    path.write_text(json.dumps(data, indent=2))
    print(f"  Full results saved → {path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    print("LeafScan Chat Eval — starting…")
    missing = []
    if not OPENAI_API_KEY:
        missing.append("OPENAI_API_KEY")
    if not TAVILY_API_KEY:
        missing.append("TAVILY_API_KEY (Method 1 will be skipped)")
    if not YOU_API_KEY:
        missing.append("YOU_API_KEY (Method 4 will be skipped — $100 free at you.com/platform)")
    if not SERPER_API_KEY:
        missing.append("SERPER_API_KEY (Method 5 will be skipped — sign up at serper.dev)")
    if missing:
        print(f"  Warning: {', '.join(missing)} not set in environment.\n")

    all_results: list[MethodResult] = []

    for tc in TEST_CASES:
        print(f"\nRunning {tc['id']}: {tc['question'][:60]}…")
        tasks = [
            run_method_1(tc, PLANT_CONTEXT),
            run_method_2(tc, PLANT_CONTEXT),
            run_method_3(tc, PLANT_CONTEXT),
            run_method_4(tc, PLANT_CONTEXT),
            run_method_5(tc, PLANT_CONTEXT),
        ]
        results = await asyncio.gather(*tasks)

        print("  Scoring quality…")
        scored = await asyncio.gather(*[score_result(r) for r in results])
        all_results.extend(scored)

    print_report(all_results)

    out_path = Path(__file__).parent / "eval_results.json"
    save_json(all_results, out_path)


if __name__ == "__main__":
    asyncio.run(main())
