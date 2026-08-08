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
- Match the patient's language. If they switch, you switch.
- In sense of emergency, reply in short sentences"""


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
    return f"""You are Sanjeevni's patient companion, having a live spoken
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
        raise HTTPException(status_code=403, detail="Only patients can start a voice session")

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
                        system_instruction=types.Content(parts=[types.Part(text=system_prompt)]),
                    ),
                ),
            )
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not mint Gemini token: {exc}") from exc

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
