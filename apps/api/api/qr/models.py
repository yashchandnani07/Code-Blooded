"""Tables owned by the QR access feature.

Kept out of api/app_models.py so this feature can land without touching a file
other work is editing.
"""

from sqlmodel import Field, SQLModel


class PatientQrToken(SQLModel, table=True):
    """Opaque handle a patient presents to a doctor in person.

    The token carries no medical data and no derivable patient id — it is a
    random lookup key, so a photographed or leaked code reveals nothing on its
    own. Compromise is contained by revoking it, which is what regenerating does.
    """

    __tablename__ = "app_patient_qr_token"

    id: str = Field(primary_key=True)
    patient_owner_id: str = Field(index=True)
    token: str = Field(index=True, unique=True)
    created_at: int
    expires_at: int
    revoked_at: int | None = None


class QrScanAudit(SQLModel, table=True):
    """One row per scan attempt, successful or not.

    Failures are recorded too: a patient needs to see that someone tried an
    expired or revoked code, not only the scans that succeeded.
    """

    __tablename__ = "app_qr_scan_audit"

    id: str = Field(primary_key=True)
    token_id: str | None = Field(default=None, index=True)
    patient_owner_id: str | None = Field(default=None, index=True)
    doctor_id: str = Field(index=True)
    scanned_at: int
    # granted | consent_pending | consent_denied | expired | revoked | unknown_token
    outcome: str = Field(index=True)
    purpose: str | None = None
