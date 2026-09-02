"""Sirve la aplicación local y la abre en el navegador."""

import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


PORT = 8000


def open_browser():
    webbrowser.open(f"http://localhost:{PORT}/")


server = ThreadingHTTPServer(("127.0.0.1", PORT), SimpleHTTPRequestHandler)
print(f"Aplicacion disponible en http://localhost:{PORT}/ (Ctrl+C para salir)")
threading.Timer(0.5, open_browser).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nServidor detenido")
finally:
    server.server_close()