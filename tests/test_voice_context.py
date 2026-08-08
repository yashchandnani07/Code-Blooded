"""voice_context: compaction respects released-only filter and 3k cap."""

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


def _session_with(rows):
    class FakeExec:
        def __init__(self, items):
            self._items = items

        def all(self):
            return list(self._items)

    class FakeSession:
        def __init__(self, items):
            self._items = items

        def exec(self, _statement):
            return FakeExec(self._items)

    return FakeSession(rows)


def test_ignores_non_released_submissions():
    from api.voice_context import build_patient_voice_context

    ctx = build_patient_voice_context(_session_with([]), "p1")
    # A patient with zero released rows falls back to the empty-history string.
    assert "No doctor-released history" in ctx["compact_summary"]
    assert ctx["history_lines"] == []


def test_line_format_with_all_fields():
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
                "recommended_next_step": "Please book a routine specialist appointment.",
                "safety_note": "Seek urgent care if symptoms worsen suddenly.",
            }
        ),
    )
    ctx = build_patient_voice_context(_session_with([row]), "p1")
    assert ctx["patient_name"] == "Swati"
    assert ctx["age"] == "34"
    assert ctx["sex"] == "F"
    assert len(ctx["history_lines"]) == 1
    line = ctx["history_lines"][0]
    assert "Routine specialist review" in line
    assert "book a routine specialist appointment" in line
    assert "[safety: Seek urgent care if symptoms worsen suddenly.]" in line


def test_cap_enforced_at_3000_chars():
    from api.voice_context import build_patient_voice_context

    # Build 200 released rows, each ~50 chars — total would blow past 3k
    long_body = "recommended action item text " * 3
    rows = [
        _stub_submission(
            id=f"s{i}",
            release_timestamp=1700000000000 + i,
            patient_summary_json=json.dumps(
                {"headline": f"Report {i}", "recommended_next_step": long_body}
            ),
        )
        for i in range(200)
    ]
    ctx = build_patient_voice_context(_session_with(rows), "p1")
    assert len(ctx["compact_summary"]) <= 3_100  # small overhead for prefix/newlines
    assert len(ctx["history_lines"]) < 200  # capped short
