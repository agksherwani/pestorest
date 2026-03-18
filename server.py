#!/usr/bin/env python3
"""Simple HTTP server with gzip compression (mimics GitHub Pages)."""
import gzip, io, os
from http.server import HTTPServer, SimpleHTTPRequestHandler

class GzipHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        # Check if client accepts gzip
        ae = self.headers.get('Accept-Encoding', '')
        if 'gzip' not in ae:
            return super().do_GET()

        # Get the file path
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        if not os.path.isfile(path):
            return super().do_GET()

        # Only gzip text-based files
        ext = os.path.splitext(path)[1].lower()
        compressible = {'.html', '.css', '.js', '.json', '.svg', '.xml', '.txt'}
        if ext not in compressible:
            return super().do_GET()

        ct = {'.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
              '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml',
              '.txt': 'text/plain'}.get(ext, 'application/octet-stream')

        with open(path, 'rb') as f:
            content = f.read()

        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=9) as gz:
            gz.write(content)
        compressed = buf.getvalue()

        self.send_response(200)
        self.send_header('Content-Type', ct)
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(compressed)))
        self.end_headers()
        self.wfile.write(compressed)

if __name__ == '__main__':
    HTTPServer(('', 8000), GzipHandler).serve_forever()
