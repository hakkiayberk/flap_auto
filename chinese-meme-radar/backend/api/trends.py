"""
REST API routes for trends.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from database.session import SessionLocal
from database.models import Trend
from analyzers.token_namer import suggest_token

router = APIRouter(prefix="/api/trends", tags=["trends"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("")
def list_trends(
    db: Session = Depends(get_db),
    platform: Optional[str] = Query(None, description="Filter by platform: weibo | bilibili | x"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    q = db.query(Trend).order_by(desc(Trend.trend_score))
    if platform:
        q = q.filter(Trend.source_platform == platform)
    total = q.count()
    items = q.offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [_trend_to_dict(t) for t in items],
    }


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    total = db.query(func.count(Trend.id)).scalar() or 0
    today_count = (
        db.query(func.count(Trend.id))
        .filter(func.date(Trend.first_detected_at) == func.date("now"))
        .scalar()
        or 0
    )
    avg_score = db.query(func.avg(Trend.trend_score)).scalar() or 0.0
    return {
        "total_trends": total,
        "added_today": today_count,
        "average_score": round(float(avg_score), 2),
        "token_collisions": 0,  # placeholder for future token-name matching
    }


@router.post("/refresh")
async def manual_refresh(db: Session = Depends(get_db)):
    """Manually trigger an ingest cycle."""
    from services.ingest import ingest_all
    count = await ingest_all(db)
    from collectors.x import discovery_status
    return {"inserted": count, "x_discovery": discovery_status()}


def _trend_to_dict(t: Trend) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "suggestion": suggest_token(t.title),
        "original_url": t.original_url,
        "source_platform": t.source_platform,
        "source_account": t.category if t.source_platform == "x" else None,
        "published_at": t.published_at.isoformat() if t.published_at else None,
        "first_detected_at": t.first_detected_at.isoformat() if t.first_detected_at else None,
        "category": t.category,
        "likes": t.likes,
        "comments": t.comments,
        "shares": t.shares,
        "thumbnail_url": t.thumbnail_url,
        "trend_score": t.trend_score,
        "growth_indicator": t.growth_indicator,
        "is_analyzed": t.is_analyzed,
        "context": {
            "summary": "Collected from the platform trend feed. Meme relevance has not been verified.",
            "analysis_status": "pending",
            "score_note": "Platform-specific popularity score; scores across platforms are not directly comparable.",
        },
    }
