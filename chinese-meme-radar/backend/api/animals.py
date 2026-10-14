"""
Animal Radar API routes.
Returns trending topics with token name suggestions.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from database.session import SessionLocal
from database.models import Trend
from analyzers.token_namer import suggest_token
from collectors.weibo_animals import fetch_weibo_animal_trends, ANIMAL_KEYWORDS

router = APIRouter(prefix="/api/animals", tags=["animals"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("")
async def list_animal_trends(
    db: Session = Depends(get_db),
    live: bool = Query(False, description="If true, fetch fresh from Weibo right now"),
    limit: int = Query(30, ge=1, le=100),
):
    """
    Return trending animal/mascot topics with token name suggestions.
    """
    if live:
        raw = await fetch_weibo_animal_trends()
        results = []
        for item in raw[:limit]:
            suggestion = suggest_token(item["title"])
            results.append({**item, "suggestion": suggestion})
        return {"source": "live", "items": results}

    # From DB — filter animal category
    q = (
        db.query(Trend)
        .filter(Trend.category == "animal")
        .order_by(desc(Trend.trend_score))
        .limit(limit)
        .all()
    )

    # If not enough animal data in DB, also include top trending
    if len(q) < 5:
        q2 = (
            db.query(Trend)
            .filter(Trend.source_platform == "weibo")
            .order_by(desc(Trend.trend_score))
            .limit(limit)
            .all()
        )
        # Merge, deduplicate
        seen = {t.id for t in q}
        for t in q2:
            if t.id not in seen:
                q.append(t)
                seen.add(t.id)

    items = []
    for t in q[:limit]:
        suggestion = suggest_token(t.title)
        items.append({
            "id": t.id,
            "title": t.title,
            "original_url": t.original_url,
            "source_platform": t.source_platform,
            "category": t.category,
            "trend_score": t.trend_score,
            "thumbnail_url": t.thumbnail_url,
            "likes": t.likes,
            "comments": t.comments,
            "suggestion": suggestion,
        })

    return {"source": "db", "items": items}


@router.get("/scan")
async def scan_live():
    """Force a fresh Weibo animal scan and return results with token suggestions."""
    raw = await fetch_weibo_animal_trends()
    results = []
    for item in raw:
        suggestion = suggest_token(item["title"])
        results.append({**item, "suggestion": suggestion})
    return {
        "count": len(results),
        "items": results,
    }


@router.post("/suggest")
async def suggest_from_title(body: dict):
    """
    Given any Chinese text title, return a token name suggestion.
    Body: {"title": "..."}
    """
    title = body.get("title", "")
    if not title:
        return {"error": "title required"}
    return suggest_token(title)
