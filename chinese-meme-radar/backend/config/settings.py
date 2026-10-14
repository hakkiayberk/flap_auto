from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./meme_radar.db"

    # Scraping interval (seconds)
    scrape_interval_seconds: int = 300  # 5 minutes

    # Optional OpenAI key (if empty, analysis is skipped)
    openai_api_key: Optional[str] = None

    # Playwright headless mode
    headless: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
