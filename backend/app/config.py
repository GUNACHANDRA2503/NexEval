"""Centralized configuration loader.

Tuneable values default from ``backend/config.json`` (copy from ``config.example.json``).
Override with environment variables for production (``DATABASE_URL``, ``NEXEVAL_ENV``,
``CORS_ORIGINS``, ``JWT_SECRET``, etc.). OpenAI keys for evaluations are per-user (BYOK).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"


def _load_json_config() -> dict[str, Any]:
    if _CONFIG_PATH.exists():
        with open(_CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {}


_CFG = _load_json_config()

_app = _CFG.get("app", {})
_db = _CFG.get("database", {})
_openai = _CFG.get("openai", {})
_deepeval = _CFG.get("deepeval", {})
_thresholds = _CFG.get("evaluation_thresholds", {})
_rc = _CFG.get("root_cause_thresholds", {})
_rephraser = _CFG.get("rephraser", {})
_chunk_analyzer = _CFG.get("chunk_analyzer", {})
_chunk_parser = _CFG.get("chunk_parser", {})
_evaluation = _CFG.get("evaluation", {})


def _normalize_database_url(url: str) -> str:
    """SQLAlchemy/psycopg2 expect ``postgresql://``; some hosts return ``postgres://``."""
    u = url.strip()
    if u.startswith("postgres://"):
        return "postgresql://" + u[len("postgres://"):]
    return u


def _parse_cors(value: str | None) -> list[str]:
    """Parse CORS origins from a string — handles plain URL, comma-separated, or JSON array."""
    if not value or not value.strip():
        return list(_app.get("cors_origins", ["*"]))
    v = value.strip()
    try:
        parsed = json.loads(v)
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed]
    except (json.JSONDecodeError, ValueError):
        pass
    return [x.strip() for x in v.split(",") if x.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App ---
    app_title: str = Field(default=_app.get("title", "RAG Debugger"))
    app_version: str = Field(default=_app.get("version", "0.1.0"))
    environment: str = Field(
        default=_app.get("env", "development"),
        validation_alias=AliasChoices("environment", "NEXEVAL_ENV"),
    )

    # Read CORS as plain string — avoids pydantic-settings JSON-parsing list fields
    _cors_origins_str: str | None = Field(default=None, validation_alias="CORS_ORIGINS")

    # --- Database (optional single URL for Neon / Render / etc.) ---
    database_url_direct: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL", "POSTGRES_URL"),
    )
    db_host: str = Field(default=_db.get("host", "localhost"))
    db_port: int = Field(default=_db.get("port", 5432))
    db_name: str = Field(default=_db.get("name", "rag_eval_db"))
    db_user: str = Field(default=_db.get("user", "postgres"))
    db_password: str = Field(default=_db.get("password", "postgres"))
    db_pool_size: int = Field(default=_db.get("pool_size", 10))
    db_max_overflow: int = Field(default=_db.get("max_overflow", 20))
    db_pool_pre_ping: bool = Field(default=_db.get("pool_pre_ping", True))

    # --- OpenAI ---
    openai_api_key: str = _openai.get("api_key", "")
    openai_model: str = _openai.get("model", "gpt-4o")
    openai_temperature: float = _openai.get("temperature", 0.7)
    openai_max_tokens: int = _openai.get("max_tokens", 500)

    # --- DeepEval ---
    deepeval_model: str = _deepeval.get("model", "gpt-4o")

    # --- Evaluation thresholds ---
    faithfulness_threshold: float = _thresholds.get("faithfulness", 0.5)
    answer_relevancy_threshold: float = _thresholds.get("answer_relevancy", 0.5)
    contextual_relevancy_threshold: float = _thresholds.get("contextual_relevancy", 0.5)
    contextual_precision_threshold: float = _thresholds.get("contextual_precision", 0.5)
    contextual_recall_threshold: float = _thresholds.get("contextual_recall", 0.5)
    hallucination_threshold: float = _thresholds.get("hallucination", 0.5)

    # --- Root cause classification thresholds ---
    rc_retrieval_failure_ctx_relevancy: float = _rc.get("retrieval_failure_ctx_relevancy", 0.5)
    rc_retrieval_failure_ctx_recall: float = _rc.get("retrieval_failure_ctx_recall", 0.5)
    rc_ranking_issue_ctx_precision: float = _rc.get("ranking_issue_ctx_precision", 0.5)
    rc_ranking_issue_ctx_recall_min: float = _rc.get("ranking_issue_ctx_recall_min", 0.5)
    rc_generation_failure_faithfulness: float = _rc.get("generation_failure_faithfulness", 0.5)
    rc_generation_failure_ctx_relevancy_min: float = _rc.get("generation_failure_ctx_relevancy_min", 0.5)
    rc_hallucination_score: float = _rc.get("hallucination_score", 0.3)
    rc_irrelevant_answer_relevancy: float = _rc.get("irrelevant_answer_relevancy", 0.5)

    # --- Rephraser ---
    rephraser_variant_count: int = _rephraser.get("variant_count", 4)
    rephraser_temperature: float = _rephraser.get("temperature", 0.7)
    rephraser_max_tokens: int = _rephraser.get("max_tokens", 500)
    rephraser_system_prompt: str = _rephraser.get(
        "system_prompt",
        "You are a query optimization assistant for a RAG-based chatbot. "
        "Given a user question, generate {variant_count} rephrased versions that are clearer, "
        "more specific, and more likely to retrieve relevant documents from a "
        "regulatory/pharmaceutical knowledge base. Each rephrased question should "
        "approach the topic from a slightly different angle or use different keywords. "
        "Return ONLY the rephrased questions, one per line, numbered 1-{variant_count}.",
    )

    # --- Chunk analyzer ---
    tfidf_max_features: int = _chunk_analyzer.get("tfidf_max_features", 5000)
    tfidf_stop_words: str = _chunk_analyzer.get("tfidf_stop_words", "english")
    content_preview_length: int = _chunk_analyzer.get("content_preview_length", 200)

    # --- Chunk parser ---
    ins_id_pattern: str = _chunk_parser.get("ins_id_pattern", r"INS\d{3,}")
    min_paragraph_length: int = _chunk_parser.get("min_paragraph_length", 20)

    # --- Evaluation ---
    auto_evaluate: bool = _evaluation.get("auto_evaluate", False)

    # --- Auth / encryption ---
    jwt_secret: str = "nexeval-dev-jwt-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080
    nexeval_credentials_key: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return _parse_cors(self._cors_origins_str)

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"

    @property
    def database_url(self) -> str:
        if self.database_url_direct:
            return _normalize_database_url(self.database_url_direct)
        return (
            f"postgresql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def effective_db_pool_size(self) -> int:
        """Smaller pools suit free-tier managed Postgres when using ``DATABASE_URL``."""
        if self.database_url_direct and self.is_production:
            return min(self.db_pool_size, 5)
        return self.db_pool_size


settings = Settings()

# Warn if production still uses default JWT secret (import-time is enough for deploy logs)
if settings.is_production and settings.jwt_secret == "nexeval-dev-jwt-secret-change-in-production":
    print(
        "NEXEVAL WARNING: NEXEVAL_ENV=production but JWT_SECRET is still the dev default. "
        "Set a strong JWT_SECRET in the environment.",
    )