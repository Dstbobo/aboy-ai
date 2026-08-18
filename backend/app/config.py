from functools import lru_cache
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Environment
    environment: str = "development"
    log_level: str = "info"

    # Supabase
    supabase_url: str
    supabase_service_key: str
    supabase_anon_key: str
    supabase_jwt_secret: str = ""  # Used to verify Supabase JWTs
    supabase_db_password: str = ""  # Migration tooling only; never used by clients
    migration_secret: str = ""  # Protects the disabled-by-default migration route

    # AI providers
    anthropic_api_key: str
    voyage_api_key: str
    tavily_api_key: str
    openai_api_key: str = ""  # fallback only
    gemini_api_key: str = ""  # voice transcription + vision + (currently) answers
    gemini_model: str = "gemini-2.5-flash"            # strong  (maps to Sonnet tier)
    gemini_fast_model: str = "gemini-2.5-flash"       # fast    (flash-lite is 404 for this key)

    # LLM config — model tiering
    anthropic_model: str = "claude-sonnet-4-6"          # detailed / complex
    anthropic_haiku_model: str = "claude-haiku-4-5-20251001"  # fast / simple
    max_tokens: int = 2048

    # Answer-LLM provider: "openrouter" (many models, free + cheap paid — current),
    # "gemini", "anthropic" (Claude), or "groq". Switch anytime via LLM_PROVIDER env.
    llm_provider: str = "openrouter"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"     # strong  (maps to Sonnet tier)
    groq_fast_model: str = "llama-3.1-8b-instant"   # fast    (maps to Haiku tier)

    # OpenRouter (openrouter.ai) — one API for many models. Free models now
    # (":free" suffix), swap to cheap paid ones (e.g. deepseek/deepseek-chat)
    # after topping up — just change OPENROUTER_MODEL, no code change.
    openrouter_api_key: str = ""
    # Free models are too rate-limited for production; DeepSeek v4 Flash is the
    # cheapest reliable model (~$0.08/$0.18 per 1M tokens). Works once the
    # OpenRouter account has credit. Override anytime via OPENROUTER_MODEL.
    openrouter_model: str = "deepseek/deepseek-v4-flash-0731"

    # Redis (cache + rate limiting)
    redis_url: str = ""

    # Optional Discord webhook for actionable dislike-with-comment alerts.
    discord_feedback_webhook: str = ""
    discord_feedback_enabled: bool = False

    # RAG config
    # Voyage query/document cosine scores for relevant chunks land ~0.5-0.65,
    # noise ~0.25-0.35. 0.65 filtered out even exact-topic matches (giving empty
    # citations); 0.40 keeps relevant chunks while still excluding noise.
    similarity_threshold: float = 0.40
    retrieval_top_k: int = 10
    rerank_top_k: int = 5
    voyage_model: str = "voyage-3"
    embedding_dimensions: int = 1024
    chunk_size_tokens: int = 512
    chunk_overlap_pct: float = 0.10

    # CORS
    allowed_origins: str = "http://localhost:3000,http://localhost:8081"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    # One flat daily query limit for every user — role never restricts usage.
    # (Abuse protection only; the daily token budget is the real cost control.)
    daily_query_limit: int = 300

    # Provider-abuse controls. These are server-side and intentionally bounded.
    provider_user_requests_per_minute: int = 20
    provider_global_requests_per_minute: int = 200
    provider_max_text_chars: int = 40_000
    provider_max_upload_bytes: int = 20 * 1024 * 1024
    provider_timeout_seconds: int = 75

    # Gemini Live controls. Authentication must complete before an upstream
    # provider socket is created.
    live_auth_timeout_seconds: int = 8
    live_idle_timeout_seconds: int = 45
    live_max_session_seconds: int = 900
    live_sessions_per_user_per_day: int = 20
    live_global_sessions_per_minute: int = 60
    live_max_connections_per_user: int = 1
    live_max_global_connections: int = 20
    live_max_message_bytes: int = 1_048_576

    # Tavily allowed domains
    tavily_include_domains: list[str] = [
        "pubmed.ncbi.nlm.nih.gov",
        "who.int",
        "cdc.gov",
        "nice.org.uk",
        "cochrane.org",
        "nejm.org",
        "bmj.com",
        "thelancet.com",
        "jamanetwork.com",
        "mayoclinic.org",
        "medscape.com",
        "ahajournals.org",
    ]

    @property
    def supabase_project_ref(self) -> str:
        host = urlparse(self.supabase_url).hostname or ""
        return host.split(".", 1)[0]

    def validate_runtime(self) -> None:
        """Fail closed when a required server-side dependency is not configured."""
        if not self.supabase_url.startswith("https://"):
            raise RuntimeError("SUPABASE_URL must use HTTPS")
        if not self.supabase_project_ref:
            raise RuntimeError("SUPABASE_URL is invalid")
        if not self.supabase_service_key or not self.supabase_anon_key:
            raise RuntimeError("Supabase server configuration is incomplete")

        provider_keys = {
            "anthropic": self.anthropic_api_key,
            "gemini": self.gemini_api_key,
            "groq": self.groq_api_key,
            "openrouter": self.openrouter_api_key,
        }
        selected = self.llm_provider.strip().lower()
        if selected not in provider_keys:
            raise RuntimeError("LLM_PROVIDER is not supported")
        if not provider_keys[selected]:
            raise RuntimeError(f"The configured {selected} provider is unavailable")

        bounded_controls = {
            "PROVIDER_USER_REQUESTS_PER_MINUTE": self.provider_user_requests_per_minute,
            "PROVIDER_GLOBAL_REQUESTS_PER_MINUTE": self.provider_global_requests_per_minute,
            "PROVIDER_MAX_TEXT_CHARS": self.provider_max_text_chars,
            "PROVIDER_MAX_UPLOAD_BYTES": self.provider_max_upload_bytes,
            "PROVIDER_TIMEOUT_SECONDS": self.provider_timeout_seconds,
            "LIVE_AUTH_TIMEOUT_SECONDS": self.live_auth_timeout_seconds,
            "LIVE_IDLE_TIMEOUT_SECONDS": self.live_idle_timeout_seconds,
            "LIVE_MAX_SESSION_SECONDS": self.live_max_session_seconds,
            "LIVE_SESSIONS_PER_USER_PER_DAY": self.live_sessions_per_user_per_day,
            "LIVE_GLOBAL_SESSIONS_PER_MINUTE": self.live_global_sessions_per_minute,
            "LIVE_MAX_CONNECTIONS_PER_USER": self.live_max_connections_per_user,
            "LIVE_MAX_GLOBAL_CONNECTIONS": self.live_max_global_connections,
            "LIVE_MAX_MESSAGE_BYTES": self.live_max_message_bytes,
        }
        if any(value <= 0 for value in bounded_controls.values()):
            raise RuntimeError("Provider and Live controls must be positive")


@lru_cache
def get_settings() -> Settings:
    return Settings()
