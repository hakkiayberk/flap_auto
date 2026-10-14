"""
APScheduler periodic job: runs ingest_all every N seconds.
"""
import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from database.session import SessionLocal
from services.ingest import ingest_all
from config.settings import settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _run_ingest():
    db = SessionLocal()
    try:
        count = await ingest_all(db)
        logger.info("Scheduled ingest done, %d new rows", count)
    except Exception as exc:
        logger.error("Scheduled ingest error: %s", exc)
    finally:
        db.close()


def start_scheduler():
    scheduler.add_job(
        _run_ingest,
        trigger="interval",
        seconds=settings.scrape_interval_seconds,
        id="ingest_job",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Scheduler started — interval %ds", settings.scrape_interval_seconds
    )
    # Run immediately on startup
    asyncio.ensure_future(_run_ingest())


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
