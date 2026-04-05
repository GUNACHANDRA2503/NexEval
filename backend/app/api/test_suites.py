from __future__ import annotations

import os
import threading
import traceback
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import SessionLocal, get_db
from app.db.models import BugModel, TestSuiteItemModel, TestSuiteModel, TestSuiteRunModel, UserModel
from app.schemas import BugReport
from app.services.eval_runner import _openai_env_lock
from app.services.evaluation_engine import run_evaluation
from app.services.openai_user import effective_eval_model, resolve_openai_api_key
from app.services.usage_estimate import estimate_eval_tokens_and_cost
from app.store import store

router = APIRouter(tags=["test-suites"])


class TestSuiteCreate(BaseModel):
    name: str
    description: str = ""
    bug_ids: list[str] = []


class TestSuiteAddBugs(BaseModel):
    bug_ids: list[str]


def _suite_to_dict(suite: TestSuiteModel) -> dict:
    latest_run = suite.runs[0] if suite.runs else None
    return {
        "id": str(suite.id),
        "name": suite.name,
        "description": suite.description or "",
        "bug_count": len(suite.items),
        "run_count": len(suite.runs),
        "created_at": suite.created_at.isoformat() if suite.created_at else "",
        "bugs": [
            {
                "bug_id": str(item.bug_id),
                "user_question": item.bug.user_question if item.bug else "",
                "status": item.bug.status if item.bug else "open",
                "priority": item.bug.priority if item.bug else "medium",
                "evaluation_count": item.bug.evaluation_count if item.bug else 0,
            }
            for item in suite.items
        ],
        "latest_run": _run_to_dict(latest_run) if latest_run else None,
    }


def _run_to_dict(run: TestSuiteRunModel | None) -> dict:
    if not run:
        return {}
    return {
        "id": str(run.id),
        "suite_id": str(run.suite_id),
        "status": run.status,
        "total": run.total,
        "completed": run.completed,
        "failed": run.failed,
        "improved": run.improved,
        "regressed": run.regressed,
        "results": run.results or [],
        "started_at": run.started_at.isoformat() if run.started_at else "",
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
    }


def _get_suite_owned(db: Session, user_id: uuid.UUID, suite_id: str) -> TestSuiteModel | None:
    try:
        sid = uuid.UUID(suite_id)
    except ValueError:
        return None
    return (
        db.query(TestSuiteModel)
        .filter(TestSuiteModel.id == sid, TestSuiteModel.user_id == user_id)
        .first()
    )


@router.post("/test-suites")
def create_suite(
    body: TestSuiteCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    suite = TestSuiteModel(
        name=body.name,
        description=body.description,
        user_id=user.id,
    )
    db.add(suite)
    db.flush()

    for bug_id in body.bug_ids:
        bug = (
            db.query(BugModel)
            .filter(BugModel.id == uuid.UUID(bug_id), BugModel.user_id == user.id)
            .first()
        )
        if bug:
            item = TestSuiteItemModel(suite_id=suite.id, bug_id=bug.id)
            db.add(item)
    db.commit()
    db.refresh(suite)
    return _suite_to_dict(suite)


@router.get("/test-suites")
def list_suites(db: Session = Depends(get_db), user: UserModel = Depends(get_current_user)):
    suites = (
        db.query(TestSuiteModel)
        .filter(TestSuiteModel.user_id == user.id)
        .order_by(TestSuiteModel.created_at.desc())
        .all()
    )
    return [_suite_to_dict(s) for s in suites]


@router.get("/test-suites/{suite_id}")
def get_suite(
    suite_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    suite = _get_suite_owned(db, user.id, suite_id)
    if not suite:
        raise HTTPException(404, "Test suite not found")
    return _suite_to_dict(suite)


@router.delete("/test-suites/{suite_id}")
def delete_suite(
    suite_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    suite = _get_suite_owned(db, user.id, suite_id)
    if not suite:
        raise HTTPException(404, "Test suite not found")
    db.delete(suite)
    db.commit()
    return {"deleted": True}


@router.post("/test-suites/{suite_id}/bugs")
def add_bugs_to_suite(
    suite_id: str,
    body: TestSuiteAddBugs,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    suite = _get_suite_owned(db, user.id, suite_id)
    if not suite:
        raise HTTPException(404, "Test suite not found")

    existing_bug_ids = {str(item.bug_id) for item in suite.items}
    added = 0
    for bug_id in body.bug_ids:
        if bug_id in existing_bug_ids:
            continue
        bug = (
            db.query(BugModel)
            .filter(BugModel.id == uuid.UUID(bug_id), BugModel.user_id == user.id)
            .first()
        )
        if bug:
            item = TestSuiteItemModel(suite_id=suite.id, bug_id=bug.id)
            db.add(item)
            added += 1
    db.commit()
    db.refresh(suite)
    return {"added": added, "suite": _suite_to_dict(suite)}


@router.post("/test-suites/{suite_id}/run")
def trigger_suite_run(
    suite_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    suite = _get_suite_owned(db, user.id, suite_id)
    if not suite:
        raise HTTPException(404, "Test suite not found")

    bug_ids = [str(item.bug_id) for item in suite.items]
    if not bug_ids:
        raise HTTPException(400, "Suite has no bugs")

    run = TestSuiteRunModel(
        suite_id=suite.id,
        status="running",
        total=len(bug_ids),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    run_id = str(run.id)
    t = threading.Thread(
        target=_run_suite_in_thread,
        args=(run_id, suite_id, bug_ids, user.id),
        daemon=True,
    )
    t.start()
    return _run_to_dict(run)


@router.get("/test-suites/{suite_id}/runs")
def list_suite_runs(
    suite_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    if not _get_suite_owned(db, user.id, suite_id):
        raise HTTPException(404, "Test suite not found")
    try:
        sid = uuid.UUID(suite_id)
    except ValueError:
        raise HTTPException(404, "Test suite not found")
    runs = (
        db.query(TestSuiteRunModel)
        .filter(TestSuiteRunModel.suite_id == sid)
        .order_by(TestSuiteRunModel.started_at.desc())
        .all()
    )
    return [_run_to_dict(r) for r in runs]


@router.get("/test-suites/{suite_id}/runs/{run_id}")
def get_suite_run(
    suite_id: str,
    run_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    if not _get_suite_owned(db, user.id, suite_id):
        raise HTTPException(404, "Test suite not found")
    try:
        sid = uuid.UUID(suite_id)
        rid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(404, "Run not found")
    run = (
        db.query(TestSuiteRunModel)
        .filter(TestSuiteRunModel.id == rid, TestSuiteRunModel.suite_id == sid)
        .first()
    )
    if not run:
        raise HTTPException(404, "Run not found")
    return _run_to_dict(run)


def _run_suite_in_thread(run_id: str, suite_id: str, bug_ids: list[str], user_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        run = db.query(TestSuiteRunModel).filter(TestSuiteRunModel.id == uuid.UUID(run_id)).first()
        if not run:
            return

        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            run.status = "failed"
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        api_key = resolve_openai_api_key(db, user)
        if not api_key:
            run.status = "failed"
            run.finished_at = datetime.now(timezone.utc)
            run.results = [{"error": "OpenAI API key required"}]
            db.commit()
            return

        m = effective_eval_model(user)

        results = []
        completed = 0
        failed = 0
        improved = 0
        regressed = 0

        with _openai_env_lock:
            old_key = os.environ.get("OPENAI_API_KEY")
            try:
                os.environ["OPENAI_API_KEY"] = api_key
                for bug_id in bug_ids:
                    bug_data = store.get_bug(db, user_id, bug_id)
                    if not bug_data:
                        results.append({"bug_id": bug_id, "error": "Bug not found"})
                        failed += 1
                        continue

                    before_eval = store.get_evaluation(db, user_id, bug_id)
                    before_scores = {}
                    if before_eval:
                        for s in before_eval.get("scores", []):
                            before_scores[s["name"]] = s["score"]

                    try:
                        bug_obj = BugReport(**bug_data)
                        eval_result = run_evaluation(bug_obj, model=m)
                        saved = store.save_evaluation(db, user_id, bug_id, eval_result.model_dump())
                        est = estimate_eval_tokens_and_cost(bug_data, m)
                        store.add_usage_ledger(
                            db,
                            user_id,
                            "eval",
                            m,
                            int(est["prompt_tokens"]),
                            int(est["completion_tokens"]),
                            float(est["estimated_cost_usd"]),
                            evaluation_id=uuid.UUID(saved["id"]),
                        )

                        after_scores = {}
                        for s in saved.get("scores", []):
                            after_scores[s["name"]] = s["score"]

                        faith_before = before_scores.get("Faithfulness", 0)
                        faith_after = after_scores.get("Faithfulness", 0)
                        if faith_after > faith_before + 0.05:
                            improved += 1
                        elif faith_after < faith_before - 0.05:
                            regressed += 1

                        results.append(
                            {
                                "bug_id": bug_id,
                                "user_question": bug_data.get("user_question", ""),
                                "before": before_scores,
                                "after": after_scores,
                                "before_root_cause": before_eval.get("root_cause") if before_eval else None,
                                "after_root_cause": saved.get("root_cause"),
                            }
                        )
                        completed += 1
                    except Exception as e:
                        results.append(
                            {
                                "bug_id": bug_id,
                                "user_question": bug_data.get("user_question", ""),
                                "error": str(e),
                            }
                        )
                        failed += 1

                    run.completed = completed
                    run.failed = failed
                    run.improved = improved
                    run.regressed = regressed
                    run.results = results
                    db.commit()
            finally:
                if old_key is not None:
                    os.environ["OPENAI_API_KEY"] = old_key
                else:
                    os.environ.pop("OPENAI_API_KEY", None)

        run.status = "completed"
        run.finished_at = datetime.now(timezone.utc)
        run.completed = completed
        run.failed = failed
        run.improved = improved
        run.regressed = regressed
        run.results = results
        db.commit()
    except Exception:
        traceback.print_exc()
        try:
            run = db.query(TestSuiteRunModel).filter(TestSuiteRunModel.id == uuid.UUID(run_id)).first()
            if run:
                run.status = "failed"
                run.finished_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
