from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import settings
from app.db.database import get_db
from app.db.models import UserModel
from app.schemas import BugCreate, BugReport, BugStatus, BugStatusUpdate, BugUpdate
from app.services.chunk_parser import extract_ins_ids, parse_chunks_text
from app.store import store

router = APIRouter(tags=["bugs"])


@router.get("/settings")
def get_settings():
    return {"auto_evaluate": settings.auto_evaluate}


def _build_minimal_chunks(ins_ids: list[str], raw_text: str) -> list:
    """Build minimal RetrievedChunk objects from INS IDs when full JSON parsing fails."""
    from app.schemas import RetrievedChunk, ChunkMetadata, ChunkContent
    import re

    chunks = []
    raw_upper = raw_text.upper()
    for ins_id in ins_ids:
        pos = raw_upper.find(ins_id.upper())
        if pos == -1:
            chunks.append(RetrievedChunk(id=ins_id))
            continue

        start = max(0, pos - 200)
        end = min(len(raw_text), pos + len(ins_id) + 2000)
        snippet = raw_text[start:end].strip()

        title_match = re.search(
            r'"title"\s*:\s*"([^"]*)"',
            raw_text[max(0, pos - 500) : min(len(raw_text), pos + 3000)],
        )
        title = title_match.group(1) if title_match else ""

        chunks.append(
            RetrievedChunk(
                id=ins_id,
                metadata=ChunkMetadata(
                    title=title,
                    encrypted_regulation_id=ins_id,
                    reference_insight_id=ins_id,
                    chunks=[ChunkContent(content=[snippet])],
                ),
            )
        )
    return chunks


def create_bug_for_user(db: Session, user_id: uuid.UUID, body: BugCreate) -> dict:
    """Create a bug for a user; returns bug dict (same shape as BugReport)."""
    bug_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    chunks = body.retrieved_chunks
    if not chunks and body.retrieved_chunks_raw:
        parsed_chunks, _ = parse_chunks_text(body.retrieved_chunks_raw)
        chunks = parsed_chunks

    all_ids: list[str] = list(body.ins_ids) if body.ins_ids else []
    if chunks:
        all_ids.extend(c.id for c in chunks)
    if body.retrieved_chunks_raw:
        all_ids.extend(extract_ins_ids(body.retrieved_chunks_raw))
    ins_ids = list(dict.fromkeys(id for id in all_ids if id))

    if not chunks and ins_ids and body.retrieved_chunks_raw:
        chunks = _build_minimal_chunks(ins_ids, body.retrieved_chunks_raw)

    chunks_serializable = [c.model_dump() for c in chunks] if chunks else []

    bug_data = {
        "id": bug_id,
        "user_question": body.user_question,
        "expected_answer": body.expected_answer,
        "actual_answer": body.actual_answer,
        "ins_ids": ins_ids,
        "expected_ins_ids": body.expected_ins_ids,
        "module_name": body.module_name,
        "priority": body.priority.value if hasattr(body.priority, "value") else body.priority,
        "status": BugStatus.OPEN.value,
        "retrieved_chunks": chunks_serializable,
        "retrieved_chunks_raw": body.retrieved_chunks_raw,
        "evaluation_count": 0,
        "created_at": now,
        "has_evaluation": False,
    }
    store.save_bug(db, bug_id, bug_data, user_id)
    out = store.get_bug(db, user_id, bug_id)
    if not out:
        raise HTTPException(500, "Failed to create bug")
    return out


@router.post("/bugs", response_model=BugReport)
def create_bug(
    body: BugCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    return create_bug_for_user(db, user.id, body)


@router.get("/bugs", response_model=list[BugReport])
def list_bugs(
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    return store.list_bugs(db, user.id, status)


@router.get("/bugs/{bug_id}", response_model=BugReport)
def get_bug(
    bug_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    data = store.get_bug(db, user.id, bug_id)
    if not data:
        raise HTTPException(404, "Bug not found")
    return data


@router.put("/bugs/{bug_id}", response_model=BugReport)
def update_bug(
    bug_id: str,
    body: BugUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    updates = body.model_dump(exclude_none=True)

    merged_ids: list[str] = list(updates.get("ins_ids", []))

    raw = updates.get("retrieved_chunks_raw", "")
    if raw:
        parsed_chunks, _ = parse_chunks_text(raw)
        if parsed_chunks:
            updates["retrieved_chunks"] = [c.model_dump() for c in parsed_chunks]
            merged_ids.extend(c.id for c in parsed_chunks)
        merged_ids.extend(extract_ins_ids(raw))

    if merged_ids:
        unique_ids = list(dict.fromkeys(id for id in merged_ids if id))
        updates["ins_ids"] = unique_ids
        if "retrieved_chunks" not in updates and raw:
            minimal = _build_minimal_chunks(unique_ids, raw)
            if minimal:
                updates["retrieved_chunks"] = [c.model_dump() for c in minimal]

    if not store.update_bug(db, user.id, bug_id, updates):
        raise HTTPException(404, "Bug not found")
    return store.get_bug(db, user.id, bug_id)


@router.put("/bugs/{bug_id}/status", response_model=BugReport)
def update_bug_status(
    bug_id: str,
    body: BugStatusUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    if not store.update_bug_status(db, user.id, bug_id, body.status.value):
        raise HTTPException(404, "Bug not found")
    return store.get_bug(db, user.id, bug_id)


@router.delete("/bugs/{bug_id}")
def delete_bug(
    bug_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    if not store.delete_bug(db, user.id, bug_id):
        raise HTTPException(404, "Bug not found")
    return {"deleted": True}
