from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.sql import func
from .session import Base

class Trend(Base):
    __tablename__ = "trends"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    original_url = Column(String, unique=True, index=True)
    source_platform = Column(String, index=True)
    published_at = Column(DateTime, nullable=True)
    first_detected_at = Column(DateTime, server_default=func.now())
    category = Column(String, index=True)
    
    # Engagement metrics
    likes = Column(Integer, default=0)
    comments = Column(Integer, default=0)
    shares = Column(Integer, default=0)
    
    thumbnail_url = Column(String, nullable=True)
    trend_score = Column(Float, default=0.0)
    growth_indicator = Column(Float, default=0.0)
    
    # AI Analysis details
    is_analyzed = Column(Boolean, default=False)
    turkish_translation = Column(String, nullable=True)
    meme_explanation = Column(String, nullable=True)
