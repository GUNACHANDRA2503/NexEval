from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ---------- Enums ----------

class BugStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    INVALID = "invalid"


class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RootCauseType(str, Enum):
    RETRIEVAL_FAILURE = "RETRIEVAL_FAILURE"
    RANKING_ISSUE = "RANKING_ISSUE"
    GENERATION_FAILURE = "GENERATION_FAILURE"
    HALLUCINATION = "HALLUCINATION"
    IRRELEVANT_ANSWER = "IRRELEVANT_ANSWER"
    ACCEPTABLE = "ACCEPTABLE"


# ---------- Chunk models ----------

class ChunkContent(BaseModel):
    document_name: str = ""
    content: list[str] = []


class ChunkMetadata(BaseModel):
    title: str = ""
    synopsis: str = ""
    release_date: str = ""
    encrypted_regulation_id: str = ""
    reference_insight_id: str = ""
    attachment_name: str = ""
    ref_url: list[str] = []
    countries: list[str] = []
    brandNames: list[str] = []
    chunks: list[ChunkContent] = []


class RetrievedChunk(BaseModel):
    id: str
    module_name: str = ""
    metadata: ChunkMetadata = ChunkMetadata()


# ---------- Bug models ----------

class BugCreate(BaseModel):
    user_question: str
    expected_answer: str = ""
    actual_answer: str
    ins_ids: list[str] = []
    expected_ins_ids: list[str] = []
    module_name: str = ""
    priority: Priority = Priority.MEDIUM
    retrieved_chunks: list[RetrievedChunk] = []
    retrieved_chunks_raw: str = ""


class BugReport(BaseModel):
    id: str
    user_question: str
    expected_answer: str = ""
    actual_answer: str
    ins_ids: list[str] = []
    expected_ins_ids: list[str] = []
    module_name: str = ""
    priority: Priority = Priority.MEDIUM
    status: BugStatus = BugStatus.OPEN
    retrieved_chunks: list[RetrievedChunk] = []
    retrieved_chunks_raw: str = ""
    created_at: str = ""
    has_evaluation: bool = False
    evaluation_count: int = 0
    latest_evaluation: Any | None = None


class BugUpdate(BaseModel):
    user_question: str | None = None
    expected_answer: str | None = None
    actual_answer: str | None = None
    ins_ids: list[str] | None = None
    expected_ins_ids: list[str] | None = None
    module_name: str | None = None
    priority: Priority | None = None
    retrieved_chunks_raw: str | None = None


class BugStatusUpdate(BaseModel):
    status: BugStatus


# ---------- Evaluation models ----------

class MetricScore(BaseModel):
    name: str
    score: float
    threshold: float
    passed: bool
    reason: str = ""


class EvaluationResult(BaseModel):
    bug_id: str
    run_number: int = 1
    scores: list[MetricScore] = []
    root_cause: RootCauseType = RootCauseType.ACCEPTABLE
    root_cause_explanation: str = ""
    fix_suggestions: list[str] = []
    evaluated_at: str = ""


class EvaluationHistoryItem(BaseModel):
    id: str = ""
    bug_id: str
    run_number: int
    scores: list[MetricScore] = []
    root_cause: RootCauseType = RootCauseType.ACCEPTABLE
    root_cause_explanation: str = ""
    fix_suggestions: list[str] = []
    evaluated_at: str = ""


# ---------- Chunk analysis ----------

class ChunkRelevancy(BaseModel):
    chunk_index: int
    ins_id: str
    document_title: str = ""
    relevancy_score: float
    content_preview: str = ""


class ChunkAnalysisRequest(BaseModel):
    question: str
    chunks: list[RetrievedChunk] = []
    chunks_raw: str = ""


class ChunkAnalysisResponse(BaseModel):
    question: str
    chunk_scores: list[ChunkRelevancy] = []
    expected_ins_ids_found: list[str] = []
    expected_ins_ids_missing: list[str] = []


# ---------- Rephraser ----------

class RephraseRequest(BaseModel):
    question: str
    context: str = ""


class RephraseResponse(BaseModel):
    original: str
    rephrased: list[str] = []


# ---------- Batch ----------

class BatchEvalRequest(BaseModel):
    bugs: list[BugCreate]
    model: str | None = None


class BatchItemResult(BaseModel):
    index: int
    user_question: str
    evaluation: EvaluationResult | None = None
    error: str | None = None


class BatchEvalResponse(BaseModel):
    batch_id: str
    total: int
    completed: int
    failed: int
    results: list[BatchItemResult] = []


# ---------- Analytics ----------

class AnalyticsOverview(BaseModel):
    total_bugs: int = 0
    open_bugs: int = 0
    resolved_bugs: int = 0
    invalid_bugs: int = 0
    avg_faithfulness: float | None = None
    avg_answer_relevancy: float | None = None
    avg_contextual_relevancy: float | None = None
    most_common_root_cause: str | None = None


class RootCauseCount(BaseModel):
    root_cause: str
    count: int


class TrendPoint(BaseModel):
    date: str
    count: int


class AnalyticsTrends(BaseModel):
    points: list[TrendPoint] = []


# ---------- Auth / account ----------

class UserRegister(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8)

    @field_validator("password")
    @classmethod
    def password_within_bcrypt_limit(cls, v: str) -> str:
        # bcrypt only uses the first 72 UTF-8 bytes; enforce clearly for users
        n = len(v.encode("utf-8"))
        if n > 72:
            raise ValueError(
                "Password is too long. Use a shorter password, or fewer emoji and special symbols."
            )
        return v


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMe(BaseModel):
    id: str
    email: str
    preferred_model: str | None = None
    saved_models: list[str] = []
    freya_enabled: bool = False


class OpenAIKeyBody(BaseModel):
    api_key: str = Field(..., min_length=10)


class OpenAIKeyStatus(BaseModel):
    configured: bool
    key_last_four: str = ""


class PreferencesUpdate(BaseModel):
    preferred_model: str | None = None
    saved_models: list[str] | None = None
    freya_enabled: bool | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_within_bcrypt_limit(cls, v: str) -> str:
        n = len(v.encode("utf-8"))
        if n > 72:
            raise ValueError(
                "Password is too long. Use a shorter password, or fewer emoji and special symbols."
            )
        return v


class EvaluateRequest(BaseModel):
    model: str | None = None
