"""voice_context: builds a short prose summary, respects the released-only
filter, prefers the Groq narrative when one exists, and caps length."""

import json


def _stub_submission(**kwargs):
    from api.app_models import PatientSubmission

    defaults = dict(
        id=kwargs.pop("id", "sub"),
        timestamp=kwargs.pop("timestamp", 1000),
        updated_at=kwargs.pop("updated_at", 1000),
        patient_owner_id=kwargs.pop("patient_owner_id", "p1"),
        status=kwargs.pop("status", "released_to_patient"),
    )
    defaults.update(kwargs)
    return PatientSubmission(**defaults)


class _FakeExec:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)

    def first(self):
        return self._items[0] if self._items else None


class _FakeSession:
    """Returns `submissions` for the PatientSubmission query and `narrative`
    (or None) for the PatientHistorySummary query, based on call order —
    build_patient_voice_context always queries submissions first."""

    def __init__(self, submissions, narrative=None):
        self._calls = [submissions, [narrative] if narrative else []]

    def exec(self, _statement):
        return _FakeExec(self._calls.pop(0))


def test_no_released_submissions_and_no_narrative():
    from api.voice_context import build_patient_voice_context

    ctx = build_patient_voice_context(_FakeSession([]), "p1")
    assert "No prior doctor-released history" in ctx["compact_summary"]
    assert ctx["patient_name"] is None


def test_falls_back_to_submission_prose_when_no_narrative():
    from api.voice_context import build_patient_voice_context

    row = _stub_submission(
        id="a",
        patient_name="Swati",
        age="34",
        sex="F",
        release_timestamp=1700000000000,
        patient_summary_json=json.dumps(
            {
                "headline": "Routine specialist review",
                "recommended_next_step": "Book a routine specialist appointment.",
            }
        ),
    )
    ctx = build_patient_voice_context(_FakeSession([row]), "p1")
    assert ctx["patient_name"] == "Swati"
    assert ctx["age"] == "34"
    assert ctx["sex"] == "F"
    assert "Routine specialist review" in ctx["compact_summary"]
    assert "Book a routine specialist appointment" in ctx["compact_summary"]


def test_prefers_groq_narrative_over_submission_prose():
    from api.app_models import PatientHistorySummary
    from api.voice_context import build_patient_voice_context

    row = _stub_submission(
        id="a",
        patient_summary_json=json.dumps({"headline": "Should not appear"}),
    )
    narrative = PatientHistorySummary(
        id="n1",
        patient_owner_id="p1",
        summary_markdown="## Summary\nPatient has a history of migraines, well managed.",
        source_case_ids_json="[]",
        generated_at=1700000000000,
    )
    ctx = build_patient_voice_context(_FakeSession([row], narrative=narrative), "p1")
    assert "history of migraines" in ctx["compact_summary"]
    assert "Should not appear" not in ctx["compact_summary"]
    # Markdown heading markers are stripped so it reads as plain prose.
    assert "##" not in ctx["compact_summary"]


def test_summary_capped_short():
    from api.voice_context import build_patient_voice_context, _MAX_CONTEXT_CHARS

    long_body = "recommended action item text " * 100  # way over the cap
    row = _stub_submission(
        id="a",
        release_timestamp=1700000000000,
        patient_summary_json=json.dumps({"headline": "Report", "body": long_body}),
    )
    ctx = build_patient_voice_context(_FakeSession([row]), "p1")
    assert len(ctx["compact_summary"]) <= _MAX_CONTEXT_CHARS
