"""QR-based patient record access.

Self-contained so it can be developed alongside other work without touching
shared modules. Everything the feature owns lives here:

    models.py   the two tables it adds
    routes.py   the endpoints

It only reads existing models (PatientHistoryConsent, ClinicalCase) — it does not
modify them, and it deliberately reuses the existing consent flow rather than
introducing a second one.
"""

from api.qr.routes import router

__all__ = ["router"]
