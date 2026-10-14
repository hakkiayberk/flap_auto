#!/bin/bash
set -e
cd "$(dirname "$0")"

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
uvicorn main:app --host 127.0.0.1 --port 8000 &
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
npm run dev

