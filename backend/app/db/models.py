import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Text,
    Float,
    Boolean,
    Integer,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserModel(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email = Column(String(320), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    preferred_model = Column(String(128), nullable=True)
    saved_models = Column(JSON, default=list)
    freya_enabled = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    openai_credential = relationship(
        "UserOpenAICredentialModel", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class UserOpenAICredentialModel(Base):
    __tablename__ = "user_openai_credentials"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    encrypted_api_key = Column(Text, nullable=False)
    key_last_four = Column(String(8), nullable=False, default="")
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    user = relationship("UserModel", back_populates="openai_credential")


class UsageLedgerModel(Base):
    __tablename__ = "usage_ledger"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    evaluation_id = Column(UUID(as_uuid=True), ForeignKey("evaluations.id", ondelete="SET NULL"), nullable=True)
    operation = Column(String(64), nullable=False)
    model = Column(String(128), nullable=False, default="")
    prompt_tokens = Column(Integer, nullable=False, default=0)
    completion_tokens = Column(Integer, nullable=False, default=0)
    estimated_cost_usd = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime(timezone=True), default=_utcnow, index=True)


class BugModel(Base):
    __tablename__ = "bugs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    user_question = Column(Text, nullable=False)
    expected_answer = Column(Text, default="")
    actual_answer = Column(Text, nullable=False)
    ins_ids = Column(JSON, default=list)
    expected_ins_ids = Column(JSON, default=list)
    module_name = Column(String(255), default="")
    priority = Column(String(50), default="medium")
    status = Column(String(50), default="open")
    retrieved_chunks = Column(JSON, default=list)
    retrieved_chunks_raw = Column(Text, default="")
    evaluation_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    evaluations = relationship(
        "EvaluationModel",
        back_populates="bug",
        cascade="all, delete-orphan",
        order_by="EvaluationModel.run_number.desc()",
    )
    chunk_analyses = relationship("ChunkAnalysisModel", back_populates="bug", cascade="all, delete-orphan")
    rephrased_questions = relationship(
        "RephrasedQuestionModel", back_populates="bug", cascade="all, delete-orphan"
    )


class EvaluationModel(Base):
    __tablename__ = "evaluations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    bug_id = Column(UUID(as_uuid=True), ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False, index=True)
    run_number = Column(Integer, nullable=False)
    root_cause = Column(String(100), default="ACCEPTABLE")
    root_cause_explanation = Column(Text, default="")
    fix_suggestions = Column(JSON, default=list)
    evaluated_at = Column(DateTime(timezone=True), default=_utcnow)

    bug = relationship("BugModel", back_populates="evaluations")
    metric_scores = relationship(
        "MetricScoreModel", back_populates="evaluation", cascade="all, delete-orphan"
    )


class MetricScoreModel(Base):
    __tablename__ = "metric_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    evaluation_id = Column(
        UUID(as_uuid=True), ForeignKey("evaluations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(100), nullable=False)
    score = Column(Float, nullable=False)
    threshold = Column(Float, nullable=False)
    passed = Column(Boolean, nullable=False)
    reason = Column(Text, default="")

    evaluation = relationship("EvaluationModel", back_populates="metric_scores")


class ChunkAnalysisModel(Base):
    __tablename__ = "chunk_analyses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    bug_id = Column(UUID(as_uuid=True), ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_scores = Column(JSON, default=list)
    found_ins_ids = Column(JSON, default=list)
    missing_ins_ids = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    bug = relationship("BugModel", back_populates="chunk_analyses")


class RephrasedQuestionModel(Base):
    __tablename__ = "rephrased_questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    bug_id = Column(UUID(as_uuid=True), ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False, index=True)
    original = Column(Text, nullable=False)
    rephrased = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    bug = relationship("BugModel", back_populates="rephrased_questions")


class BatchModel(Base):
    __tablename__ = "batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    total = Column(Integer, default=0)
    completed = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    items = relationship("BatchItemModel", back_populates="batch", cascade="all, delete-orphan")


class BatchItemModel(Base):
    __tablename__ = "batch_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False, index=True)
    bug_id = Column(UUID(as_uuid=True), ForeignKey("bugs.id", ondelete="SET NULL"), nullable=True, index=True)
    item_index = Column(Integer, nullable=False)
    error = Column(Text, default=None)

    batch = relationship("BatchModel", back_populates="items")


class TestSuiteModel(Base):
    __tablename__ = "test_suites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    items = relationship("TestSuiteItemModel", back_populates="suite", cascade="all, delete-orphan")
    runs = relationship(
        "TestSuiteRunModel",
        back_populates="suite",
        cascade="all, delete-orphan",
        order_by="TestSuiteRunModel.started_at.desc()",
    )


class TestSuiteItemModel(Base):
    __tablename__ = "test_suite_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    suite_id = Column(UUID(as_uuid=True), ForeignKey("test_suites.id", ondelete="CASCADE"), nullable=False, index=True)
    bug_id = Column(UUID(as_uuid=True), ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False, index=True)
    added_at = Column(DateTime(timezone=True), default=_utcnow)

    suite = relationship("TestSuiteModel", back_populates="items")
    bug = relationship("BugModel")


class TestSuiteRunModel(Base):
    __tablename__ = "test_suite_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    suite_id = Column(UUID(as_uuid=True), ForeignKey("test_suites.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), default="pending")
    total = Column(Integer, default=0)
    completed = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    improved = Column(Integer, default=0)
    regressed = Column(Integer, default=0)
    results = Column(JSON, default=list)
    started_at = Column(DateTime(timezone=True), default=_utcnow)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    suite = relationship("TestSuiteModel", back_populates="runs")
