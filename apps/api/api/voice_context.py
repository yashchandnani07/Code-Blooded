"""Compact a patient's doctor-released history into a short prose summary
for the voice agent's system prompt.

The voice agent sees ONLY doctor-released summaries — never in-progress
submissions, never raw HPO / ORPHA data, never confidence percentages. This
mirrors the doctor-in-the-loop safety guarantee already established in
patient_history.py.

Kept deliberately simple: a live voice model does best with a short block of
plain prose, not a heavily bracketed/structured dump. Prefer the Groq-written
narrative (PatientHistorySummary) when one exists; otherwise stitch a brief
paragraph from the patient's released submissions.
"""

from __future__ import annotations

from sqlmodel import Session, select

from api.app_models import PatientHistorySummary, PatientSubmission

_MAX_CONTEXT_CHARS = 1_200  # a few short paragraphs, not a document


def build_patient_voice_context(session: Session, patient_owner_id: str) -> dict:
    """Return {patient_name, age, sex, compact_summary} for the voice system prompt."""
    rows = session.exec(
        select(PatientSubmission)
        .where(PatientSubmission.patient_owner_id == patient_owner_id)
        .where(PatientSubmission.status == "released_to_patient")
        .order_by(PatientSubmission.release_timestamp.asc())
    ).all()

    name: str | None = None
    age: str | None = None
    sex: str | None = None
    for row in rows:
        # Latest non-empty demographic wins.
        name = row.patient_name or name
        age = row.age or age
        sex = row.sex or sex

    narrative = session.exec(
        select(PatientHistorySummary).where(
            PatientHistorySummary.patient_owner_id == patient_owner_id
        )
    ).first()

    if narrative and narrative.summary_markdown:
        # Already doctor-vetted prose — just strip markdown headers.
        prose = narrative.summary_markdown.replace("## ", "").replace("# ", "").strip()
        compact = prose[:_MAX_CONTEXT_CHARS]
    elif rows:
        compact = _fallback_paragraph(rows)[:_MAX_CONTEXT_CHARS]
    else:
        compact = "No prior doctor-released history is on file for this patient yet."

    return {
        "patient_name": name,
        "age": age,
        "sex": sex,
        "compact_summary": compact,
    }


def _fallback_paragraph(rows: list[PatientSubmission]) -> str:
    """One or two plain sentences per visit, joined into flowing prose."""
    import json as _json

    sentences: list[str] = []
    for row in rows:
        summary: dict = {}
        if row.patient_summary_json:
            try:
                summary = _json.loads(row.patient_summary_json) or {}
            except _json.JSONDecodeError:
                summary = {}

        headline = str(summary.get("headline") or "").strip()
        body = str(summary.get("recommended_next_step") or summary.get("body") or "").strip()
        notes = str(row.notes or "").strip()

        if headline and body:
            sentences.append(f"{headline}. {body}")
        elif body:
            sentences.append(body)
        elif headline:
            sentences.append(headline)
        elif notes:
            sentences.append(f"Reported: {notes[:150]}")

    if not sentences:
        return "No detailed history is on file for this patient yet."
    return " ".join(sentences)
