#!/bin/sh
set -e

echo "Running database migrations..."
flask init-db

echo "Starting gunicorn..."
exec gunicorn \
    --workers "${GUNICORN_WORKERS:-4}" \
    --bind "0.0.0.0:${PORT:-5000}" \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    "app:create_app()"
