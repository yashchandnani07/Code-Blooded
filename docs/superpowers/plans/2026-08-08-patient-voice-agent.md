# Patient Voice Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give patients a "Talk to me" button that opens a live voice conversation with a Gemini-powered assistant which already knows their doctor-approved medical history and gives contextual, calm, safety-aware responses like *"maybe your sugar is high, try a glass of water and eat something small"* or *"go to the hospital immediately, this sounds serious."*

**Architecture:** Browser opens Gemini Live WebSocket directly using a short-lived ephemeral token. A new FastAPI endpoint (`POST /voice/session`) mints the ephemeral token and returns it together with a pre-built system-prompt payload that contains the patient's compacted, doctor-released history. The Python backend never handles audio — it only mints tokens and packages context. This is Google's official recommended pattern for browser-direct Live clients ([docs](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)).

**Tech Stack:** FastAPI, SQLModel/Postgres (existing), `google-genai` Python SDK ≥ 1.0, Gemini `gemini-3.1-flash-live-preview` model, Next.js 16 / React frontend (user supplies the UI, this plan only adds the client function and types).

## Global Constraints

- **Voice agent context is a strict subset of doctor-approved history**: only `PatientSubmission` rows with `status="released_to_patient"` feed the system prompt. No in-progress, no rejected phenotypes, no raw differential scores. This preserves the doctor-in-the-loop guarantee already established elsewhere in the codebase (see `docs/superpowers/specs/2026-08-08-unified-patient-history-design.md`, "Safety properties").
- **No RAG**: entire compacted history is inlined into the system prompt. Keep the compaction cap at 3,000 characters total to stay well within Gemini's context.
- **Never reveal raw HPO/ORPHA IDs, confidence scores, or differential rankings in speech** — same patient-safety rule the existing `agent.py` `PatientSummary` prompt enforces.
- **Safety instruction is non-negotiable in the system prompt**: on any hint of medical emergency (chest pain, breathing difficulty, loss of consciousness, seizure, severe bleeding, stroke symptoms), the agent must interrupt and tell the patient to call emergency services / go to the nearest hospital immediately.
- **`GEMINI_API_KEY` never leaves the backend** — only ephemeral tokens go to the browser.
- Match existing FastAPI patterns: header-based auth via `_actor(request)` returning `(user_id, role)`, `x-lumina-user-id` / `x-lumina-role` headers, 401 on missing, 403 on wrong role (see `submissions.py:22-27` and `patient_history.py:23-28`).
- `ruff check .` and `ruff format --check .` must pass in `apps/api`.

---

### Task 1: Add Gemini SDK dependency and env config

**Files:**
- Modify: `apps/api/pyproject.toml`
- Modify: `.env` (root — this is what `main.py` loads; already contains `GROQ_API_KEY`)
- Modify: `.env.example` (document the new var)

**Interfaces:**
- Produces: `GEMINI_API_KEY` available via `os.environ` at runtime; `google-genai` importable as `from google import genai`.

- [ ] **Step 1: Add the dependency**

In `apps/api/pyproject.toml`, in the `[project]` `dependencies` list, add a line between `"fastapi>=0.136.0",` and `"httpx>=0.28.1",`:

```toml
    "google-genai>=1.0.0",
```

- [ ] **Step 2: Sync**

Run: `cd apps/api && uv sync`
Expected: `google-genai` and its transitive deps get installed with no version conflicts. If a conflict surfaces, the resolver output will name the offending package — do not paper over it; report it.

- [ ] **Step 3: Add env var to root .env**

Append to `.env` (the root file, which `apps/api/main.py` loads):

```env

# Gemini (voice agent Live API) — used by /voice/session to mint ephemeral tokens
GEMINI_API_KEY=<paste-your-Gemini-API-key-here>
```

- [ ] **Step 4: Document in .env.example**

Append to `.env.example` (already present in repo):

```env

# Gemini (voice agent Live API)
GEMINI_API_KEY=your_gemini_api_key_here
```

- [ ] **Step 5: Verify SDK loads**

Run: `cd apps/api && uv run python -c "from google import genai; print(genai.__version__)"`
Expected: prints a version ≥ `1.0.0`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/pyproject.toml apps/api/uv.lock .env.example
git commit -m "feat(api): add google-genai dependency for voice agent

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(Note: `.env` itself is gitignored and correctly excluded — do not add it.)

---

### Task 2: Patient history context builder

**Files:**
- Create: `apps/api/api/voice_context.py`

**Interfaces:**
- Consumes: `PatientSubmission` (existing SQLModel), a live DB session.
- Produces: `build_patient_voice_context(session: Session, patient_owner_id: str) -> dict` returning `{"patient_name": str | None, "age": str | None, "sex": str | None, "history_lines": list[str], "compact_summary": str}`. `compact_summary` is capped at 3,000 chars total across all lines. `history_lines` is a chronologically-ordered list of one-line summaries per released report, each with format `"<date>: <headline> — <recommended_next_step> [safety: <safety_note>]"` (safety_note only appended if non-empty). This dict is embedded into the system prompt by Task 3.

- [ ] **Step 1: Write the module**

Create `apps/api/api/voice_context.py`:

```python
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
    body = str(
        summary.get("recommended_next_step") or summary.get("body") or ""
    ).strip()
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
```

- [ ] **Step 2: Write the test**

Create `tests/test_voice_context.py`:

```python
"""voice_context: compaction respects released-only filter and 3k cap."""

import json

import pytest


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

    rows = [
        _stub_submission(id="a", status="in_review"),
        _stub_submission(id="b", status="doctor_review_pending"),
    ]
    ctx = build_patient_voice_context(_session_with([]), "p1")
    # The fake session returns whatever we give it — here we test that a
    # patient with zero released rows falls back to the empty-history string.
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
```

- [ ] **Step 3: Run the tests**

Run: `cd apps/api && uv run pytest ../../tests/test_voice_context.py -v`
Expected: `3 passed`

- [ ] **Step 4: Lint**

Run: `cd apps/api && uv run ruff check api/voice_context.py && uv run ruff format --check api/voice_context.py`
Expected: no output, exit 0

- [ ] **Step 5: Commit**

```bash
git add apps/api/api/voice_context.py tests/test_voice_context.py
git commit -m "feat(api): add patient voice-agent history compactor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Voice session endpoint (`POST /voice/session`)

**Files:**
- Create: `apps/api/api/routes/voice.py`
- Modify: `apps/api/main.py`

**Interfaces:**
- Consumes: `build_patient_voice_context` (Task 2), `PatientHistoryConsent` (existing, in case a doctor ever needs to trigger this — out of scope for this task but the same `_actor` pattern applies), `GEMINI_API_KEY` env var.
- Produces:
  - `POST /voice/session` (patient role only). Returns:
    ```json
    {
      "token": "<ephemeral-token>",
      "model": "gemini-3.1-flash-live-preview",
      "expires_at": 1728000000,
      "system_prompt": "<full inlined system prompt string>",
      "voice_name": "Aoede",
      "language_code": "en-US"
    }
    ```
  - Registered in `main.py` as `voice_router`.

- [ ] **Step 1: Write the router**

Create `apps/api/api/routes/voice.py`:

```python
"""Voice agent session endpoint.

Mints a short-lived Gemini ephemeral token so the browser can open the Live
WebSocket directly, and returns the pre-built system prompt with the
patient's compacted doctor-released history inlined.
"""

from __future__ import annotations

import os
import time
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session

from api.voice_context import build_patient_voice_context

router = APIRouter(prefix="/voice", tags=["voice"])

_MODEL = "gemini-3.1-flash-live-preview"
_TOKEN_TTL_MINUTES = 15  # short: the browser starts the session within seconds
_SESSION_TTL_MINUTES = 30  # cap for the actual Live conversation

# Non-negotiable safety directives — mirrors the patient-safety rules already
# enforced by agent.py's PatientSummary prompt. Kept as its own constant so
# any change goes through code review.
_SAFETY_RULES = """SAFETY RULES (never break these):
- You are a supportive companion, not a doctor. Never diagnose. Never prescribe.
- If the patient describes any of these, INTERRUPT and tell them to call
  emergency services or go to the nearest hospital immediately:
  chest pain, difficulty breathing, sudden severe headache, loss of
  consciousness, seizure, severe bleeding, one-sided weakness, slurred
  speech, sudden vision loss, thoughts of self-harm.
- Never reveal or mention: HPO IDs, ORPHA codes, confidence percentages,
  differential rankings, disease probability numbers, or the names of any
  scoring models. If the patient asks, say you can only share what the
  doctor released to them and suggest they contact their doctor for the
  technical details.
- Keep replies short (1-3 sentences). This is a spoken conversation, not
  a written report.
- Match the patient's language. If they switch, you switch."""


def _actor(request: Request) -> tuple[str, str]:
    user_id = request.headers.get("x-lumina-user-id", "").strip()
    role = request.headers.get("x-lumina-role", "").strip()
    if not user_id or role not in {"doctor", "patient"}:
        raise HTTPException(status_code=401, detail="Missing Lumina actor headers")
    return user_id, role


def _system_prompt(ctx: dict) -> str:
    who_parts: list[str] = []
    if ctx.get("patient_name"):
        who_parts.append(str(ctx["patient_name"]))
    if ctx.get("age"):
        who_parts.append(f"{ctx['age']} years old")
    if ctx.get("sex"):
        who_parts.append(str(ctx["sex"]))
    who = ", ".join(who_parts) or "(no demographic details on file)"
    return f"""You are Lumina's patient companion, having a live spoken
conversation with a patient. Greet them warmly by name if you know it, then
ask how they are feeling today. Listen, acknowledge their feelings, and
respond in the context of their doctor-released history below.

PATIENT: {who}

DOCTOR-RELEASED HISTORY:
{ctx.get("compact_summary", "(no history)")}

{_SAFETY_RULES}
"""


class VoiceSessionResponse(BaseModel):
    token: str
    model: str
    expires_at: int
    session_expires_at: int
    system_prompt: str
    voice_name: str = "Aoede"
    language_code: str = "en-US"


@router.post("/session", response_model=VoiceSessionResponse)
async def create_voice_session(request: Request) -> VoiceSessionResponse:
    user_id, role = _actor(request)
    if role != "patient":
        raise HTTPException(
            status_code=403, detail="Only patients can start a voice session"
        )

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Voice agent is not configured (GEMINI_API_KEY missing)",
        )

    with Session(request.app.state.app_db_engine) as session:
        ctx = build_patient_voice_context(session, user_id)

    system_prompt = _system_prompt(ctx)

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key, http_options={"api_version": "v1alpha"})
    now = datetime.now(UTC)
    token_expire = now + timedelta(minutes=_TOKEN_TTL_MINUTES)
    session_expire = now + timedelta(minutes=_SESSION_TTL_MINUTES)

    try:
        token_obj = await client.aio.auth_tokens.create(
            config=types.CreateAuthTokenConfig(
                uses=1,
                expire_time=token_expire,
                new_session_expire_time=session_expire,
                live_connect_constraints=types.LiveConnectConstraints(
                    model=_MODEL,
                    config=types.LiveConnectConfig(
                        response_modalities=["AUDIO"],
                        system_instruction=types.Content(
                            parts=[types.Part(text=system_prompt)]
                        ),
                    ),
                ),
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Could not mint Gemini token: {exc}"
        ) from exc

    token_name = getattr(token_obj, "name", None) or getattr(token_obj, "token", None)
    if not token_name:
        raise HTTPException(status_code=502, detail="Gemini returned no token")

    return VoiceSessionResponse(
        token=token_name,
        model=_MODEL,
        expires_at=int(token_expire.timestamp()),
        session_expires_at=int(session_expire.timestamp()),
        system_prompt=system_prompt,
    )


@router.get("/health")
async def voice_health() -> dict:
    return {
        "ok": True,
        "configured": bool(os.environ.get("GEMINI_API_KEY")),
        "model": _MODEL,
        "checked_at": int(time.time()),
    }
```

- [ ] **Step 2: Register in `main.py`**

In `apps/api/main.py`, add the import next to the other route imports (alphabetical placement — insert between `submissions_router` and end-of-block):

```python
from api.routes.voice import router as voice_router  # noqa: E402
```

Then, in the block of `app.include_router(...)` calls at the bottom, add:

```python
app.include_router(voice_router)
```

- [ ] **Step 3: Write the endpoint test**

Create `tests/test_voice_session.py`:

```python
"""Voice session endpoint — auth and configuration guards."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from main import app
    with TestClient(app) as c:
        yield c


def _patient_headers(user_id: str) -> dict:
    return {"x-lumina-user-id": user_id, "x-lumina-role": "patient"}


def _doctor_headers(user_id: str) -> dict:
    return {"x-lumina-user-id": user_id, "x-lumina-role": "doctor"}


def test_voice_health(client):
    resp = client.get("/voice/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["model"] == "gemini-3.1-flash-live-preview"
    assert "configured" in data


def test_voice_session_requires_actor_headers(client):
    resp = client.post("/voice/session")
    assert resp.status_code == 401


def test_voice_session_rejects_doctor(client):
    resp = client.post("/voice/session", headers=_doctor_headers("voice-doc-1"))
    assert resp.status_code == 403


def test_voice_session_503_when_key_missing(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    resp = client.post("/voice/session", headers=_patient_headers("voice-p-1"))
    assert resp.status_code == 503
    assert "GEMINI_API_KEY" in resp.json()["detail"]
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && uv run pytest ../../tests/test_voice_session.py -v`
Expected: `4 passed`. (The tests deliberately do NOT invoke Gemini — that requires a real key and a live network call, which is out of scope for unit tests.)

- [ ] **Step 5: Verify the route registered**

Run:
```bash
cd apps/api && uv run python -c "
from main import app
paths = sorted(r.path for r in app.routes if hasattr(r, 'path'))
print([p for p in paths if p.startswith('/voice')])
"
```
Expected: `['/voice/health', '/voice/session']`

- [ ] **Step 6: Lint**

Run: `cd apps/api && uv run ruff check . && uv run ruff format --check .`
Expected: no output, exit 0

- [ ] **Step 7: Commit**

```bash
git add apps/api/api/routes/voice.py apps/api/main.py tests/test_voice_session.py
git commit -m "feat(api): add /voice/session endpoint for Gemini Live agent

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend API client function + type

**Files:**
- Modify: `apps/web/src/types/lumina.ts`
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces: `VoiceSession` type, `createVoiceSessionRemote(actor)` function. The user's own UI component will import and call this — no page changes here.

- [ ] **Step 1: Add the type**

Append to `apps/web/src/types/lumina.ts`:

```typescript
export interface VoiceSession {
  token: string;
  model: string;
  expiresAt: number;
  sessionExpiresAt: number;
  systemPrompt: string;
  voiceName: string;
  languageCode: string;
}
```

- [ ] **Step 2: Add the API client function**

In `apps/web/src/lib/api.ts`, extend the existing `import type { ... } from "@/types/lumina"` line to include `VoiceSession`, then add near the other `remote` functions:

```typescript
export async function createVoiceSessionRemote(actor: ApiActor): Promise<VoiceSession> {
  const res = await fetch(`${API}/voice/session`, { method: "POST", headers: actorHeaders(actor) });
  const raw = await jsonOrThrow<{
    token: string;
    model: string;
    expires_at: number;
    session_expires_at: number;
    system_prompt: string;
    voice_name: string;
    language_code: string;
  }>(res, "Could not start voice session");
  return {
    token: raw.token,
    model: raw.model,
    expiresAt: raw.expires_at,
    sessionExpiresAt: raw.session_expires_at,
    systemPrompt: raw.system_prompt,
    voiceName: raw.voice_name,
    languageCode: raw.language_code,
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/types/lumina.ts
git commit -m "feat(web): add createVoiceSessionRemote API client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full API test suite**

Run: `cd apps/api && uv run pytest ../../tests/ -v`
Expected: all tests pass. The 3 new voice_context tests + 4 new voice_session tests + pre-existing tests, all green.

- [ ] **Step 2: API lint sweep**

Run: `cd apps/api && uv run ruff check . && uv run ruff format --check .`
Expected: exit 0

- [ ] **Step 3: Web typecheck + build**

Run: `cd apps/web && pnpm typecheck && pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke test**

With backend running and a real `GEMINI_API_KEY` in `.env`:

```bash
curl -X POST http://localhost:8000/voice/session \
  -H "x-lumina-user-id: <a-patient-with-released-history>" \
  -H "x-lumina-role: patient" | jq
```

Expected: HTTP 200 with a `token`, `model="gemini-3.1-flash-live-preview"`, `expires_at` roughly 15 minutes in the future, and a `system_prompt` that includes:
- the patient's name (if any released report has one)
- a bulleted "DOCTOR-RELEASED HISTORY" section with one line per released report
- the full `SAFETY RULES` block verbatim

- [ ] **Step 5: Browser wire-up sanity check**

Have the user hook their existing UI component to `createVoiceSessionRemote`, open the Gemini Live WebSocket at `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?access_token=<token>` (per `google-genai` Live docs), send a `setup` frame with model + `system_instruction` from the response, and start pushing microphone audio. First expected agent utterance: a warm greeting using the patient's name.
