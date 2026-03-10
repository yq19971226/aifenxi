# ---- Build stage ----
FROM python:3.11-slim AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---- Production stage ----
FROM python:3.11-slim AS production

# Create non-root user
RUN groupadd -r omnimind && useradd -r -g omnimind -d /app -s /sbin/nologin omnimind

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code（先显式复制 leaderboard 确保进镜像，避免缓存导致缺失）
COPY --chown=omnimind:omnimind app/api/leaderboard.py app/api/
COPY --chown=omnimind:omnimind . .

USER omnimind

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
