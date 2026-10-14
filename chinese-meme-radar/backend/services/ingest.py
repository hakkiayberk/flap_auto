"""
Ingest service: fetch trends from all collectors and upsert into the DB.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from collectors.weibo import fetch_weibo_trends
from collectors.bilibili import fetch_bilibili_trends
from collectors.weibo_animals import _contains_animal
from database.models import Trend

logger = logging.getLogger(__name__)


async def ingest_all(db: Session) -> int:
    """
    Fetch trends from every collector and persist new ones.
    Returns the number of newly inserted rows.
    """
    all_trends: list[dict] = []
    all_trends.extend(await fetch_weibo_trends())
    all_trends.extend(await fetch_bilibili_trends())

    inserted = 0
    for item in all_trends:
        if item.get("source_platform") == "weibo" and _contains_animal(item["title"]):
            item["category"] = "animal"
        url = item.get("original_url")
        if not url:
            continue

        # Skip if already exists (upsert by url)
        existing = db.query(Trend).filter(Trend.original_url == url).first()
        if existing:
            # Refresh engagement metrics
            existing.category = item.get("category", existing.category)
            existing.likes = item.get("likes", existing.likes)
            existing.comments = item.get("comments", existing.comments)
            existing.shares = item.get("shares", existing.shares)
            existing.trend_score = item.get("trend_score", existing.trend_score)
            db.commit()
            continue

        trend = Trend(
            title=item["title"],
            original_url=url,
            source_platform=item["source_platform"],
            published_at=item.get("published_at"),
            category=item.get("category", ""),
            likes=item.get("likes", 0),
            comments=item.get("comments", 0),
            shares=item.get("shares", 0),
            thumbnail_url=item.get("thumbnail_url"),
            trend_score=item.get("trend_score", 0.0),
            growth_indicator=item.get("growth_indicator", 0.0),
            is_analyzed=False,
            turkish_translation=None,
            meme_explanation=None,
        )
        db.add(trend)
        inserted += 1

    db.commit()
    logger.info("Ingest complete — %d new trends inserted", inserted)
    return inserted
