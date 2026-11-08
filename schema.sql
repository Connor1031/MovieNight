CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    director TEXT NOT NULL DEFAULT 'NA',
    release_year INTEGER CHECK (release_year BETWEEN 1 AND 9999),
    genre TEXT NOT NULL DEFAULT 'NA',
    watch_status TEXT NOT NULL DEFAULT 'NA'
        CHECK (watch_status IN ('NA', 'Want to Watch', 'Watched')),
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    notes TEXT NOT NULL DEFAULT 'NA'
);
