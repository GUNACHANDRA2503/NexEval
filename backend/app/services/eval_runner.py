"""Async evaluation runner: background threads + OpenAI env lock for BYOK."""
from __future__ import annotations

import os
import threading
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

from app.db.database import SessionLocal
from app.schemas import BugReport
from app.services.evaluation_engine import run_evaluation
from app.store import store


class _EvalJob:
    __slots__ = (
        "bug_id",
        "user_id",
        "status",
        "started_at",
        "finished_at",
        "result",
        "error",
        "estimate",
        "usage_actual",
    )

    def __init__(
        self,
        bug_id: str,
        user_id: uuid.UUID,
        estimate: dict[str, Any] | None = None,
    ) -> None:
        self.bug_id = bug_id
        self.user_id = user_id
        self.status: str = "running"
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.finished_at: str | None = None
        self.result: dict[str, Any] | None = None
        self.error: str | None = None
        self.estimate: dict[str, Any] | None = estimate
        self.usage_actual: dict[str, Any] | None = None


_jobs: dict[str, _EvalJob] = {}
_lock = threading.Lock()
_openai_env_lock = threading.Lock()


def start_evaluation(
    bug_id: str,
    bug_data: dict,
    *,
    user_id: uuid.UUID,
    api_key: str,
    model: str,
    estimate: dict[str, Any] | None = None,
) -> dict:
    """Launch evaluation in a background thread. Returns immediately."""
    with _lock:
        existing = _jobs.get(bug_id)
        if existing and existing.status == "running":
            return _job_to_dict(existing)

        job = _EvalJob(bug_id, user_id, estimate=estimate)
        _jobs[bug_id] = job

    t = threading.Thread(
        target=_run_in_thread,
        args=(bug_id, bug_data, user_id, api_key, model, estimate or {}),
        daemon=True,
    )
    t.start()
    return _job_to_dict(job)


def get_eval_status(bug_id: str, user_id: uuid.UUID | None = None) -> dict | None:
    job = _jobs.get(bug_id)
    if not job:
        return None
    if user_id is not None and job.user_id != user_id:
        return None
    return _job_to_dict(job)


def is_running(bug_id: str) -> bool:
    job = _jobs.get(bug_id)
    return job is not None and job.status == "running"


def list_running(user_id: uuid.UUID) -> list[dict]:
    with _lock:
        return [
            _job_to_dict(j)
            for j in _jobs.values()
            if j.status == "running" and j.user_id == user_id
        ]


def _job_to_dict(job: _EvalJob) -> dict:
    return {
        "bug_id": job.bug_id,
        "status": job.status,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "result": job.result,
        "error": job.error,
        "estimate": job.estimate,
        "usage_actual": job.usage_actual,
    }


def _run_in_thread(
    bug_id: str,
    bug_data: dict,
    user_id: uuid.UUID,
    api_key: str,
    model: str,
    estimate: dict[str, Any],
) -> None:
    job = _jobs[bug_id]
    db = SessionLocal()
    try:
        bug = BugReport(**bug_data)
        with _openai_env_lock:
            old_key = os.environ.get("OPENAI_API_KEY")
            try:
                os.environ["OPENAI_API_KEY"] = api_key
                result = run_evaluation(bug, model=model)
                saved = store.save_evaluation(db, user_id, bug_id, result.model_dump())
            finally:
                if old_key is not None:
                    os.environ["OPENAI_API_KEY"] = old_key
                else:
                    os.environ.pop("OPENAI_API_KEY", None)

        ev_uuid = uuid.UUID(saved["id"])
        store.add_usage_ledger(
            db,
            user_id,
            "eval",
            model,
            int(estimate.get("prompt_tokens", 0)),
            int(estimate.get("completion_tokens", 0)),
            float(estimate.get("estimated_cost_usd", 0.0)),
            evaluation_id=ev_uuid,
        )
        usage_actual = {
            "prompt_tokens": int(estimate.get("prompt_tokens", 0)),
            "completion_tokens": int(estimate.get("completion_tokens", 0)),
            "estimated_cost_usd": float(estimate.get("estimated_cost_usd", 0.0)),
        }
        with _lock:
            job.status = "completed"
            job.finished_at = datetime.now(timezone.utc).isoformat()
            job.result = saved
            job.usage_actual = usage_actual
    except Exception as e:
        with _lock:
            job.status = "failed"
            job.finished_at = datetime.now(timezone.utc).isoformat()
            job.error = str(e)
        traceback.print_exc()
    finally:
        db.close()
