import os
from pathlib import Path

from dotenv import load_dotenv
from sqlmodel import SQLModel, create_engine

ROOT = Path(__file__).parent.parent.parent

# loaded here rather than in the entry points so that any of them — ingest.run,
# ingest.hpo, scripts, tests — picks up the root .env without repeating this.
load_dotenv(ROOT / ".env")

# Where the source datasets live. Set LUMINA_DATA_DIR to keep the large
# downloads out of the app tree — see ml/README.md.
DATA_DIR = Path(os.environ.get("LUMINA_DATA_DIR") or ROOT / "data")


def get_engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise ValueError(
            "DATABASE_URL environment variable is not set. Cannot connect to Supabase."
        )
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    connect_args = {}
    if "postgres" in url:
        connect_args = {
            "connect_timeout": 10,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 3,
        }
    return create_engine(
        url,
        echo=False,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


def init_db():
    from ingest import models  # noqa: F401 — registers all table metadata

    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    return engine
