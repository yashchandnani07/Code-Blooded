#!/bin/bash
# Startup script for Railway deployment
# Reads PORT from environment (Railway sets this)
# Falls back to 7860 if not set

PORT="${PORT:-7860}"
echo "Starting server on port $PORT"
exec uv run uvicorn main:app --host 0.0.0.0 --port "$PORT"