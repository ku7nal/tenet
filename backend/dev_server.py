from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from lambda_function import handler


class ApiHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        request = urlparse(self.path)
        if request.path != "/api/recommendation":
            self.send_error(404)
            return

        query = {key: values[-1] for key, values in parse_qs(request.query).items()}
        result = handler({
            "requestContext": {"http": {"method": "GET"}},
            "queryStringParameters": query,
        }, None)
        body = result["body"].encode("utf-8")
        self.send_response(result["statusCode"])
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        return


if __name__ == "__main__":
    print("Tenet API listening at http://127.0.0.1:8787")
    HTTPServer(("127.0.0.1", 8787), ApiHandler).serve_forever()
