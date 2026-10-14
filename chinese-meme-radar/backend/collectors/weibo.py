"""
Weibo trending topics collector.
Uses the public Weibo trending API (no auth required for top 50 trending).
"""
import httpx
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

WEIBO_TRENDING_URL = "https://weibo.com/ajax/side/hotSearch"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://weibo.com/",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def _score(item: dict) -> float:
    """Derive a numeric trend score from Weibo hot-search data."""
    raw = item.get("num", 0) or 0
    try:
        return float(str(raw).replace(",", "").replace("万", "0000"))
    except (ValueError, TypeError):
        return 0.0


async def fetch_weibo_trends() -> list[dict]:
    """
    Fetch top trending topics from Weibo and normalise them into the
    shared trend schema used by the collector dispatcher.
    """
    results: list[dict] = []
    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=20, follow_redirects=True) as client:
            resp = await client.get(WEIBO_TRENDING_URL)
            resp.raise_for_status()
            data = resp.json()

        items = data.get("data", {}).get("realtime", [])
        for rank, item in enumerate(items[:30], start=1):
            title: Optional[str] = item.get("note") or item.get("word")
            if not title:
                continue

            word = item.get("word", "")
            original_url = f"https://s.weibo.com/weibo?q=%23{word}%23"
            score = _score(item)

            results.append({
                "title": title,
                "original_url": original_url,
                "source_platform": "weibo",
                "published_at": datetime.now(timezone.utc),
                "category": item.get("category", "trending"),
                "likes": 0,
                "comments": 0,
                "shares": 0,
                "thumbnail_url": None,
                "trend_score": score,
                "growth_indicator": float(rank),  # lower rank = higher growth
                "is_analyzed": False,
                "turkish_translation": None,
                "meme_explanation": None,
            })

    except Exception as exc:
        logger.error("Weibo fetch error: %s", exc)

    logger.info("Weibo: collected %d trends", len(results))
    return results
