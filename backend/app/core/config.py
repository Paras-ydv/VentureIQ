"""Application configuration.

Dev defaults to SQLite so the whole stack runs with zero setup. Set
VIQ_DATABASE_URL to a Postgres DSN to promote to the stack described in the
report (docs/BUILD_PLAN.md Problem 5 explains why we stage this rather than
running five storage systems from day one).
"""

from pathlib import Path

from pydantic_settings import BaseSettings

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent
DATA_RAW = REPO_ROOT / "data" / "raw"
ARTIFACTS = BACKEND_DIR / "artifacts"


class Settings(BaseSettings):
    app_name: str = "VentureIQ API"
    version: str = "0.1.0"

    database_url: str = f"sqlite:///{BACKEND_DIR / 'ventureiq.db'}"

    # Enrichment. GitHub is the one source we can legitimately call for real
    # (public API, no consent flow). The rest ship as mock adapters --- see
    # data/raw/README.md for why MCA21/GSTN/LinkedIn cannot be bulk-collected.
    github_token: str | None = None
    enrichment_cache_days: int = 30
    enrichment_max_retries: int = 5

    # Fraud detection: a startup whose form value and extracted/enriched value
    # differ by more than this fraction gets flagged (report section 8.1.2).
    deviation_threshold: float = 0.20

    # RAG benchmarking: compare against N most-similar startups, same stage and
    # sector, no older than this (report section 8.1.4).
    benchmark_neighbors: int = 10
    benchmark_max_age_months: int = 24

    # Below this cohort size the peer-relative scores are not trustworthy and
    # we mark the score low-confidence (docs/BUILD_PLAN.md Problem 4).
    min_cohort_size: int = 20

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]

    model_config = {"env_prefix": "VIQ_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
ARTIFACTS.mkdir(parents=True, exist_ok=True)
