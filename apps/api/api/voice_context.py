"""Compact a patient's doctor-released history into voice-agent-ready text.

The voice agent sees ONLY doctor-released summaries — never in-progress
submissions, never raw HPO / ORPHA data, never confidence percentages. This
mirrors the doctor-in-the-loop safety guarantee already established in
patient_history.py.
"""

from __future__ import annotations

import datetime as _dt
import json

from sqlmodel import Session, select

from api.app_models import PatientSubmission

_MAX_CONTEXT_CHARS = 3_000


def _fmt_date(ms: int | None) -> str:
    if not ms:
        return ""
    try:
        return _dt.datetime.fromtimestamp(ms / 1000, tz=_dt.UTC).strftime("%d %b %Y")
    except Exception:
        return ""


def _line_for(submission: PatientSubmission) -> str | None:
    summary: dict = {}
    if submission.patient_summary_json:
        try:
            summary = json.loads(submission.patient_summary_json) or {}
        except json.JSONDecodeError:
            summary = {}
    headline = str(summary.get("headline") or "Doctor guidance").strip()
    body = str(summary.get("recommended_next_step") or summary.get("body") or "").strip()
    safety = str(summary.get("safety_note") or "").strip()
    date = _fmt_date(submission.release_timestamp or submission.updated_at)
    if not headline and not body:
        return None
    line = f"{date}: {headline}"
    if body:
        line += f" — {body}"
    if safety:
        line += f" [safety: {safety}]"
    return line


def build_patient_voice_context(session: Session, patient_owner_id: str) -> dict:
    """Return the compact context dict the voice agent's system prompt inlines."""
    rows = session.exec(
        select(PatientSubmission)
        .where(PatientSubmission.patient_owner_id == patient_owner_id)
        .where(PatientSubmission.status == "released_to_patient")
        .order_by(PatientSubmission.release_timestamp.asc())
    ).all()

    name: str | None = None
    age: str | None = None
    sex: str | None = None
    lines: list[str] = []
    total = 0
    for row in rows:
        # Latest non-empty demographic wins.
        name = row.patient_name or name
        age = row.age or age
        sex = row.sex or sex
        line = _line_for(row)
        if not line:
            continue
        # Enforce the 3,000-char cap across all lines combined.
        if total + len(line) + 1 > _MAX_CONTEXT_CHARS:
            break
        lines.append(line)
        total += len(line) + 1

    compact = (
        "\n".join(f"- {line}" for line in lines)
        if lines
        else "(No doctor-released history on file yet.)"
    )
    return {
        "patient_name": name,
        "age": age,
        "sex": sex,
        "history_lines": lines,
        "compact_summary": compact,
    }
