from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, cast
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import BugModel, EvaluationModel, MetricScoreModel, UserModel
from app.schemas import (
    AnalyticsOverview,
    AnalyticsTrends,
    RootCauseCount,
    TrendPoint,
)

# Paths use /stats/* not /analytics/* — browser ad blockers often block "analytics" URLs (ERR_BLOCKED_BY_CLIENT).
router = APIRouter(tags=["stats"])


def _latest_eval_subquery(db: Session, user_id):
    """Subquery that selects the latest run_number per bug_id for this user's bugs."""
    return (
        db.query(
            EvaluationModel.bug_id,
            func.max(EvaluationModel.run_number).label("max_run"),
        )
        .join(BugModel, BugModel.id == EvaluationModel.bug_id)
        .filter(BugModel.user_id == user_id)
        .group_by(EvaluationModel.bug_id)
        .subquery()
    )


@router.get("/stats/overview", response_model=AnalyticsOverview)
def overview(db: Session = Depends(get_db), user: UserModel = Depends(get_current_user)):
    uid = user.id
    total = db.query(func.count(BugModel.id)).filter(BugModel.user_id == uid).scalar() or 0
    open_count = (
        db.query(func.count(BugModel.id))
        .filter(BugModel.user_id == uid, BugModel.status == "open")
        .scalar()
        or 0
    )
    resolved_count = (
        db.query(func.count(BugModel.id))
        .filter(BugModel.user_id == uid, BugModel.status == "resolved")
        .scalar()
        or 0
    )
    invalid_count = (
        db.query(func.count(BugModel.id))
        .filter(BugModel.user_id == uid, BugModel.status == "invalid")
        .scalar()
        or 0
    )

    latest = _latest_eval_subquery(db, uid)
    latest_evals = (
        db.query(EvaluationModel)
        .join(
            latest,
            (EvaluationModel.bug_id == latest.c.bug_id)
            & (EvaluationModel.run_number == latest.c.max_run),
        )
        .all()
    )
    latest_eval_ids = [ev.id for ev in latest_evals]

    def _avg_metric(name: str) -> float | None:
        if not latest_eval_ids:
            return None
        result = (
            db.query(func.avg(MetricScoreModel.score))
            .filter(
                MetricScoreModel.evaluation_id.in_(latest_eval_ids),
                MetricScoreModel.name == name,
            )
            .scalar()
        )
        return round(result, 4) if result is not None else None

    root_causes = [ev.root_cause for ev in latest_evals if ev.root_cause]
    most_common = None
    if root_causes:
        mc = Counter(root_causes).most_common(1)
        most_common = mc[0][0] if mc else None

    return AnalyticsOverview(
        total_bugs=total,
        open_bugs=open_count,
        resolved_bugs=resolved_count,
        invalid_bugs=invalid_count,
        avg_faithfulness=_avg_metric("Faithfulness"),
        avg_answer_relevancy=_avg_metric("AnswerRelevancy"),
        avg_contextual_relevancy=_avg_metric("ContextualRelevancy"),
        most_common_root_cause=most_common,
    )


@router.get("/stats/root-causes", response_model=list[RootCauseCount])
def root_cause_distribution(
    db: Session = Depends(get_db), user: UserModel = Depends(get_current_user)
):
    uid = user.id
    latest = _latest_eval_subquery(db, uid)
    rows = (
        db.query(EvaluationModel.root_cause, func.count(EvaluationModel.id))
        .join(
            latest,
            (EvaluationModel.bug_id == latest.c.bug_id)
            & (EvaluationModel.run_number == latest.c.max_run),
        )
        .group_by(EvaluationModel.root_cause)
        .order_by(func.count(EvaluationModel.id).desc())
        .all()
    )
    return [RootCauseCount(root_cause=rc or "UNKNOWN", count=cnt) for rc, cnt in rows]


@router.get("/stats/trends", response_model=AnalyticsTrends)
def trends(db: Session = Depends(get_db), user: UserModel = Depends(get_current_user)):
    uid = user.id
    date_col = func.date(BugModel.created_at)
    rows = (
        db.query(date_col.label("d"), func.count(BugModel.id).label("c"))
        .filter(BugModel.user_id == uid)
        .group_by(date_col)
        .order_by(date_col)
        .all()
    )
    points = [TrendPoint(date=str(d), count=c) for d, c in rows if d is not None]
    return AnalyticsTrends(points=points)


@router.get("/stats/faithfulness-trend")
def faithfulness_trend(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    uid = user.id
    rows = (
        db.query(
            MetricScoreModel.score,
            EvaluationModel.evaluated_at,
            EvaluationModel.bug_id,
        )
        .join(EvaluationModel, MetricScoreModel.evaluation_id == EvaluationModel.id)
        .join(BugModel, BugModel.id == EvaluationModel.bug_id)
        .filter(BugModel.user_id == uid, MetricScoreModel.name == "Faithfulness")
        .order_by(EvaluationModel.evaluated_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "score": round(score, 4),
            "date": evaluated_at.isoformat() if evaluated_at else "",
            "bug_id": str(bug_id),
        }
        for score, evaluated_at, bug_id in reversed(rows)
    ]


@router.get("/stats/top-ins-ids")
def top_ins_ids(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    from sqlalchemy.dialects.postgresql import JSONB

    uid = user.id
    ins_id_element = func.jsonb_array_elements_text(cast(BugModel.ins_ids, JSONB)).label("ins_id")

    subq = (
        db.query(ins_id_element, BugModel.id.label("bug_id"))
        .filter(BugModel.user_id == uid, BugModel.ins_ids.isnot(None))
        .subquery()
    )

    rows = (
        db.query(subq.c.ins_id, func.count(func.distinct(subq.c.bug_id)).label("bug_count"))
        .group_by(subq.c.ins_id)
        .order_by(func.count(func.distinct(subq.c.bug_id)).desc())
        .limit(limit)
        .all()
    )
    return [{"ins_id": ins_id, "bug_count": count} for ins_id, count in rows]


@router.get("/stats/scores-by-module")
def scores_by_module(db: Session = Depends(get_db), user: UserModel = Depends(get_current_user)):
    uid = user.id
    latest = _latest_eval_subquery(db, uid)

    rows = (
        db.query(
            BugModel.module_name,
            MetricScoreModel.name,
            func.avg(MetricScoreModel.score).label("avg_score"),
        )
        .join(EvaluationModel, EvaluationModel.bug_id == BugModel.id)
        .join(
            latest,
            (EvaluationModel.bug_id == latest.c.bug_id)
            & (EvaluationModel.run_number == latest.c.max_run),
        )
        .join(MetricScoreModel, MetricScoreModel.evaluation_id == EvaluationModel.id)
        .filter(BugModel.user_id == uid)
        .group_by(BugModel.module_name, MetricScoreModel.name)
        .all()
    )

    modules: dict[str, dict[str, float]] = {}
    for module, metric_name, avg_score in rows:
        mod_key = module or "Unknown"
        if mod_key not in modules:
            modules[mod_key] = {"module": mod_key}
        modules[mod_key][metric_name] = round(float(avg_score) * 100, 1) if avg_score else 0

    return list(modules.values())
