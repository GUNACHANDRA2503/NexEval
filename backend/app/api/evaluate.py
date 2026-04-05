from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.bugs import create_bug_for_user
from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import UserModel
from app.schemas import (
    BatchEvalRequest,
    BatchEvalResponse,
    BatchItemResult,
    BugReport,
    ChunkAnalysisRequest,
    ChunkAnalysisResponse,
    EvaluateRequest,
    EvaluationHistoryItem,
    EvaluationResult,
    RephraseRequest,
    RephraseResponse,
)
from app.services.chunk_analyzer import analyze_chunks
from app.services.chunk_parser import parse_chunks_text
from app.services.eval_runner import (
    _openai_env_lock,
    get_eval_status,
    list_running,
    start_evaluation,
)
from app.services.evaluation_engine import run_evaluation
from app.services.openai_user import effective_eval_model, resolve_openai_api_key
from app.services.rephraser import rephrase_question
from app.services.usage_estimate import estimate_eval_tokens_and_cost
from app.store import store

router = APIRouter(tags=["evaluate"])


def _require_openai_key(db, user: UserModel) -> str:
    key = resolve_openai_api_key(db, user)
    if not key:
        raise HTTPException(
            402,
            "OpenAI API key required. Add your key in Account.",
        )
    return key


@router.post("/evaluate/batch", response_model=BatchEvalResponse)
def batch_evaluate(
    body: BatchEvalRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    batch_id = str(uuid.uuid4())
    results: list[BatchItemResult] = []
    completed = 0
    failed = 0

    api_key = _require_openai_key(db, user)
    m = (body.model or "").strip() or effective_eval_model(user)

    with _openai_env_lock:
        old_key = os.environ.get("OPENAI_API_KEY")
        try:
            os.environ["OPENAI_API_KEY"] = api_key
            for idx, bug_create in enumerate(body.bugs):
                try:
                    bug_report = create_bug_for_user(db, user.id, bug_create)
                    bug_id = bug_report["id"]
                    bug_data = store.get_bug(db, user.id, bug_id)
                    if not bug_data:
                        raise ValueError("Bug missing after create")
                    bug_obj = BugReport(**bug_data)
                    eval_result = run_evaluation(bug_obj, model=m)
                    saved = store.save_evaluation(db, user.id, bug_id, eval_result.model_dump())
                    est = estimate_eval_tokens_and_cost(bug_data, m)
                    store.add_usage_ledger(
                        db,
                        user.id,
                        "eval",
                        m,
                        int(est["prompt_tokens"]),
                        int(est["completion_tokens"]),
                        float(est["estimated_cost_usd"]),
                        evaluation_id=uuid.UUID(saved["id"]),
                    )

                    results.append(
                        BatchItemResult(
                            index=idx,
                            user_question=bug_create.user_question,
                            evaluation=eval_result,
                        )
                    )
                    completed += 1
                except Exception as e:
                    results.append(
                        BatchItemResult(
                            index=idx,
                            user_question=bug_create.user_question,
                            error=str(e),
                        )
                    )
                    failed += 1
        finally:
            if old_key is not None:
                os.environ["OPENAI_API_KEY"] = old_key
            else:
                os.environ.pop("OPENAI_API_KEY", None)

    response = BatchEvalResponse(
        batch_id=batch_id,
        total=len(body.bugs),
        completed=completed,
        failed=failed,
        results=results,
    )
    store.save_batch(db, user.id, batch_id, response.model_dump())
    return response


@router.get("/evaluate/batch/{batch_id}", response_model=BatchEvalResponse)
def get_batch_result(
    batch_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    data = store.get_batch(db, user.id, batch_id)
    if not data:
        raise HTTPException(404, "Batch not found")
    return data


@router.get("/evaluate/running")
def get_running_evals(user: UserModel = Depends(get_current_user)):
    return list_running(user.id)


@router.post("/evaluate/{bug_id}")
def evaluate_bug(
    bug_id: str,
    body: EvaluateRequest = EvaluateRequest(),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    data = store.get_bug(db, user.id, bug_id)
    if not data:
        raise HTTPException(404, "Bug not found")
    api_key = _require_openai_key(db, user)
    m = (body.model or "").strip() or effective_eval_model(user)
    est = estimate_eval_tokens_and_cost(data, m)
    job = start_evaluation(
        bug_id,
        data,
        user_id=user.id,
        api_key=api_key,
        model=m,
        estimate=est,
    )
    return job


@router.get("/evaluate/{bug_id}/status")
def get_evaluation_status(
    bug_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    job = get_eval_status(bug_id, user.id)
    if job:
        return job
    ev = store.get_evaluation(db, user.id, bug_id)
    if ev:
        return {
            "bug_id": bug_id,
            "status": "completed",
            "result": ev,
            "error": None,
            "started_at": None,
            "finished_at": None,
            "estimate": None,
            "usage_actual": None,
        }
    return {
        "bug_id": bug_id,
        "status": "none",
        "result": None,
        "error": None,
        "started_at": None,
        "finished_at": None,
        "estimate": None,
        "usage_actual": None,
    }


@router.get("/evaluate/{bug_id}", response_model=EvaluationResult)
def get_evaluation(
    bug_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    data = store.get_evaluation(db, user.id, bug_id)
    if not data:
        raise HTTPException(404, "Evaluation not found. Run POST /api/evaluate/{bug_id} first.")
    return data


@router.get("/evaluate/{bug_id}/history", response_model=list[EvaluationHistoryItem])
def get_evaluation_history(
    bug_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    if not store.get_bug(db, user.id, bug_id):
        raise HTTPException(404, "Bug not found")
    return store.list_evaluations_for_bug(db, user.id, bug_id)


@router.post("/chunks/analyze", response_model=ChunkAnalysisResponse)
def analyze_chunk_relevancy(
    body: ChunkAnalysisRequest,
    user: UserModel = Depends(get_current_user),
):
    chunks = body.chunks
    if not chunks and body.chunks_raw:
        chunks, _ = parse_chunks_text(body.chunks_raw)

    ins_ids = [c.id for c in chunks]
    scored, found, missing = analyze_chunks(body.question, chunks, ins_ids)
    return ChunkAnalysisResponse(
        question=body.question,
        chunk_scores=scored,
        expected_ins_ids_found=found,
        expected_ins_ids_missing=missing,
    )


@router.post("/rephrase", response_model=RephraseResponse)
def rephrase(
    body: RephraseRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    api_key = _require_openai_key(db, user)
    m = effective_eval_model(user)
    variants = rephrase_question(body.question, body.context, api_key=api_key, model=m)
    est_prompt = max(100, len(body.question) // 4 * 20)
    est_comp = 200
    store.add_usage_ledger(
        db,
        user.id,
        "rephrase",
        m,
        est_prompt,
        est_comp,
        0.0001,
        evaluation_id=None,
    )
    return RephraseResponse(original=body.question, rephrased=variants)


@router.get("/rephrase/{bug_id}", response_model=RephraseResponse)
def get_rephrased_for_bug(
    bug_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    data = store.get_rephrased(db, user.id, bug_id)
    if not data:
        raise HTTPException(404, "No rephrased questions found for this bug")
    return data


@router.post("/rephrase/{bug_id}", response_model=RephraseResponse)
def generate_rephrased_for_bug(
    bug_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    bug_data = store.get_bug(db, user.id, bug_id)
    if not bug_data:
        raise HTTPException(404, "Bug not found")

    api_key = _require_openai_key(db, user)
    m = effective_eval_model(user)
    variants = rephrase_question(bug_data["user_question"], "", api_key=api_key, model=m)
    result = {"original": bug_data["user_question"], "rephrased": variants}
    store.save_rephrased(db, user.id, bug_id, result)
    store.add_usage_ledger(
        db,
        user.id,
        "rephrase",
        m,
        max(100, len(bug_data["user_question"]) // 4 * 20),
        200,
        0.0001,
        evaluation_id=None,
    )
    return result
