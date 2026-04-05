from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from typing import Generator

from app.config import settings

engine = create_engine(
    settings.database_url,
    pool_size=settings.effective_db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=settings.db_pool_pre_ping,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables() -> None:
    from app.db import models  # noqa: F401 – ensure models are registered
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations() -> None:
    """Add columns that may be missing from earlier schema versions."""
    from sqlalchemy import text, inspect

    inspector = inspect(engine)
    with engine.begin() as conn:
        if inspector.has_table("bugs"):
            columns = {c["name"] for c in inspector.get_columns("bugs")}
            if "expected_ins_ids" not in columns:
                conn.execute(text("ALTER TABLE bugs ADD COLUMN expected_ins_ids JSON DEFAULT '[]'"))
            if "user_id" not in columns:
                conn.execute(
                    text(
                        "ALTER TABLE bugs ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE"
                    )
                )
        if inspector.has_table("batches"):
            bcols = {c["name"] for c in inspector.get_columns("batches")}
            if "user_id" not in bcols:
                conn.execute(
                    text(
                        "ALTER TABLE batches ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE"
                    )
                )
        if inspector.has_table("test_suites"):
            scols = {c["name"] for c in inspector.get_columns("test_suites")}
            if "user_id" not in scols:
                conn.execute(
                    text(
                        "ALTER TABLE test_suites ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE"
                    )
                )
        if inspector.has_table("users"):
            ucols = {c["name"] for c in inspector.get_columns("users")}
            if "saved_models" not in ucols:
                conn.execute(text("ALTER TABLE users ADD COLUMN saved_models JSON DEFAULT '[]'"))
            if "freya_enabled" not in ucols:
                conn.execute(text("ALTER TABLE users ADD COLUMN freya_enabled BOOLEAN DEFAULT false NOT NULL"))
