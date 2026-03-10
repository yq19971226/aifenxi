from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # 数据库
    database_url: str
    redis_url: str = "redis://localhost:6379"

    # 安全
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # CORS
    cors_origins: str = ",".join([
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ])

    # 应用
    app_version: str = "4.1.0"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    
    # 数据保留
    snapshot_retention_days: int = 180

    # 第三方 API
    coinmarketcal_api_key: str = ""

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
