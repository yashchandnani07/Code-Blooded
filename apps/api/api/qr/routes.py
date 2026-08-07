"""QR-based patient record access.

A patient shows a code; a doctor scans it. The scan does not itself grant access —
it resolves the patient and then defers to the consent the patient already
controls (PatientHistoryConsent), raising a request if none exists. Every attempt
is written to the audit log, including the ones that fail.
"""

import secrets
import time
from uuid import uuid4

from api.app_models import PatientHistoryConsent
from api.qr.models import PatientQrToken, QrScanAudit
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

router = APIRouter(tags=["qr"])

# Codes are short-lived by default so a photographed screen stops working. The
# patient can regenerate at any time, which revokes the previous code.
DEFAULT_TTL_SECONDS = 24 * 60 * 60


def _now_ms() -> int:
    return int(time.time() * 1000)


def _actor(request: Request) -> tuple[str, str]:
    user_id = request.headers.get("x-lumina-user-id", "").strip()
    role = request.headers.get("x-lumina-role", "").strip()
    if not user_id or role not in {"doctor", "patient"}:
        raise HTTPException(status_code=401, detail="Missing Lumina actor headers")
    return user_id, role


def _require(request: Request, role: str) -> str:
    user_id, actual = _actor(request)
    if actual != role:
        raise HTTPException(status_code=403, detail=f"Only {role}s can perform this action")
    return user_id


def _token_payload(row: PatientQrToken) -> dict:
    return {
        "token": row.token,
        "created_at": row.created_at,
        "expires_at": row.expires_at,
        "revoked_at": row.revoked_at,
        "active": row.revoked_at is None and row.expires_at > _now_ms(),
    }


def _active_token(session: Session, patient_owner_id: str) -> PatientQrToken | None:
    row = session.exec(
        select(PatientQrToken)
        .where(PatientQrToken.patient_owner_id == patient_owner_id)
        .where(PatientQrToken.revoked_at.is_(None))
        .order_by(PatientQrToken.created_at.desc())
    ).first()
    if row is None or row.expires_at <= _now_ms():
        return None
    return row


def _audit(
    session: Session,
    *,
    doctor_id: str,
    outcome: str,
    token_id: str | None = None,
    patient_owner_id: str | None = None,
    purpose: str | None = None,
) -> None:
    session.add(
        QrScanAudit(
            id=str(uuid4()),
            token_id=token_id,
            patient_owner_id=patient_owner_id,
            doctor_id=doctor_id,
            scanned_at=_now_ms(),
            outcome=outcome,
            purpose=(purpose or None),
        )
    )


# ── Patient side ──────────────────────────────────────────────────────────────


@router.post("/patients/me/qr")
async def issue_qr(request: Request):
    """Issue a code, revoking any previous one so only a single code is ever live."""
    patient_id = _require(request, "patient")
    now = _now_ms()
    with Session(request.app.state.app_db_engine) as session:
        for old in session.exec(
            select(PatientQrToken)
            .where(PatientQrToken.patient_owner_id == patient_id)
            .where(PatientQrToken.revoked_at.is_(None))
        ).all():
            old.revoked_at = now
            session.add(old)

        row = PatientQrToken(
            id=str(uuid4()),
            patient_owner_id=patient_id,
            token=secrets.token_urlsafe(32),
            created_at=now,
            expires_at=now + DEFAULT_TTL_SECONDS * 1000,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return _token_payload(row)


@router.get("/patients/me/qr")
async def get_my_qr(request: Request):
    patient_id = _require(request, "patient")
    with Session(request.app.state.app_db_engine) as session:
        row = _active_token(session, patient_id)
        return _token_payload(row) if row else {"token": None, "active": False}


@router.delete("/patients/me/qr")
async def revoke_my_qr(request: Request):
    patient_id = _require(request, "patient")
    now = _now_ms()
    with Session(request.app.state.app_db_engine) as session:
        rows = session.exec(
            select(PatientQrToken)
            .where(PatientQrToken.patient_owner_id == patient_id)
            .where(PatientQrToken.revoked_at.is_(None))
        ).all()
        for row in rows:
            row.revoked_at = now
            session.add(row)
        session.commit()
        return {"revoked": len(rows)}


@router.get("/patients/me/qr/scans")
async def my_scan_history(request: Request):
    """The patient's own audit trail — who scanned, when, and what happened."""
    patient_id = _require(request, "patient")
    with Session(request.app.state.app_db_engine) as session:
        rows = session.exec(
            select(QrScanAudit)
            .where(QrScanAudit.patient_owner_id == patient_id)
            .order_by(QrScanAudit.scanned_at.desc())
        ).all()
        return [
            {
                "id": r.id,
                "doctor_id": r.doctor_id,
                "scanned_at": r.scanned_at,
                "outcome": r.outcome,
                "purpose": r.purpose,
            }
            for r in rows
        ]


# ── Doctor side ───────────────────────────────────────────────────────────────


class ScanBody(BaseModel):
    token: str
    purpose: str | None = None


@router.post("/qr/scan")
async def scan_qr(body: ScanBody, request: Request):
    """Resolve a code and report whether the doctor may view the record.

    Returns an outcome rather than the record itself; on ``granted`` the client
    calls the existing GET /patients/{id}/history, so access control lives in one
    place instead of being duplicated here.
    """
    doctor_id = _require(request, "doctor")
    token = (body.token or "").strip()

    with Session(request.app.state.app_db_engine) as session:
        row = session.exec(select(PatientQrToken).where(PatientQrToken.token == token)).first()

        if row is None:
            _audit(session, doctor_id=doctor_id, outcome="unknown_token", purpose=body.purpose)
            session.commit()
            raise HTTPException(status_code=404, detail="Unrecognised code")

        if row.revoked_at is not None:
            _audit(
                session,
                doctor_id=doctor_id,
                outcome="revoked",
                token_id=row.id,
                patient_owner_id=row.patient_owner_id,
                purpose=body.purpose,
            )
            session.commit()
            raise HTTPException(status_code=410, detail="This code has been revoked")

        if row.expires_at <= _now_ms():
            _audit(
                session,
                doctor_id=doctor_id,
                outcome="expired",
                token_id=row.id,
                patient_owner_id=row.patient_owner_id,
                purpose=body.purpose,
            )
            session.commit()
            raise HTTPException(status_code=410, detail="This code has expired")

        consent = session.exec(
            select(PatientHistoryConsent)
            .where(PatientHistoryConsent.patient_owner_id == row.patient_owner_id)
            .where(PatientHistoryConsent.doctor_id == doctor_id)
        ).first()

        if consent is not None and consent.status == "approved":
            outcome = "granted"
        elif consent is not None and consent.status == "denied":
            outcome = "consent_denied"
        else:
            if consent is None:
                # Same consent model the submission flow uses, so the patient
                # approves it in the panel that already exists.
                session.add(
                    PatientHistoryConsent(
                        id=str(uuid4()),
                        patient_owner_id=row.patient_owner_id,
                        doctor_id=doctor_id,
                        status="pending",
                        triggered_by_submission_id=None,
                        requested_at=_now_ms(),
                    )
                )
            outcome = "consent_pending"

        _audit(
            session,
            doctor_id=doctor_id,
            outcome=outcome,
            token_id=row.id,
            patient_owner_id=row.patient_owner_id,
            purpose=body.purpose,
        )
        session.commit()

        return {
            "outcome": outcome,
            "patient_owner_id": row.patient_owner_id if outcome == "granted" else None,
        }
