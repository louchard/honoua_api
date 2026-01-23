# A34.b — Étape 3/5 : runtime (Gunicorn/Uvicorn)
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    HOST=0.0.0.0 \
    PORT=8000 \
    APP_MODULE="app.main:app" \
    WORKERS=2

# Déps système minimales; on complètera plus tard si besoin (ex: libpq)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Venv isolé
RUN python -m venv /opt/venv

WORKDIR /app

# Déps Python (si fichier présent)
COPY requirements.txt .
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi

# Code
COPY . .

# Sécurité: non-root
RUN useradd -m -U -s /usr/sbin/nologin appuser
USER appuser:appuser

EXPOSE 8000

# CMD de prod (Gunicorn). Adapter APP_MODULE à ta vraie app (ex: app.main:app)
CMD exec gunicorn "$APP_MODULE" \
  --bind "$HOST:$PORT" \
  --workers "$WORKERS" \
  --access-logfile "-" \
  --error-logfile "-" \
  --timeout 60
