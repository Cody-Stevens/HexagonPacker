#!/usr/bin/env python3
"""
Simple HTTP server for local development.
Serves files with proper MIME types for ES modules.

Usage:
    python serve.py          # Starts on port 8000
    python serve.py 3000     # Starts on port 3000
"""

import http.server
import socketserver
import sys
import webbrowser
from functools import partial

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=".", **kwargs)
    
    def end_headers(self):
        # Add CORS headers for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

# Ensure .js files are served with correct MIME type for ES modules
Handler.extensions_map.update({
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
})

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    url = f"http://localhost:{PORT}"
    print(f"\n🚀 Hexagon Packer Dev Server")
    print(f"   Serving at: {url}")
    print(f"   Press Ctrl+C to stop\n")
    
    # Auto-open browser
    webbrowser.open(url)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Server stopped")
