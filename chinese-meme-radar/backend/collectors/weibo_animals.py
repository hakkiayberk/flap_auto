"""
Animal & mascot focused Weibo collector.
Searches trending topics filtered for animal/mascot/character keywords
that are high-potential meme coin candidates.
"""
import httpx
import logging
import re
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

WEIBO_TRENDING_URL = "https://weibo.com/ajax/side/hotSearch"
WEIBO_SEARCH_URL = "https://s.weibo.com/weibo"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://weibo.com/",
    "Accept-Language": "zh-CN,zh;q=0.9",
}

# Chinese animal & mascot keywords to match against trending titles
ANIMAL_KEYWORDS = [
    # Animals
    "熊猫", "大熊猫", "龙", "凤凰", "老虎", "狮子", "兔", "兔子",
    "猫", "狗", "狐狸", "狼", "熊", "鸭", "鸡", "鹤", "鹰", "貂",
    "麒麟", "玄武", "白虎", "朱雀", "青龙",
    "蟾蜍", "金蟾", "乌龟", "鲤鱼", "金鱼", "锦鲤",
    # City mascots / regional
    "冰墩墩", "雪容融", "吉祥物", "萌宠", "网红动物",
    # Internet viral animals
    "羊驼", "草泥马", "神兽", "瑞兽", "神龙",
    # Meme / cute characters
    "表情包", "萌", "可爱", "卡通",
]

# Crypto-specific animal meme triggers
CRYPTO_SIGNALS = [
    "涨", "暴涨", "飙升", "冲", "爆", "上天", "破圈", "出圈",
    "火了", "红了", "刷屏", "热门", "热搜", "第一", "全国",
]


def _contains_animal(text: str) -> bool:
    """Return True if title contains any animal/mascot keyword."""
    for kw in ANIMAL_KEYWORDS:
        if kw in text:
            return True
    return False


def _has_viral_signal(text: str) -> bool:
    """Return True if title contains viral/trending signal words."""
    for sig in CRYPTO_SIGNALS:
        if sig in text:
            return True
    return False


def _score(item: dict) -> float:
    raw = item.get("num", 0) or 0
    try:
        s = str(raw).replace(",", "").replace("万", "0000")
        return float(s)
    except (ValueError, TypeError):
        return 0.0


async def fetch_weibo_animal_trends() -> list[dict]:
    """Fetch Weibo trending topics and return only animal/mascot related ones."""
    results: list[dict] = []
    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=20, follow_redirects=True) as client:
            resp = await client.get(WEIBO_TRENDING_URL)
            resp.raise_for_status()
            data = resp.json()

        items = data.get("data", {}).get("realtime", [])
        for rank, item in enumerate(items[:50], start=1):
            title: Optional[str] = item.get("note") or item.get("word")
            if not title:
                continue

            is_animal = _contains_animal(title)
            has_viral = _has_viral_signal(title)

            # Include if it has animal keyword OR is top-15 viral trending
            if not is_animal and rank > 15:
                continue

            word = item.get("word", "")
            score = _score(item)
            # Boost animal topics
            if is_animal:
                score *= 1.5
            if has_viral:
                score *= 1.3

            results.append({
                "title": title,
                "original_url": f"https://s.weibo.com/weibo?q=%23{word}%23",
                "source_platform": "weibo",
                "published_at": datetime.now(timezone.utc),
                "category": "animal" if is_animal else "trending",
                "likes": 0,
                "comments": 0,
                "shares": 0,
                "thumbnail_url": None,
                "trend_score": round(score, 2),
                "growth_indicator": float(rank),
                "is_analyzed": False,
                "turkish_translation": None,
                "meme_explanation": None,
                "is_animal": is_animal,
                "has_viral_signal": has_viral,
            })

    except Exception as exc:
        logger.error("Weibo animal fetch error: %s", exc)

    logger.info("Weibo animal radar: %d candidates", len(results))
    return results
