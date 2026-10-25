# Production Dockerfile for PayAnalytics
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=3000

# Set working directory
WORKDIR /app

# Install system dependencies (needed for compiling any scientific python modules if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Expose server port
EXPOSE 3000

# Health check to ensure server responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start server
CMD ["python", "server.py", "--port", "3000"]
