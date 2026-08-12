from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    cors_origins: list[str] = ["http://localhost:5173"]
    # Local dev is plain HTTP, so the refresh cookie must not be Secure-only or
    # browsers silently drop it. Flip to true (with samesite="none") once the
    # frontend and backend are deployed on real HTTPS domains.
    cookie_secure: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
