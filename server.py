import json
import sqlite3
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit

from database import MovieDatabase


class MovieHandler(BaseHTTPRequestHandler):
    database = None

    def end_headers(self):
        # Include CORS headers on successful responses and errors.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def respond(self, status, body=None, extra_headers=None):
        data = b"" if body is None else json.dumps(body).encode("utf-8")
        self.send_response(status)
        if body is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        # A 204 response must not include a body or Content-Length.
        if status != 204:
            self.send_header("Content-Length", str(len(data)))
        if extra_headers:
            for name, value in extra_headers.items():
                self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def get_route(self):
        path = urlsplit(self.path).path
        if path == "/movies":
            return "collection", None
        parts = path.split("/")
        if len(parts) == 3 and parts[1] == "movies":
            # SQLite identifiers must fit in a signed 64-bit integer.
            if parts[2].isascii() and parts[2].isdigit() and len(parts[2]) <= 19:
                movie_id = int(parts[2])
                if 0 < movie_id <= 9223372036854775807:
                    return "member", movie_id
        return "unknown", None

    def check_route(self):
        route, movie_id = self.get_route()
        if route == "unknown":
            self.respond(404, {"error": "Route not found. Use /movies or /movies/{id}."})
            return None
        allowed = "GET, POST, OPTIONS" if route == "collection" else "GET, PUT, DELETE, OPTIONS"
        if self.command not in allowed.split(", "):
            self.respond(405, {"error": "Method not allowed for this route."}, {"Allow": allowed})
            return None
        return route, movie_id

    def read_movie(self):
        if self.headers.get_content_type() != "application/json":
            self.respond(415, {"error": "Use Content-Type: application/json."})
            return None
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                raise ValueError("Missing request body")
            movie = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeError):
            self.respond(400, {"error": "The request body must contain valid JSON."})
            return None

        if not isinstance(movie, dict):
            self.respond(400, {"error": "Send a JSON object containing the movie attributes."})
            return None
        if not isinstance(movie.get("title"), str) or not movie["title"].strip():
            self.respond(400, {"error": "Please enter a movie title."})
            return None
        movie["title"] = movie["title"].strip()
        for field in ("director", "genre", "watch_status", "notes"):
            value = movie.get(field)
            if value is None:
                value = ""
            if not isinstance(value, str):
                self.respond(400, {"error": f"{field} must be text."})
                return None
            movie[field] = value.strip() or "NA"
        if movie["watch_status"] not in ("NA", "Want to Watch", "Watched"):
            self.respond(400, {"error": "Watch status must be NA, Want to Watch, or Watched."})
            return None
        # Missing numbers stay null in SQLite and display as NA in the client.
        for field, maximum in (("release_year", 9999), ("rating", 5)):
            value = movie.get(field)
            if value is None or (isinstance(value, str) and value.strip() in ("", "NA")):
                movie[field] = None
            elif type(value) is not int or not 1 <= value <= maximum:
                self.respond(400, {"error": f"{field} must be a whole number from 1 to {maximum}, or left blank."})
                return None
        return movie

    def do_OPTIONS(self):
        if self.check_route() is not None:
            self.respond(204)

    def do_GET(self):
        route = self.check_route()
        if route is None:
            return
        name, movie_id = route
        if name == "collection":
            self.respond(200, self.database.list_movies())
        else:
            movie = self.database.get_movie(movie_id)
            if movie is None:
                self.respond(404, {"error": "Movie not found."})
            else:
                self.respond(200, movie)

    def do_POST(self):
        if self.check_route() is None:
            return
        movie = self.read_movie()
        if movie is not None:
            saved_movie = self.database.create_movie(movie)
            self.respond(201, saved_movie, {"Location": f"/movies/{saved_movie['id']}"})

    def do_PUT(self):
        route = self.check_route()
        if route is None:
            return
        movie_id = route[1]
        if self.database.get_movie(movie_id) is None:
            self.respond(404, {"error": "Movie not found."})
            return
        movie = self.read_movie()
        if movie is not None:
            self.respond(200, self.database.replace_movie(movie_id, movie))

    def do_DELETE(self):
        route = self.check_route()
        if route is None:
            return
        movie_id = route[1]
        if self.database.get_movie(movie_id) is None:
            self.respond(404, {"error": "Movie not found."})
            return
        self.database.delete_movie(movie_id)
        self.respond(204)

    def send_error(self, code, message=None, explain=None):
        # The base server calls this for methods such as PATCH and HEAD.
        if code == 501:
            self.check_route()
        else:
            self.respond(code, {"error": message or "Invalid request."})

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except sqlite3.Error:
            self.respond(500, {"error": "Could not read or save the movie database."})


if __name__ == "__main__":
    database = MovieDatabase()
    MovieHandler.database = database
    try:
        with HTTPServer(("localhost", 5000), MovieHandler) as server:
            print("Movie API running at http://localhost:5000/movies", flush=True)
            print("Press Ctrl+C to stop.", flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        database.close()
