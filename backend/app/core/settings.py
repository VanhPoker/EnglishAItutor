from typing import Any

from dotenv import find_dotenv
from loguru import logger
from pydantic import SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.schema.models import (
    AllModelEnum,
    AnthropicModelName,
    GoogleModelName,
    GroqModelName,
    OpenAIModelName,
    Provider,
)

DEFAULT_JWT_SECRET = "english-tutor-secret-key-change-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=find_dotenv(),
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
        validate_default=False,
    )

    MODE: str = "dev"

    # API Server
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8080
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://4.145.98.216:5173"

    # LLM API Keys
    OPENAI_API_KEY: SecretStr | None = None
    ANTHROPIC_API_KEY: SecretStr | None = None
    GOOGLE_API_KEY: SecretStr | None = None
    GROQ_API_KEY: SecretStr | None = None

    # Default & available models
    DEFAULT_MODEL: AllModelEnum | None = None  # type: ignore[assignment]
    AVAILABLE_MODELS: set[AllModelEnum] = set()  # type: ignore[assignment]

    # LiveKit
    LIVEKIT_API_KEY: SecretStr | None = None
    LIVEKIT_API_SECRET: SecretStr | None = None
    LIVEKIT_URL: str = "ws://localhost:7880"

    # PostgreSQL (main DB)
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: str = "5432"
    POSTGRES_DB: str = "english_agent"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: SecretStr = SecretStr("postgres")

    # PostgreSQL (mem0 vector store)
    POSTGRES_MEM0_USER: str = "postgres"
    POSTGRES_MEM0_PASSWORD: SecretStr = SecretStr("postgres")
    POSTGRES_MEM0_PORT: str = "5432"
    POSTGRES_MEM0_DB: str = "localhost"

    # Auth
    JWT_SECRET_KEY: str = DEFAULT_JWT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REFRESH_COOKIE_NAME: str = "english_refresh_token"
    REFRESH_COOKIE_SECURE: bool = False
    REFRESH_COOKIE_SAMESITE: str = "lax"

    # Email for password reset codes. Gmail SMTP works with an app password.
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: SecretStr | None = None
    SMTP_FROM_EMAIL: str | None = None
    PASSWORD_RESET_CODE_MINUTES: int = 10

    # LangGraph checkpoint
    CHECKPOINT_TABLES: list[str] = ["checkpoint_blobs", "checkpoint_writes", "checkpoints"]

    # LangChain tracing (optional)
    LANGCHAIN_TRACING_V2: bool = False
    LANGCHAIN_PROJECT: str = "english-agent"
    LANGCHAIN_API_KEY: SecretStr | None = None

    @property
    def POSTGRES_URL(self) -> str:
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD.get_secret_value()}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def ASYNC_POSTGRES_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD.get_secret_value()}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    def model_post_init(self, __context: Any) -> None:
        if self.JWT_SECRET_KEY == DEFAULT_JWT_SECRET:
            if not self.is_dev():
                raise ValueError("JWT_SECRET_KEY must be set outside development mode.")
            logger.warning("Using development JWT_SECRET_KEY. Set a strong value before production.")

        if not self.REFRESH_COOKIE_SECURE and not self.is_dev():
            logger.warning("REFRESH_COOKIE_SECURE is disabled outside development.")

        api_keys = {
            Provider.OPENAI: self.OPENAI_API_KEY,
            Provider.ANTHROPIC: self.ANTHROPIC_API_KEY,
            Provider.GOOGLE: self.GOOGLE_API_KEY,
            Provider.GROQ: self.GROQ_API_KEY,
        }
        active_keys = [k for k, v in api_keys.items() if v]
        if not active_keys:
            raise ValueError("At least one LLM API key must be provided.")

        for provider in active_keys:
            match provider:
                case Provider.GOOGLE:
                    if self.DEFAULT_MODEL is None:
                        self.DEFAULT_MODEL = GoogleModelName.GEMINI_25_FLASH
                    self.AVAILABLE_MODELS.update(set(GoogleModelName))
                case Provider.GROQ:
                    if self.DEFAULT_MODEL is None:
                        self.DEFAULT_MODEL = GroqModelName.LLAMA_33_70B
                    self.AVAILABLE_MODELS.update(set(GroqModelName))
                case Provider.OPENAI:
                    if self.DEFAULT_MODEL is None:
                        self.DEFAULT_MODEL = OpenAIModelName.GPT_4O_MINI
                    self.AVAILABLE_MODELS.update(set(OpenAIModelName))
                case Provider.ANTHROPIC:
                    if self.DEFAULT_MODEL is None:
                        self.DEFAULT_MODEL = AnthropicModelName.HAIKU_35
                    self.AVAILABLE_MODELS.update(set(AnthropicModelName))

        logger.info(f"Default model: {self.DEFAULT_MODEL}")
        logger.info(f"Available models: {self.AVAILABLE_MODELS}")

    @computed_field
    @property
    def BASE_URL(self) -> str:
        return f"http://{self.API_HOST}:{self.API_PORT}"

    def is_dev(self) -> bool:
        return self.MODE == "dev"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
