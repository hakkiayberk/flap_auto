"""
Bilibili trending / popular videos collector.
Uses Bilibili's public ranking API — no login required.
"""
import httpx
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Bilibili popular videos (top 100, public, no auth)
BILIBILI_POPULAR_URL = "https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1"

# Bilibili hot search (trending keywords)
BILIBILI_HOT_SEARCH_URL = (
    "https://s.search.bilibili.com/main/hotword"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.bilibili.com/",
}


async def fetch_bilibili_trends() -> list[dict]:
    """Return normalised trend dicts from Bilibili popular videos."""
    results: list[dict] = []

    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=20, follow_redirects=True) as client:
            resp = await client.get(BILIBILI_POPULAR_URL)
            resp.raise_for_status()
            data = resp.json()

        videos = data.get("data", {}).get("list", [])
        for item in videos[:20]:
            stat = item.get("stat", {})
            bvid = item.get("bvid", "")
            title = item.get("title", "")
            if not title or not bvid:
                continue

            original_url = f"https://www.bilibili.com/video/{bvid}"
            thumbnail = item.get("pic", None)
            view_count = int(stat.get("view", 0) or 0)
            danmaku = int(stat.get("danmaku", 0) or 0)
            like_count = int(stat.get("like", 0) or 0)
            share_count = int(stat.get("share", 0) or 0)
            comment_count = int(stat.get("reply", 0) or 0)

            # Trend score: weighted engagement
            score = view_count * 0.001 + like_count * 0.5 + danmaku * 0.1

            pubdate = item.get("pubdate")
            published_at = (
                datetime.fromtimestamp(pubdate, tz=timezone.utc)
                if pubdate
                else datetime.now(timezone.utc)
            )

            results.append({
                "title": title,
                "original_url": original_url,
                "source_platform": "bilibili",
                "published_at": published_at,
                "category": item.get("tname", "video"),
                "likes": like_count,
                "comments": comment_count,
                "shares": share_count,
                "thumbnail_url": thumbnail,
                "trend_score": round(score, 2),
                "growth_indicator": 0.0,
                "is_analyzed": False,
                "turkish_translation": None,
                "meme_explanation": None,
            })

    except Exception as exc:
        logger.error("Bilibili fetch error: %s", exc)

    logger.info("Bilibili: collected %d trends", len(results))
    return results
