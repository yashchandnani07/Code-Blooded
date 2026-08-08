from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load the monorepo root .env first (legacy/shared location), then apps/api/.env
# on top of it with override=True — apps/api/.env is what the README documents,
# so it should win if both are present and disagree.
load_dotenv(Path(__file__).parent.parent.parent / ".env")
load_dotenv(Path(__file__).parent / ".env", override=True)

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from ingest.db import get_engine  # noqa: E402
from ingest.models import HPOTerm as HPOTermModel  # noqa: E402
from scoring.ranker import ScoringIndex  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from api.routes.agent import router as agent_router  # noqa: E402
from api.routes.disease import router as disease_router  # noqa: E402
from api.routes.fhir import router as fhir_router  # noqa: E402
from api.routes.intake import router as intake_router  # noqa: E402
from api.routes.patient_history import router as patient_history_router  # noqa: E402
from api.routes.score import router as score_router  # noqa: E402
from api.routes.search import router as search_router  # noqa: E402
from api.routes.submissions import router as submissions_router  # noqa: E402
from api.routes.voice import router as voice_router  # noqa: E402


def _hpo_synonyms() -> dict[str, list[str]]:
    """hpo_id -> exact synonyms, from the ontology pyhpo ships with.

    Clinicians write "myoclonic jerks", not "Myoclonus". Matching only the
    primary label misses those, and the miss is expensive: on a realistic note
    it cost the correct diagnosis two ranks. Synonyms are not stored in the
    database, so they are read from the ontology at startup.
    """
    try:
        import pyhpo

        try:
            pyhpo.Ontology()
        except RuntimeError:
            pass  # already initialised by another caller

        out: dict[str, list[str]] = {}
        for term in pyhpo.Ontology:
            syns = [s.strip() for s in (getattr(term, "synonym", None) or []) if s and s.strip()]
            if syns:
                out[term.id] = syns
        return out
    except Exception:
        return {}


def _load_hpo_vocab(engine) -> list[tuple[str, str]]:
    with Session(engine) as s:
        terms = s.exec(
            select(HPOTermModel).where(HPOTermModel.ic.isnot(None)).order_by(HPOTermModel.ic.desc())
        ).all()

    synonyms = _hpo_synonyms()
    vocab: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for t in terms:
        # primary label first so it wins on ties; the matcher keeps the
        # highest-confidence hit per hpo_id regardless.
        for phrase in [t.name, *synonyms.get(t.hpo_id, [])]:
            key = (t.hpo_id, phrase.lower())
            if phrase and key not in seen:
                seen.add(key)
                vocab.append((t.hpo_id, phrase))
    return vocab


def _load_hpo_definitions(engine) -> dict[str, str | None]:
    with Session(engine) as s:
        terms = s.exec(select(HPOTermModel)).all()
    return {t.hpo_id: t.definition for t in terms}


def _load_hpo_names(engine) -> dict[str, str]:
    with Session(engine) as s:
        terms = s.exec(select(HPOTermModel)).all()
    return {t.hpo_id: t.name for t in terms}


def _load_facial_vocab(engine) -> list[str]:
    from ingest.models import FacialDiseasePhenotype
    from ingest.models import HPOTerm as HT

    with Session(engine) as s:
        rows = s.exec(select(FacialDiseasePhenotype.hpo_id).distinct()).all()
        hpo_ids = list(rows)
        names = []
        for hid in hpo_ids:
            term = s.get(HT, hid)
            if term:
                names.append(f"{hid}: {term.name}")
    return names


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = get_engine()
    app.state.db_engine = engine
    from api.app_db import init_app_db

    app.state.app_db_engine = init_app_db()

    try:
        app.state.scoring_index = ScoringIndex.load()
    except Exception:
        app.state.scoring_index = None
    try:
        app.state.hpo_vocab = _load_hpo_vocab(engine)
        app.state.hpo_names = _load_hpo_names(engine)
        app.state.hpo_definitions = _load_hpo_definitions(engine)
    except Exception:
        app.state.hpo_vocab = []
        app.state.hpo_names = {}
        app.state.hpo_definitions = {}
    try:
        app.state.facial_vocab = _load_facial_vocab(engine)
    except Exception:
        app.state.facial_vocab = []
    from scoring.embeddings import _embedder

    if not _embedder.load_index():
        pass  # index not built yet; build with scripts/build_hpo_index.py
    app.state.hpo_embedder = _embedder

    try:
        from scoring.ml_ranker import XGBoostRanker

        app.state.xgb_ranker = XGBoostRanker.load()
    except Exception:
        app.state.xgb_ranker = None

    yield


app = FastAPI(title="Lumina API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(intake_router)
app.include_router(score_router)
app.include_router(agent_router)
app.include_router(disease_router)
app.include_router(fhir_router)
app.include_router(search_router)
app.include_router(submissions_router)
app.include_router(patient_history_router)
app.include_router(voice_router)


@app.get("/health")
async def health():
    from sqlmodel import Session, text

    try:
        with Session(app.state.db_engine) as s:
            count = s.exec(text("SELECT COUNT(*) FROM disease")).one()
        db_status = f"{count[0]} diseases loaded"
    except Exception as e:
        db_status = f"error: {e}"
    return {"status": "ok", "version": "0.1.0", "db": db_status}
