"""Lenient parser for retrieved chunks: handles strict JSON, wrapped JSON,
truncated JSON, and plain text. Also extracts INS IDs from any text."""

from __future__ import annotations

import json
import re
from typing import Any

from app.config import settings
from app.schemas import RetrievedChunk

INS_ID_PATTERN = re.compile(settings.ins_id_pattern, re.IGNORECASE)


def extract_ins_ids(text: str) -> list[str]:
    """Pull all unique INS IDs (e.g. INS92247) from arbitrary text."""
    matches = INS_ID_PATTERN.findall(text)
    seen: set[str] = set()
    result: list[str] = []
    for m in matches:
        upper = m.upper()
        if upper not in seen:
            seen.add(upper)
            result.append(upper)
    return result


def _try_parse_json(raw: str) -> Any | None:
    """Try parsing raw text as JSON, with several recovery strategies."""
    text = raw.strip()
    if not text:
        return None

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Bare key-value pair like  "output": "{...}"  → wrap in { } to make valid JSON
    if text.startswith('"') and not text.startswith('{') and not text.startswith('['):
        try:
            return json.loads('{' + text + '}')
        except json.JSONDecodeError:
            pass

    if '\\"' in text:
        try:
            unescaped = text.replace('\\"', '"')
            return json.loads(unescaped)
        except json.JSONDecodeError:
            pass

    for suffix in ["]}", "]}]}", "]", "}", "]}]}]", '"}]}]', '"}]}']:
        try:
            return json.loads(text + suffix)
        except json.JSONDecodeError:
            continue

    for start_char, end_char in [("[", "]"), ("{", "}")]:
        start = text.find(start_char)
        if start == -1:
            continue
        depth = 0
        best_end = -1
        for i in range(start, len(text)):
            if text[i] == start_char:
                depth += 1
            elif text[i] == end_char:
                depth -= 1
                if depth == 0:
                    best_end = i
                    break
        if best_end > start:
            try:
                return json.loads(text[start : best_end + 1])
            except json.JSONDecodeError:
                pass

    return None


def parse_chunks_text(raw: str) -> tuple[list[RetrievedChunk], str]:
    """Parse raw text into structured chunks. Returns (chunks, parse_status).

    parse_status is one of:
      - "json_ok"       : clean JSON parsed successfully
      - "json_unwrapped" : JSON had a wrapper like {"status":"success","data":[...]}
      - "json_repaired"  : JSON was truncated/escaped but we recovered it
      - "raw_text"       : could not parse JSON, stored as raw text only
      - "empty"          : no input provided
    """
    text = raw.strip()
    if not text:
        return [], "empty"

    parsed = _try_parse_json(text)

    if parsed is None:
        return [], "raw_text"

    status = "json_ok"
    data = parsed

    # Unwrap string-valued keys like {"output": "{\"status\":\"success\",\"data\":[...]}"}
    if isinstance(data, dict):
        for key in ("output", "response", "result", "body"):
            val = data.get(key)
            if isinstance(val, str) and val.strip().startswith(("{", "[")):
                inner = _try_parse_json(val)
                if inner is not None:
                    data = inner
                    status = "json_unwrapped"
                    break

    if isinstance(data, dict):
        for key in ("data", "results", "chunks", "items", "documents"):
            if key in data and isinstance(data[key], list):
                data = data[key]
                status = "json_unwrapped"
                break
        else:
            data = [data]

    if not isinstance(data, list):
        data = [data]

    try:
        direct = json.loads(text)
    except Exception:
        if status == "json_ok":
            status = "json_repaired"

    chunks: list[RetrievedChunk] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            chunks.append(RetrievedChunk(**item))
        except Exception:
            if "id" in item:
                try:
                    chunks.append(RetrievedChunk(id=str(item["id"])))
                except Exception:
                    pass

    if not chunks and parsed is not None:
        status = "raw_text"

    return chunks, status
