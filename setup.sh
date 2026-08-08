#!/usr/bin/env bash
# =============================================================================
#  LUMINA — ALL-IN-ONE BACKEND SETUP
#  Doctor-reviewed rare-disease triage · FastAPI + HPO/Orphanet scoring
# =============================================================================
#
#  This single file bootstraps, migrates, indexes, runs, and health-checks the
#  Lumina backend across local / staging / production. It is idempotent: safe to
#  re-run. Every section is commented so an AI agent or a teammate can follow it
#  top-to-bottom with zero prior context.
#
#  ---------------------------------------------------------------------------
#  SPEC (the blanks from the brief, filled from the actual codebase)
#  ---------------------------------------------------------------------------
#   Language / Framework : Python 3.13 · FastAPI · Uvicorn (deps managed by uv)
#   Database Type        : SQLite via SQLModel / SQLAlchemy — TWO databases:
#                            1) data/orpha.sqlite     → read-only knowledge graph
#                                                       (Disease, DiseasePhenotype,
#                                                        DiseaseGene, HPOTerm, …)
#                            2) data/lumina_app.sqlite → runtime app state
#                                                       (submissions, cases, msgs)
#   API Specifications   : REST / JSON · OpenAPI + Swagger UI at /docs ·
#                          7 routers: /intake /score /agent /disease /fhir
#                          /search + submissions & cases (no prefix)
#   Authentication       : Actor-header gate on the API
#                          (x-lumina-user-id + x-lumina-role ∈ {doctor,patient}).
#                          Clerk issues the identity on the web tier.
#                          An OPTIONAL FastAPI JWT-verify dependency is emitted
#                          by `setup.sh harden-auth` (see SECURITY section).
#   Additional services  : Groq LLM (Llama-3.3-70B + Llama-4-Scout vision),
#                          sentence-transformers (all-MiniLM-L6-v2) embeddings,
#                          Tesseract OCR (lab reports), ReportLab (PDF letters),
#                          cyvcf2 (genetic VCF parsing).
#
#  ---------------------------------------------------------------------------
#  USAGE
#  ---------------------------------------------------------------------------
#   ./setup.sh doctor                 # print stack/versions doctor report
#   ./setup.sh env       [local|staging|production]   # write apps/api/.env
#   ./setup.sh install                # install python deps via uv
#   ./setup.sh db                     # ensure knowledge-graph + app DB ready
#   ./setup.sh index                  # build the HPO embedding index (optional)
#   ./setup.sh run       [local|staging|production]   # start the API
#   ./setup.sh health    [PORT]       # curl the /health endpoint
#   ./setup.sh harden-auth            # emit optional JWT verify dependency
#   ./setup.sh all       [local|staging|production]   # env→install→db→index
#
#   ENV can also be supplied as: LUMINA_ENV=production ./setup.sh all
# =============================================================================

set -Eeuo pipefail   # -E: ERR trap inherited · -e: exit on error · -u: no unset
                     # vars · -o pipefail: a failed stage in a pipe fails the pipe

# ---------------------------------------------------------------------------
# 0. PATHS & CONSTANTS  — resolve everything relative to this script so it can
#    be invoked from anywhere. Keep the repo layout single-sourced here.
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}"                 # place this file at the repo root
API_DIR="${REPO_ROOT}/apps/api"           # FastAPI app (main.py lives here)
DATA_DIR="${REPO_ROOT}/data"              # both SQLite files live here
KG_DB="${DATA_DIR}/orpha.sqlite"          # knowledge graph (LFS-tracked)
APP_DB="${DATA_DIR}/lumina_app.sqlite"    # runtime app DB (auto-created)
INDEX_SCRIPT="${REPO_ROOT}/scripts/build_hpo_index.py"

DEFAULT_PORT=8000                         # local/staging port; Docker uses 7860
LUMINA_ENV="${LUMINA_ENV:-}"             # may be pre-set via environment

# Pretty logging helpers (no external deps) --------------------------------
c_reset=$'\033[0m'; c_blue=$'\033[34m'; c_green=$'\033[32m'
c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_bold=$'\033[1m'
log()  { printf '%s▸%s %s\n'  "${c_blue}"   "${c_reset}" "$*"; }
ok()   { printf '%s✓%s %s\n'  "${c_green}"  "${c_reset}" "$*"; }
warn() { printf '%s!%s %s\n'  "${c_yellow}" "${c_reset}" "$*" >&2; }
die()  { printf '%s✗%s %s\n'  "${c_red}"    "${c_reset}" "$*" >&2; exit 1; }
trap 'die "failed at line ${LINENO}. See message above."' ERR

# Normalise the ENV argument to one of local|staging|production ------------
resolve_env() {
  local e="${1:-${LUMINA_ENV:-local}}"
  case "${e}" in
    local|staging|production) echo "${e}" ;;
    prod) echo "production" ;;
    dev|development) echo "local" ;;
    *) die "unknown environment '${e}' (use local|staging|production)" ;;
  esac
}

# ---------------------------------------------------------------------------
# 1. PREREQUISITE / VERSION DOCTOR
#    Fails fast with actionable install hints instead of a cryptic error deep
#    inside uv or uvicorn. Pin to the versions the codebase targets (py>=3.13).
# ---------------------------------------------------------------------------
cmd_doctor() {
  log "Environment doctor — verifying toolchain"
  local missing=0

  if command -v python3 >/dev/null 2>&1; then
    local pv; pv="$(python3 -c 'import sys;print("%d.%d"%sys.version_info[:2])')"
    if [ "$(printf '%s\n3.12\n' "${pv}" | sort -V | head -1)" != "3.12" ]; then
      warn "python ${pv} found — project targets 3.13 (3.12 OK; scispacy needs 3.12)"
    else
      ok "python ${pv}"
    fi
  else warn "python3 not found"; missing=1; fi

  if command -v uv >/dev/null 2>&1; then ok "uv $(uv --version | awk '{print $2}')"
  else warn "uv missing → install:  pip install uv   (or: curl -LsSf https://astral.sh/uv/install.sh | sh)"; missing=1; fi

  if command -v tesseract >/dev/null 2>&1; then ok "tesseract $(tesseract --version 2>&1 | head -1 | awk '{print $2}')"
  else warn "tesseract missing → lab-report OCR (/intake/lab) will fail. Install: apt-get install tesseract-ocr  |  brew install tesseract"; fi

  # Node/pnpm are only needed for the web tier — optional for a backend-only run.
  if command -v pnpm >/dev/null 2>&1; then ok "pnpm $(pnpm --version)  (web tier)"
  else warn "pnpm missing → only needed for apps/web (frontend). Skip if backend-only."; fi

  # Git LFS gates the knowledge-graph DB. Warn loudly — this is the #1 gotcha.
  if command -v git-lfs >/dev/null 2>&1 || git lfs version >/dev/null 2>&1; then
    ok "git-lfs present"
  else
    warn "git-lfs missing → data/orpha.sqlite may be a pointer stub, not the DB. Install git-lfs then: git lfs pull"
  fi

  [ "${missing}" -eq 0 ] && ok "core toolchain ready" || die "install the missing tools above, then re-run"
}

# ---------------------------------------------------------------------------
# 2. ENVIRONMENT CONFIGURATION
#    Writes apps/api/.env for the chosen tier. NEVER overwrites an existing
#    .env without --force. Secrets stay blank — fill them in, don't commit them.
#
#    Note: apps/web/.env.local (Clerk keys, NEXT_PUBLIC_API_URL) is a SEPARATE
#    frontend file and is intentionally not touched here.
# ---------------------------------------------------------------------------
cmd_env() {
  local env; env="$(resolve_env "${1:-}")"
  local force="${2:-}"
  local target="${API_DIR}/.env"
  mkdir -p "${API_DIR}"

  if [ -f "${target}" ] && [ "${force}" != "--force" ]; then
    warn ".env already exists at ${target} — leaving it untouched (pass --force to regenerate)"
    return 0
  fi

  # Per-tier knobs. CORS is env-driven so staging/prod don't hardcode localhost.
  local cors reload log_level
  case "${env}" in
    local)      cors="http://localhost:3000";              reload="1"; log_level="debug" ;;
    staging)    cors="https://*.vercel.app";               reload="0"; log_level="info"  ;;
    production) cors="https://app.lumina.example";          reload="0"; log_level="warning" ;;
  esac

  log "Writing ${target}  (tier: ${env})"
  cat > "${target}" <<EOF
# ==== Lumina API environment — tier: ${env} ==================================
# Generated by setup.sh. Fill in secrets; do NOT commit this file.

# --- LLM provider (extractors + agent) --------------------------------------
# Backend extractors call Groq (Llama-3.3-70B + Llama-4-Scout vision).
GROQ_API_KEY=

# The root .env.example also lists ANTHROPIC_API_KEY; it is not read by the
# current Python backend. Set it only if you wire an Anthropic path yourself.
# ANTHROPIC_API_KEY=

# --- Databases (SQLite) ------------------------------------------------------
# Knowledge graph (read-only). Ships prebuilt via git-lfs; rebuild only if absent.
DATABASE_URL=sqlite:///./data/orpha.sqlite
# Runtime app DB (submissions/cases). Auto-created on first boot if missing.
LUMINA_APP_DATABASE_URL=sqlite:///./data/lumina_app.sqlite

# --- Server ------------------------------------------------------------------
LUMINA_ENV=${env}
LOG_LEVEL=${log_level}
UVICORN_RELOAD=${reload}
# Comma-separated allowed origins consumed by CORS (see SECURITY section).
CORS_ALLOW_ORIGINS=${cors}

# --- Optional: JWT hardening (only if you run 'setup.sh harden-auth') --------
# JWT_ISSUER=
# JWT_AUDIENCE=
# JWKS_URL=            # e.g. Clerk JWKS endpoint for your instance
EOF
  ok ".env written — now open it and paste your GROQ_API_KEY"
}

# ---------------------------------------------------------------------------
# 3. DEPENDENCY INSTALL
#    uv resolves the monorepo's local path packages (ingest/scoring/extractors)
#    from apps/api/pyproject.toml automatically. --frozen in CI for reproducibility.
# ---------------------------------------------------------------------------
cmd_install() {
  command -v uv >/dev/null 2>&1 || die "uv not installed (run: ./setup.sh doctor)"
  log "Installing Python deps with uv (this also links ingest/scoring/extractors)"
  ( cd "${API_DIR}" && uv sync )
  ok "backend dependencies installed into apps/api/.venv"
  warn "OCR extra: scispacy is intentionally NOT in core deps (needs py3.12). If you want local NER, install it in a 3.12 venv per apps/api/pyproject.toml comments."
}

# ---------------------------------------------------------------------------
# 4. DATABASE BOOTSTRAP & MIGRATIONS
#
#    There is no Alembic here — schema is created from SQLModel metadata, and an
#    additive column migration runs automatically at startup. Concretely:
#
#      * Knowledge graph (orpha.sqlite): NOT migrated at runtime. It is either
#        pulled prebuilt via git-lfs, or (fallback) rebuilt by the ingest
#        pipeline `python -m ingest.run` (orphadata → hpo → clinvar → fgdd).
#
#      * App DB (lumina_app.sqlite): SQLModel.metadata.create_all() creates the
#        tables on first boot, and api/app_db.py::_ensure_patient_submission_columns
#        ALTERs in any newly-added columns — a lightweight forward-only migration.
#        This function triggers that same path once, up front, so a fresh clone
#        has a valid app DB before the first request.
# ---------------------------------------------------------------------------
cmd_db() {
  mkdir -p "${DATA_DIR}"

  # 4a. Knowledge graph -------------------------------------------------------
  if [ -f "${KG_DB}" ] && [ "$(stat -c%s "${KG_DB}" 2>/dev/null || stat -f%z "${KG_DB}")" -gt 100000 ]; then
    ok "knowledge graph present: ${KG_DB}"
  else
    warn "knowledge graph missing or a tiny LFS stub."
    if git lfs version >/dev/null 2>&1; then
      log "attempting: git lfs pull"
      ( cd "${REPO_ROOT}" && git lfs pull ) || warn "git lfs pull failed — you may need LFS credentials"
    fi
    if [ ! -f "${KG_DB}" ] || [ "$(stat -c%s "${KG_DB}" 2>/dev/null || stat -f%z "${KG_DB}")" -le 100000 ]; then
      warn "no prebuilt DB — falling back to the ingest pipeline (needs source data files)"
      ( cd "${API_DIR}" && uv run python -m ingest.run ) \
        || die "ingest failed. Ship the prebuilt orpha.sqlite via git-lfs for hackathon reliability."
    fi
  fi

  # 4b. App DB — run the real init path (create_all + additive ALTERs) --------
  log "initialising app DB (tables + additive column migration)"
  ( cd "${API_DIR}" && uv run python -c "from api.app_db import init_app_db; init_app_db(); print('app db ready')" )
  ok "app DB ready: ${APP_DB}"
}

# ---------------------------------------------------------------------------
# 5. EMBEDDING INDEX (optional but recommended)
#    Powers GET /search/hpo semantic fuzzy matching. If skipped, that endpoint
#    degrades gracefully to [] — everything else still works.
# ---------------------------------------------------------------------------
cmd_index() {
  [ -f "${INDEX_SCRIPT}" ] || { warn "no ${INDEX_SCRIPT} — skipping index build"; return 0; }
  log "building HPO embedding index (all-MiniLM-L6-v2)"
  # Run with the api venv but from repo root so relative data/ paths resolve.
  ( cd "${API_DIR}" && uv run python "${INDEX_SCRIPT}" ) \
    && ok "embedding index built" \
    || warn "index build failed — /search/hpo will return [] until this succeeds"
}

# ---------------------------------------------------------------------------
# 6. RUN — one command, three tiers
#
#    local      → hot-reload single worker, verbose, on :8000
#    staging    → multi-worker, no reload, on :8000
#    production → gunicorn+uvicorn workers if available (graceful timeouts,
#                 access logs), else uvicorn workers. Bind 0.0.0.0.
#
#    Docker/HF-Spaces use port 7860 (see DEPLOYMENT). Locally we default to 8000.
# ---------------------------------------------------------------------------
cmd_run() {
  local env; env="$(resolve_env "${1:-}")"
  local port="${2:-${DEFAULT_PORT}}"
  [ -f "${API_DIR}/.env" ] || warn "no apps/api/.env yet — run: ./setup.sh env ${env}"

  case "${env}" in
    local)
      log "starting API (local · reload) → http://localhost:${port}  · docs at /docs"
      ( cd "${API_DIR}" && uv run uvicorn main:app --reload --port "${port}" )
      ;;
    staging)
      log "starting API (staging · 2 workers) → http://0.0.0.0:${port}"
      ( cd "${API_DIR}" && uv run uvicorn main:app --host 0.0.0.0 --port "${port}" --workers 2 )
      ;;
    production)
      log "starting API (production) → http://0.0.0.0:${port}"
      if ( cd "${API_DIR}" && uv run python -c "import gunicorn" >/dev/null 2>&1 ); then
        # gunicorn as the process manager, uvicorn workers as the ASGI runtime.
        ( cd "${API_DIR}" && uv run gunicorn main:app \
            --worker-class uvicorn.workers.UvicornWorker \
            --workers "${WEB_CONCURRENCY:-4}" \
            --bind "0.0.0.0:${port}" \
            --timeout 120 --graceful-timeout 30 --keep-alive 5 \
            --access-logfile - --error-logfile - )
      else
        warn "gunicorn not installed — using uvicorn workers (add gunicorn to deps for prod-grade process mgmt)"
        ( cd "${API_DIR}" && uv run uvicorn main:app --host 0.0.0.0 --port "${port}" \
            --workers "${WEB_CONCURRENCY:-4}" --no-access-log )
      fi
      ;;
  esac
}

# ---------------------------------------------------------------------------
# 7. HEALTH CHECK — hits the built-in /health route (counts diseases in the KG).
# ---------------------------------------------------------------------------
cmd_health() {
  local port="${1:-${DEFAULT_PORT}}"
  log "GET http://localhost:${port}/health"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "http://localhost:${port}/health" && echo || die "health check failed — is the server up?"
  else
    warn "curl not found; open http://localhost:${port}/health in a browser"
  fi
}

# ---------------------------------------------------------------------------
# 8. OPTIONAL: JWT HARDENING  (satisfies the brief's 'JWT implementation' ask)
#
#    The API currently trusts x-lumina-user-id / x-lumina-role headers set by the
#    trusted web tier. For a public-facing deployment you should verify a signed
#    token instead. This emits a drop-in FastAPI dependency that validates a JWT
#    (e.g. a Clerk session token) against a JWKS endpoint and derives the actor
#    from verified claims. It is written only if absent — never clobbers.
# ---------------------------------------------------------------------------
cmd_harden_auth() {
  local out="${API_DIR}/api/security_jwt.py"
  [ -f "${out}" ] && { warn "${out} already exists — not overwriting"; return 0; }
  log "emitting optional JWT verify dependency → ${out}"
  cat > "${out}" <<'PYEOF'
"""Optional JWT actor verification for Lumina.

Wire this in place of the header-only gate in api/routes/submissions.py::_actor.
Requires: PyJWT[crypto] (add `pyjwt[crypto]` to apps/api/pyproject.toml deps).

Usage in a route:
    from api.security_jwt import verified_actor
    @router.post("/submissions")
    async def create(actor = Depends(verified_actor)):
        user_id, role = actor
"""
from __future__ import annotations

import os

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

_JWKS_URL = os.environ.get("JWKS_URL", "")
_AUDIENCE = os.environ.get("JWT_AUDIENCE") or None
_ISSUER = os.environ.get("JWT_ISSUER") or None
_jwks_client = PyJWKClient(_JWKS_URL) if _JWKS_URL else None


def verified_actor(authorization: str | None = Header(default=None)) -> tuple[str, str]:
    """Validate a Bearer JWT and return (user_id, role) from verified claims."""
    if _jwks_client is None:
        raise HTTPException(status_code=500, detail="JWKS_URL not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=_AUDIENCE,
            issuer=_ISSUER,
            options={"require": ["exp", "iat"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    user_id = str(claims.get("sub") or "")
    # Adjust to wherever your IdP stores the role (custom claim / metadata).
    role = str(claims.get("lumina_role") or claims.get("role") or "")
    if not user_id or role not in {"doctor", "patient"}:
        raise HTTPException(status_code=403, detail="Token missing valid actor claims")
    return user_id, role
PYEOF
  ok "wrote ${out} — add pyjwt[crypto] to deps and set JWKS_URL/JWT_AUDIENCE/JWT_ISSUER in .env"
}

# ---------------------------------------------------------------------------
# 9. ORCHESTRATOR
# ---------------------------------------------------------------------------
cmd_all() {
  local env; env="$(resolve_env "${1:-}")"
  cmd_doctor
  cmd_env "${env}"
  cmd_install
  cmd_db
  cmd_index
  ok "setup complete for '${env}'. Start it with:  ./setup.sh run ${env}"
}

# ---------------------------------------------------------------------------
# 10. DISPATCH
# ---------------------------------------------------------------------------
main() {
  local sub="${1:-help}"; shift || true
  case "${sub}" in
    doctor)       cmd_doctor "$@" ;;
    env)          cmd_env "$@" ;;
    install)      cmd_install "$@" ;;
    db|migrate)   cmd_db "$@" ;;
    index)        cmd_index "$@" ;;
    run|serve)    cmd_run "$@" ;;
    health)       cmd_health "$@" ;;
    harden-auth)  cmd_harden_auth "$@" ;;
    all|setup)    cmd_all "$@" ;;
    help|--help|-h)
      sed -n '2,60p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
    *) die "unknown command '${sub}' — run: ./setup.sh help" ;;
  esac
}
main "$@"

# =============================================================================
#  APPENDIX A — API ENDPOINTS WITH SAMPLE REQUESTS
#  (Base URL local: http://localhost:8000 · interactive docs: /docs · /redoc)
# -----------------------------------------------------------------------------
#  Every /intake/* response is a list[HPOTerm]; doctors then accept/reject them
#  client-side and POST the accepted subset to /score.
#
#  # 1) Free-text notes → HPO terms
#  curl -s http://localhost:8000/intake/text \
#    -H 'Content-Type: application/json' \
#    -d '{"notes":"3yo with hypotonia, seizures, no hepatomegaly"}'
#
#  # 2) Clinical photo → HPO terms  (facial=true enables dysmorphology vocab)
#  curl -s 'http://localhost:8000/intake/photo?facial=true' \
#    -F 'file=@patient_face.jpg'
#
#  # 3) Lab report (image/PDF) → HPO terms  (Tesseract OCR + LLM)
#  curl -s http://localhost:8000/intake/lab -F 'file=@cbc_report.pdf'
#
#  # 4) Genetic VCF → HPO terms  (ClinVar pathogenic → gene → disease → HPO)
#  curl -s http://localhost:8000/intake/vcf -F 'file=@sample.vcf.gz'
#
#  # 5) Rank candidate diseases from accepted phenotypes (+ optional genetics)
#  curl -s http://localhost:8000/score \
#    -H 'Content-Type: application/json' \
#    -d '{"terms":[{"hpo_id":"HP:0001250","confidence":0.9}],
#         "top_k":10,"modalities":2,"genetic_evidence":[]}'
#
#  # 6) Semantic HPO search (needs the embedding index from `setup.sh index`)
#  curl -s 'http://localhost:8000/search/hpo?q=trouble+walking&top_k=5'
#
#  # 7) Disease lookup
#  curl -s 'http://localhost:8000/disease/search?q=marfan&lang=en'
#  curl -s 'http://localhost:8000/disease/558?lang=en'         # by Orpha code
#
#  # 8) Agent: next best question / referral letter / patient summary / PDF
#  curl -s http://localhost:8000/agent/next     -H 'Content-Type: application/json' -d '{...}'
#  curl -s http://localhost:8000/agent/letter   -H 'Content-Type: application/json' -d '{...}'
#  curl -s http://localhost:8000/agent/letter-pdf -H 'Content-Type: application/json' -d '{...}' -o referral.pdf
#
#  # 9) FHIR export of the case
#  curl -s http://localhost:8000/fhir/export -H 'Content-Type: application/json' -d '{...}'
#
#  # 10) Patient↔doctor workflow (ACTOR HEADERS REQUIRED)
#  curl -s http://localhost:8000/submissions \
#    -H 'x-lumina-user-id: doc_123' -H 'x-lumina-role: doctor'
#  #   Lifecycle: POST /submissions/{id}/start-review · /request-more-data ·
#  #   /complete-review · /link-case · /release   plus  /cases CRUD.
#
# =============================================================================
#  APPENDIX B — SECURITY MEASURES
# -----------------------------------------------------------------------------
#  * CORS: main.py currently allows http://localhost:3000 and https://*.vercel.app.
#    For staging/prod, read CORS_ALLOW_ORIGINS from the env this script writes and
#    replace the hardcoded list, e.g.:
#        import os
#        origins = [o for o in os.environ.get("CORS_ALLOW_ORIGINS","").split(",") if o]
#        app.add_middleware(CORSMiddleware, allow_origins=origins, ...)
#  * Auth: header-actor gate today (trusted web tier). Public deployments should
#    run `setup.sh harden-auth` and verify a signed JWT (JWKS) instead.
#  * Secrets: never commit apps/api/.env. Rotate GROQ_API_KEY if it leaks.
#  * Uploads: cap request size at the reverse proxy; validate content-type on
#    /intake/photo|lab and /submissions file endpoints.
#  * PHI: this is a research prototype, NOT a certified device. Do not process
#    real patient data without a compliant (encryption-at-rest, audit) deployment.
#
# =============================================================================
#  APPENDIX C — DEPLOYMENT
# -----------------------------------------------------------------------------
#  A) Docker / Hugging Face Spaces (matches the repo Dockerfile — port 7860):
#       docker build -t lumina-api -f apps/api/Dockerfile apps/api
#       docker run -p 7860:7860 --env-file apps/api/.env lumina-api
#     The image installs tesseract + libgomp1, runs `uv sync --frozen --no-dev`,
#     and copies a git-LFS orpha.sqlite into /app/data.
#
#  B) Vercel (Python serverless — apps/api/vercel.json routes all to main.py):
#     Serverless has cold starts + a read-only FS. For the app DB and embedding
#     index, prefer the Docker/Spaces path or an external volume in production.
#
#  ⚠ REPO REMOTE MISMATCH: README clone URL and apps/api/Dockerfile both point at
#    github.com/vees-1/lumina.git, not this yashchandnani07 repo. Confirm which
#    remote is canonical before wiring CI/CD so the Docker build pulls the right
#    packages/ tree.
#
# =============================================================================
#  APPENDIX D — SCALABILITY & PERFORMANCE NOTES
# -----------------------------------------------------------------------------
#  * The ScoringIndex loads the KG into memory once at startup (lifespan) and
#    ranks in-memory — fast, but each worker holds its own copy. Size workers to
#    RAM, not just CPU.
#  * SQLite is single-writer. Fine for a hackathon and read-heavy KG traffic; if
#    the app DB sees concurrent writes under load, move lumina_app.sqlite to
#    Postgres (SQLModel makes this a URL swap + minor type review).
#  * LLM calls (Groq) dominate latency on /intake/* and /agent/*. Add a response
#    cache keyed by input hash, and set client timeouts. Consider a queue for
#    /agent/letter-pdf if generation is slow.
#  * Warm the sentence-transformers model at startup (already in lifespan) so the
#    first /search/hpo request isn't penalised.
# =============================================================================
