import sqlite3
from pathlib import Path


class MovieDatabase:
    def __init__(self, database_path=None):
        if database_path is None:
            database_path = Path(__file__).with_name("movies.db")
        self.connection = sqlite3.connect(database_path)
        self.connection.row_factory = sqlite3.Row
        schema = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
        self.connection.execute(schema)
        self.update_old_schema(schema)

    def update_old_schema(self, schema):
        # Keep saved movies when upgrading the original required-field table.
        columns = self.connection.execute("PRAGMA table_info(movies)").fetchall()
        if any(column["name"] == "release_year" and column["notnull"] for column in columns):
            with self.connection:
                self.connection.execute("BEGIN")
                self.connection.execute("ALTER TABLE movies RENAME TO movies_old")
                self.connection.execute(schema)
                self.connection.execute(
                    """INSERT INTO movies
                       (id, title, director, release_year, genre, watch_status, rating, notes)
                       SELECT id, title, director, release_year, genre, watch_status, rating,
                              CASE WHEN trim(notes) = '' THEN 'NA' ELSE notes END
                       FROM movies_old"""
                )
                self.connection.execute("DROP TABLE movies_old")

    def list_movies(self):
        rows = self.connection.execute(
            "SELECT * FROM movies ORDER BY title COLLATE NOCASE, id"
        ).fetchall()
        return [dict(row) for row in rows]

    def get_movie(self, movie_id):
        row = self.connection.execute(
            "SELECT * FROM movies WHERE id = ?", (movie_id,)
        ).fetchone()
        return dict(row) if row else None

    def create_movie(self, movie):
        with self.connection:
            cursor = self.connection.execute(
                """INSERT INTO movies
                   (title, director, release_year, genre, watch_status, rating, notes)
                   VALUES (:title, :director, :release_year, :genre,
                           :watch_status, :rating, :notes)""",
                movie,
            )
        return self.get_movie(cursor.lastrowid)

    def replace_movie(self, movie_id, movie):
        # Named parameters keep form values separate from the SQL query.
        values = dict(movie)
        values["id"] = movie_id
        with self.connection:
            self.connection.execute(
                """UPDATE movies SET title = :title, director = :director,
                   release_year = :release_year, genre = :genre,
                   watch_status = :watch_status, rating = :rating, notes = :notes
                   WHERE id = :id""",
                values,
            )
        return self.get_movie(movie_id)

    def delete_movie(self, movie_id):
        with self.connection:
            self.connection.execute("DELETE FROM movies WHERE id = ?", (movie_id,))

    def close(self):
        self.connection.close()
