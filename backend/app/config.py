from functools import lru_cache
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

    # AI providers
    anthropic_api_key: str
    voyage_api_key: str
    tavily_api_key: str
    openai_api_key: str = ""  # fallback only
    gemini_api_key: str = ""  # voice transcription + vision
    gemini_model: str = "gemini-2.5-flash"

    # LLM config — model tiering
    anthropic_model: str = "claude-sonnet-4-6"          # detailed / complex
    anthropic_haiku_model: str = "claude-haiku-4-5-20251001"  # fast / simple
    max_tokens: int = 2048

    # Redis (cache + rate limiting)
    redis_url: str = ""

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

    # Rate limits per role (daily)
    rate_limits: dict[str, int | float] = {
        "admin": float("inf"),
        "educator": 500,
        "pro_senior": 200,
        "pro_junior": 150,
        "pro_nurse": 100,
        "student_med": 50,
        "student_nurse": 50,
        "student_allied": 50,
    }

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
