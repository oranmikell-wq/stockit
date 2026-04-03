import http.server, socketserver, os, sys
os.chdir('/Users/oranmikel/Downloads/newapp')
port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
with socketserver.TCPServer(("", port), http.server.SimpleHTTPRequestHandler) as h:
    h.serve_forever()
