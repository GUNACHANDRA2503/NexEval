from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import (
    BatchItemModel,
    BatchModel,
    BugModel,
    ChunkAnalysisModel,
    EvaluationModel,
    MetricScoreModel,
    RephrasedQuestionModel,
    UsageLedgerModel,
)


def _bug_to_dict(bug: BugModel) -> dict[str, Any]:
    latest_eval = bug.evaluations[0] if bug.evaluations else None
    return {
        "id": str(bug.id),
        "user_question": bug.user_question,
        "expected_answer": bug.expected_answer or "",
        "actual_answer": bug.actual_answer,
        "ins_ids": bug.ins_ids or [],
        "expected_ins_ids": bug.expected_ins_ids or [],
        "module_name": bug.module_name or "",
        "priority": bug.priority or "medium",
        "status": bug.status or "open",
        "retrieved_chunks": bug.retrieved_chunks or [],
        "retrieved_chunks_raw": bug.retrieved_chunks_raw or "",
        "created_at": bug.created_at.isoformat() if bug.created_at else "",
        "has_evaluation": (bug.evaluation_count or 0) > 0,
        "evaluation_count": bug.evaluation_count or 0,
        "latest_evaluation": _evaluation_to_dict(latest_eval) if latest_eval else None,
    }


def _evaluation_to_dict(ev: EvaluationModel) -> dict[str, Any]:
    return {
        "id": str(ev.id),
        "bug_id": str(ev.bug_id),
        "run_number": ev.run_number,
        "scores": [
            {
                "name": ms.name,
                "score": ms.score,
                "threshold": ms.threshold,
                "passed": ms.passed,
                "reason": ms.reason or "",
            }
            for ms in ev.metric_scores
        ],
        "root_cause": ev.root_cause or "ACCEPTABLE",
        "root_cause_explanation": ev.root_cause_explanation or "",
        "fix_suggestions": ev.fix_suggestions or [],
        "evaluated_at": ev.evaluated_at.isoformat() if ev.evaluated_at else "",
    }


def _parse_bug_id(bug_id: str | uuid.UUID) -> uuid.UUID | None:
    if isinstance(bug_id, uuid.UUID):
        return bug_id
    try:
        return uuid.UUID(str(bug_id))
    except ValueError:
        return None


def _get_bug_owned(db: Session, user_id: uuid.UUID, bug_id: str | uuid.UUID) -> BugModel | None:
    bid = _parse_bug_id(bug_id)
    if not bid:
        return None
    return db.query(BugModel).filter(BugModel.id == bid, BugModel.user_id == user_id).first()


class DatabaseStore:
    """PostgreSQL-backed store; all bug-scoped data is filtered by user_id."""

    # ---- bugs ----

    def save_bug(self, db: Session, bug_id: str, data: dict, user_id: uuid.UUID) -> None:
        p = _parse_bug_id(bug_id)
        if not p:
            raise ValueError("Invalid bug id")
        uid = p
        existing = db.query(BugModel).filter(BugModel.id == uid).first()
        if existing:
            if existing.user_id != user_id:
                raise PermissionError("Bug not owned by user")
            for key, val in data.items():
                if key in ("id", "created_at", "user_id"):
                    continue
                if hasattr(existing, key):
                    setattr(existing, key, val)
        else:
            row = BugModel(
                id=uid,
                user_id=user_id,
                user_question=data.get("user_question", ""),
                expected_answer=data.get("expected_answer", ""),
                actual_answer=data.get("actual_answer", ""),
                ins_ids=data.get("ins_ids", []),
                expected_ins_ids=data.get("expected_ins_ids", []),
                module_name=data.get("module_name", ""),
                priority=data.get("priority", "medium"),
                status=data.get("status", "open"),
                retrieved_chunks=data.get("retrieved_chunks", []),
                retrieved_chunks_raw=data.get("retrieved_chunks_raw", ""),
                evaluation_count=data.get("evaluation_count", 0),
            )
            db.add(row)
        db.commit()

    def get_bug(self, db: Session, user_id: uuid.UUID, bug_id: str) -> dict | None:
        bug = _get_bug_owned(db, user_id, bug_id)
        if not bug:
            return None
        return _bug_to_dict(bug)

    def get_bug_for_worker(self, db: Session, user_id: uuid.UUID, bug_id: str) -> dict | None:
        """Same as get_bug; explicit name for background threads."""
        return self.get_bug(db, user_id, bug_id)

    def list_bugs(self, db: Session, user_id: uuid.UUID, status: str | None = None) -> list[dict]:
        q = db.query(BugModel).filter(BugModel.user_id == user_id)
        if status:
            q = q.filter(BugModel.status == status)
        q = q.order_by(BugModel.created_at.desc())
        return [_bug_to_dict(b) for b in q.all()]

    def delete_bug(self, db: Session, user_id: uuid.UUID, bug_id: str) -> bool:
        bug = _get_bug_owned(db, user_id, bug_id)
        if not bug:
            return False
        db.delete(bug)
        db.commit()
        return True

    def update_bug(self, db: Session, user_id: uuid.UUID, bug_id: str, updates: dict) -> bool:
        bug = _get_bug_owned(db, user_id, bug_id)
        if not bug:
            return False
        for key, val in updates.items():
            if val is None:
                continue
            if key == "priority" and hasattr(val, "value"):
                val = val.value
            if hasattr(bug, key):
                setattr(bug, key, val)
        db.commit()
        return True

    def update_bug_status(self, db: Session, user_id: uuid.UUID, bug_id: str, status: str) -> bool:
        bug = _get_bug_owned(db, user_id, bug_id)
        if not bug:
            return False
        bug.status = status
        db.commit()
        return True

    # ---- evaluations ----

    def save_evaluation(
        self, db: Session, user_id: uuid.UUID, bug_id: str, data: dict
    ) -> dict:
        bug = _get_bug_owned(db, user_id, bug_id)
        if not bug:
            raise ValueError(f"Bug {bug_id} not found")

        max_run = (
            db.query(func.coalesce(func.max(EvaluationModel.run_number), 0))
            .filter(EvaluationModel.bug_id == bug.id)
            .scalar()
        )
        run_number = max_run + 1

        ev = EvaluationModel(
            bug_id=bug.id,
            run_number=run_number,
            root_cause=data.get("root_cause", "ACCEPTABLE"),
            root_cause_explanation=data.get("root_cause_explanation", ""),
            fix_suggestions=data.get("fix_suggestions", []),
        )
        db.add(ev)
        db.flush()

        for score_data in data.get("scores", []):
            ms = MetricScoreModel(
                evaluation_id=ev.id,
                name=score_data.get("name", ""),
                score=score_data.get("score", 0.0),
                threshold=score_data.get("threshold", 0.5),
                passed=score_data.get("passed", False),
                reason=score_data.get("reason", ""),
            )
            db.add(ms)

        bug.evaluation_count = run_number
        db.commit()
        db.refresh(ev)
        return _evaluation_to_dict(ev)

    def get_evaluation(self, db: Session, user_id: uuid.UUID, bug_id: str) -> dict | None:
        bug = _get_bug_owned(db, user_id, bug_id)
        if not bug:
            return None
        ev = (
            db.query(EvaluationModel)
            .filter(EvaluationModel.bug_id == bug.id)
            .order_by(EvaluationModel.run_number.desc())
            .first()
        )
        if not ev:
            return None
        return _evaluation_to_dict(ev)

    def list_evaluations(self, db: Session, user_id: uuid.UUID) -> list[dict]:
        subq = (
            db.query(
                EvaluationModel.bug_id,
                func.max(EvaluationModel.run_number).label("max_run"),
            )
            .join(BugModel, BugModel.id == EvaluationModel.bug_id)
            .filter(BugModel.user_id == user_id)
            .group_by(EvaluationModel.bug_id)
            .subquery()
        )
        evals = (
            db.query(EvaluationModel)
            .join(
                subq,
                (EvaluationModel.bug_id == subq.c.bug_id)
                & (EvaluationModel.run_number == subq.c.max_run),
            )
            .all()
        )
        return [_evaluation_to_dict(ev) for ev in evals]

    def list_evaluations_for_bug(self, db: Session, user_id: uuid.UUID, bug_id: str) -> list[dict]:
        if not _get_bug_owned(db, user_id, bug_id):
            return []
        bid = _parse_bug_id(bug_id)
        if not bid:
            return []
        evals = (
            db.query(EvaluationModel)
            .filter(EvaluationModel.bug_id == bid)
            .order_by(EvaluationModel.run_number.desc())
            .all()
        )
        return [_evaluation_to_dict(ev) for ev in evals]

    # ---- batch ----

    def save_batch(self, db: Session, user_id: uuid.UUID, batch_id: str, data: dict) -> None:
        bid = uuid.UUID(batch_id) if isinstance(batch_id, str) else batch_id
        batch = BatchModel(
            id=bid,
            user_id=user_id,
            total=data.get("total", 0),
            completed=data.get("completed", 0),
            failed=data.get("failed", 0),
        )
        db.add(batch)

        for item in data.get("results", []):
            bi = BatchItemModel(
                batch_id=bid,
                bug_id=item.get("bug_id"),
                item_index=item.get("index", 0),
                error=item.get("error"),
            )
            db.add(bi)
        db.commit()

    def get_batch(self, db: Session, user_id: uuid.UUID, batch_id: str) -> dict | None:
        bid = uuid.UUID(batch_id) if isinstance(batch_id, str) else batch_id
        batch = (
            db.query(BatchModel)
            .filter(BatchModel.id == bid, BatchModel.user_id == user_id)
            .first()
        )
        if not batch:
            return None
        items = (
            db.query(BatchItemModel)
            .filter(BatchItemModel.batch_id == bid)
            .order_by(BatchItemModel.item_index)
            .all()
        )
        return {
            "batch_id": str(batch.id),
            "total": batch.total,
            "completed": batch.completed,
            "failed": batch.failed,
            "results": [
                {
                    "index": it.item_index,
                    "user_question": "",
                    "evaluation": None,
                    "error": it.error,
                }
                for it in items
            ],
        }

    # ---- chunk analysis ----

    def save_chunk_analysis(self, db: Session, user_id: uuid.UUID, bug_id: str, data: dict) -> None:
        if not _get_bug_owned(db, user_id, bug_id):
            raise ValueError("Bug not found")
        bid = uuid.UUID(bug_id) if isinstance(bug_id, str) else bug_id
        ca = ChunkAnalysisModel(
            bug_id=bid,
            chunk_scores=data.get("chunk_scores", []),
            found_ins_ids=data.get("expected_ins_ids_found", []),
            missing_ins_ids=data.get("expected_ins_ids_missing", []),
        )
        db.add(ca)
        db.commit()

    # ---- rephrased questions ----

    def save_rephrased(self, db: Session, user_id: uuid.UUID, bug_id: str | None, data: dict) -> None:
        if bug_id is not None and not _get_bug_owned(db, user_id, bug_id):
            raise ValueError("Bug not found")
        bid = uuid.UUID(bug_id) if bug_id and isinstance(bug_id, str) else bug_id
        existing = (
            db.query(RephrasedQuestionModel)
            .filter(RephrasedQuestionModel.bug_id == bid)
            .first()
        )
        if existing:
            existing.original = data.get("original", "")
            existing.rephrased = data.get("rephrased", [])
        else:
            rq = RephrasedQuestionModel(
                bug_id=bid,
                original=data.get("original", ""),
                rephrased=data.get("rephrased", []),
            )
            db.add(rq)
        db.commit()

    def get_rephrased(self, db: Session, user_id: uuid.UUID, bug_id: str) -> dict | None:
        if not _get_bug_owned(db, user_id, bug_id):
            return None
        bid = uuid.UUID(bug_id) if isinstance(bug_id, str) else bug_id
        rq = (
            db.query(RephrasedQuestionModel)
            .filter(RephrasedQuestionModel.bug_id == bid)
            .order_by(RephrasedQuestionModel.created_at.desc())
            .first()
        )
        if not rq:
            return None
        return {
            "original": rq.original,
            "rephrased": rq.rephrased or [],
        }

    # ---- usage ledger ----

    def add_usage_ledger(
        self,
        db: Session,
        user_id: uuid.UUID,
        operation: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        estimated_cost_usd: float,
        evaluation_id: uuid.UUID | None = None,
    ) -> None:
        row = UsageLedgerModel(
            user_id=user_id,
            evaluation_id=evaluation_id,
            operation=operation,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            estimated_cost_usd=estimated_cost_usd,
        )
        db.add(row)
        db.commit()

    def usage_summary(
        self, db: Session, user_id: uuid.UUID, since=None, limit_rows: int = 100
    ) -> dict[str, Any]:
        q = db.query(UsageLedgerModel).filter(UsageLedgerModel.user_id == user_id)
        if since is not None:
            q = q.filter(UsageLedgerModel.created_at >= since)
        rows = q.order_by(UsageLedgerModel.created_at.desc()).limit(limit_rows).all()
        total_cost = (
            db.query(func.coalesce(func.sum(UsageLedgerModel.estimated_cost_usd), 0.0))
            .filter(UsageLedgerModel.user_id == user_id)
            .scalar()
        )
        if since is not None:
            total_cost_period = (
                db.query(func.coalesce(func.sum(UsageLedgerModel.estimated_cost_usd), 0.0))
                .filter(UsageLedgerModel.user_id == user_id, UsageLedgerModel.created_at >= since)
                .scalar()
            )
        else:
            total_cost_period = total_cost
        total_tokens = (
            db.query(
                func.coalesce(func.sum(UsageLedgerModel.prompt_tokens + UsageLedgerModel.completion_tokens), 0)
            )
            .filter(UsageLedgerModel.user_id == user_id)
            .scalar()
        )
        return {
            "total_estimated_cost_usd": float(total_cost or 0),
            "period_estimated_cost_usd": float(total_cost_period or 0),
            "total_tokens": int(total_tokens or 0),
            "recent": [
                {
                    "id": str(r.id),
                    "operation": r.operation,
                    "model": r.model,
                    "prompt_tokens": r.prompt_tokens,
                    "completion_tokens": r.completion_tokens,
                    "estimated_cost_usd": r.estimated_cost_usd,
                    "created_at": r.created_at.isoformat() if r.created_at else "",
                }
                for r in rows
            ],
        }


store = DatabaseStore()
