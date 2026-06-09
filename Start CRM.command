#!/bin/bash
# Double-click this file to start Furniture CRM

cd "$(dirname "$0")"

# Kill any previous instance on port 3456
lsof -ti :3456 | xargs kill -9 2>/dev/null
sleep 0.5

echo ""
echo "  🪵  Starting Furniture CRM..."
echo ""

# Start server in background
node server.js &
SERVER_PID=$!
sleep 2

# Open in default browser
open http://localhost:3456

echo "  ✅  CRM is running at http://localhost:3456"
echo "  ℹ️   Close this window to stop the server."
echo ""

# Keep window open so server stays alive
wait $SERVER_PID
