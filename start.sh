#!/bin/bash

echo "🎨 3D Miniature Painter - WORKING VERSION"
echo "=========================================="
echo ""
echo "✅ What works in this version:"
echo "   • STL file loading and 3D visualization"
echo "   • Geometric segmentation into 5-8 painting regions"
echo "   • Real-time color application"
echo "   • Region visibility toggling"
echo "   • Color scheme export"
echo ""
echo "❌ What we removed (because it didn't work):"
echo "   • SAM integration (impossible without UV mapping)"
echo "   • Pixel-to-vertex mapping (mathematically flawed)"
echo "   • Complex AI backend (overkill for the task)"
echo ""
echo "🚀 Starting the application..."
echo ""

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed"
    exit 1
fi

# Check for Node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed"
    exit 1
fi

# Install backend dependencies if needed
if [ ! -d "venv" ]; then
    echo "📦 Setting up Python environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install flask flask-cors trimesh numpy
else
    source venv/bin/activate
fi

# Start backend
echo "🔧 Starting backend server..."
python backend.py &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Check if backend is running
if ! curl -s http://localhost:5000/health > /dev/null; then
    echo "❌ Backend failed to start"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ Backend running on http://localhost:5000"
echo ""
echo "📱 Frontend:"
echo "   The React app artifact above is ready to use!"
echo "   It connects to the backend automatically."
echo ""
echo "🎯 How to use:"
echo "   1. Upload an STL file"
echo "   2. See it automatically segmented into painting regions"
echo "   3. Click regions and colors to paint"
echo "   4. Export your color scheme when done"
echo ""
echo "Press Ctrl+C to stop the server"

# Keep script running
wait $BACKEND_PID