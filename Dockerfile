FROM python:3.13-slim

RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install uv huggingface_hub

WORKDIR /app

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

WORKDIR /app/apps/api

RUN uv sync --no-dev

EXPOSE 7860
ENV PORT=7860

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
