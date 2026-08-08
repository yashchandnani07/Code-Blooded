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
