import os
from pathlib import Path

from sqlmodel import SQLModel, create_engine

APP_DATA_DIR = Path(__file__).parent.parent.parent.parent / "data"
UPLOAD_DIR = APP_DATA_DIR / "uploads" / "submissions"


def get_app_engine():
    url = os.environ.get("LUMINA_APP_DATABASE_URL", "") or os.environ.get("DATABASE_URL", "")
    if not url:
        raise ValueError(
            "DATABASE_URL environment variable is not set. Cannot connect to Supabase."
        )
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return create_engine(
        url,
        echo=False,
        pool_pre_ping=True,
        connect_args={
            "connect_timeout": 10,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 3,
        },
    )


def init_app_db():
    from api import app_models  # noqa: F401
    from api.qr import models as qr_models  # noqa: F401  — registers QR tables

    engine = get_app_engine()
    SQLModel.metadata.create_all(engine)
    return engine
