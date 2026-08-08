"""Compact a patient's doctor-released history into voice-agent-ready text.

The voice agent sees ONLY doctor-released summaries — never in-progress
submissions, never raw HPO / ORPHA data, never confidence percentages. This
mirrors the doctor-in-the-loop safety guarantee already established in
patient_history.py.

Priority order for the compact_summary field:
  1. PatientHistorySummary.summary_markdown  – Groq-generated narrative; richest.
  2. Per-submission bullet lines              – fallback when no narrative yet.
"""

from __future__ import annotations

import datetime as _dt
import json

from sqlmodel import Session, select

from api.app_models import PatientHistorySummary, PatientSubmission

_MAX_CONTEXT_CHARS = 3_000


def _fmt_date(ms: int | None) -> str:
    if not ms:
        return ""
    try:
        return _dt.datetime.fromtimestamp(ms / 1000, tz=_dt.UTC).strftime("%d %b %Y")
    except Exception:
        return ""


def _line_for(submission: PatientSubmission) -> str | None:
    """Build a single summary line for one released submission."""
    summary: dict = {}
    if submission.patient_summary_json:
        try:
            summary = json.loads(submission.patient_summary_json) or {}
        except json.JSONDecodeError:
            summary = {}

    headline = str(summary.get("headline") or "").strip()
    body = str(summary.get("recommended_next_step") or summary.get("body") or "").strip()
    safety = str(summary.get("safety_note") or "").strip()

    # Patient's own symptom notes and doctor's visit recommendation
    patient_notes = str(submission.notes or "").strip()
    visit_rec = str(submission.visit_recommendation or "").strip()

    date = _fmt_date(submission.release_timestamp or submission.updated_at)

    # Need at least something to say
    if not headline and not body and not patient_notes:
        return None

    # Lead with headline (or fall back to symptom note)
    line = f"{date}: {headline or 'Patient report'}"
    if patient_notes and not body:
        # No doctor body text — show the patient's own description (trimmed)
        short_note = patient_notes[:200].replace("\n", " ")
        line += f" — symptoms: {short_note}"
    elif body:
        line += f" — {body}"
    if visit_rec:
        line += f" [recommendation: {visit_rec}]"
    if safety:
        line += f" [safety: {safety}]"
    return line


def build_patient_voice_context(session: Session, patient_owner_id: str) -> dict:
    """Return the compact context dict the voice agent's system prompt inlines.

    Priority:
      1. PatientHistorySummary.summary_markdown — Groq narrative (richest).
      2. Per-submission bullet lines — fallback when no narrative exists yet.
    """
    # ── 1. Demographics + per-submission lines ─────────────────────────────
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
        if total + len(line) + 1 > _MAX_CONTEXT_CHARS:
            break
        lines.append(line)
        total += len(line) + 1

    # ── 2. Prefer the Groq narrative when available ────────────────────────
    narrative = session.exec(
        select(PatientHistorySummary).where(
            PatientHistorySummary.patient_owner_id == patient_owner_id
        )
    ).first()

    if narrative and narrative.summary_markdown:
        # Strip markdown headings so the LLM reads it as plain prose.
        prose = narrative.summary_markdown.replace("## ", "").replace("# ", "")
        compact = prose[:_MAX_CONTEXT_CHARS]
    elif lines:
        compact = "\n".join(f"- {line}" for line in lines)
    else:
        compact = "(No doctor-released history on file yet.)"

    return {
        "patient_name": name,
        "age": age,
        "sex": sex,
        "history_lines": lines,
        "compact_summary": compact,
    }