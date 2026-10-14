from pydantic_settings import BaseSettings
from pydantic import Field, SecretStr
from typing import Optional


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./meme_radar.db"

    # Scraping interval (seconds)
    scrape_interval_seconds: int = 300  # 5 minutes

    # Read-only X discovery is independent of the account used for publishing.
    x_read_bearer_token: Optional[SecretStr] = None
    x_watch_accounts: str = "cz_binance,heyibinance,binance,binancezh"
    x_page_size: int = Field(20, ge=5, le=100)
    x_max_pages: int = Field(2, ge=1, le=5)
    x_include_replies: bool = True

    # Optional OpenAI key (if empty, analysis is skipped)
    openai_api_key: Optional[str] = None

    # Playwright headless mode
    headless: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
