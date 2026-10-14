#!/bin/bash
set -e
cd "$(dirname "$0")"

RADAR_BACKEND_PORT="${RADAR_BACKEND_PORT:-8000}"
RADAR_FRONTEND_PORT="${RADAR_FRONTEND_PORT:-15000}"
echo "Starting China Meme Radar..."

# Setup Python environment
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
echo "Installing Python dependencies..."
pip install -r backend/requirements.txt

# Start backend in the background
echo "Starting FastAPI backend on port 8000..."
cd backend
uvicorn main:app --host 127.0.0.1 --port "$RADAR_BACKEND_PORT" &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT INT TERM
cd ..

# Wait a moment for backend to start
sleep 2

# Start frontend
echo "Starting Vite frontend on port 5000 (if available)..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install
fi
RADAR_API_URL="http://127.0.0.1:$RADAR_BACKEND_PORT" npm run dev -- --host 127.0.0.1 --port "$RADAR_FRONTEND_PORT"

