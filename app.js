const API_URL = 'http://localhost:5000/movies';
let editingMovieId = null;

window.addEventListener('DOMContentLoaded', () => {
    fetchMovies();
    document.getElementById('movieForm').addEventListener('submit', saveMovie);
    document.getElementById('addButton').addEventListener('click', () => {
        resetForm();
        document.getElementById('title').focus();
    });
    document.getElementById('cancelButton').addEventListener('click', resetForm);
    document.getElementById('movieFilter').addEventListener('change', fetchMovies);
});

async function fetchMovies() {
    const listError = document.getElementById('listError');
    listError.textContent = '';
    try {
        const response = await fetch(API_URL);
        const movies = await response.json();
        if (!response.ok) {
            throw new Error(movies.error);
        }
        displayMovies(movies);
    } catch (error) {
        listError.textContent = 'Could not load movies. Check that the Python server is running. ' + error.message;
        document.getElementById('movieCount').textContent = 'Collection could not be refreshed.';
    }
}

function filterMovies(movies, filter) {
    // Copy the list so changing the filter does not change the original order.
    let result = [...movies];
    if (filter === 'director' || filter === 'genre') {
        result.sort((a, b) => {
            if (a[filter] === b[filter]) return 0;
            if (a[filter] === 'NA') return 1;
            if (b[filter] === 'NA') return -1;
            return a[filter].localeCompare(b[filter], undefined, { sensitivity: 'base' });
        });
    } else if (filter === 'release_year' || filter === 'rating') {
        // Missing years and ratings go at the end.
        result.sort((a, b) => (b[filter] ?? 0) - (a[filter] ?? 0));
    } else if (filter === 'watched' || filter === 'want_to_watch') {
        const status = filter === 'watched' ? 'Watched' : 'Want to Watch';
        result = result.filter(movie => movie.watch_status === status);
        result.sort((a, b) => b.id - a.id);
    }
    return result;
}

function displayMovies(movies) {
    const filter = document.getElementById('movieFilter').value;
    const visibleMovies = filterMovies(movies, filter);
    const container = document.getElementById('moviesContainer');
    container.replaceChildren();
    document.getElementById('movieCount').textContent = movies.length + (movies.length === 1 ? ' movie in your collection' : ' movies in your collection');
    if (filter === 'watched' || filter === 'want_to_watch') {
        document.getElementById('movieCount').textContent = 'Showing ' + visibleMovies.length + ' of ' + movies.length + ' movies';
    }
    document.getElementById('emptyMessage').textContent = movies.length === 0
        ? 'No movies yet. Add your first movie using the form above.'
        : 'No movies match this filter.';
    document.getElementById('emptyMessage').hidden = visibleMovies.length > 0;
    document.getElementById('movieTable').hidden = visibleMovies.length === 0;

    visibleMovies.forEach(movie => {
        const row = document.createElement('tr');
        const rating = movie.rating === null ? 'Not watched' : movie.rating + ' / 5';
        const values = [movie.title, movie.director, movie.release_year === null ? 'NA' : movie.release_year, movie.genre, movie.watch_status, rating];
        values.forEach((value, index) => {
            const cell = document.createElement('td');
            if (index === 4) {
                const badge = document.createElement('span');
                badge.className = movie.watch_status === 'Watched' ? 'status-badge watched' : 'status-badge';
                badge.textContent = value;
                cell.appendChild(badge);
            } else {
                // textContent displays user input as text, not HTML.
                cell.textContent = value;
            }
            row.appendChild(cell);
        });

        const actions = document.createElement('td');
        actions.className = 'row-actions';
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'secondary';
        editButton.textContent = 'Edit';
        editButton.setAttribute('aria-label', 'Edit ' + movie.title);
        editButton.addEventListener('click', () => editMovie(movie.id));

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'delete-button';
        deleteButton.textContent = 'Delete';
        deleteButton.setAttribute('aria-label', 'Delete ' + movie.title);
        deleteButton.addEventListener('click', () => deleteMovie(movie.id, movie.title));
        actions.append(editButton, deleteButton);
        row.appendChild(actions);
        container.appendChild(row);
    });
}

function resetForm() {
    editingMovieId = null;
    document.getElementById('movieForm').reset();
    document.getElementById('releaseYear').placeholder = '(e.g. 2008)';
    document.getElementById('formHeading').textContent = 'Add a Movie';
    document.getElementById('saveButton').textContent = 'Save Movie';
    document.getElementById('cancelButton').hidden = true;
    document.getElementById('formError').textContent = '';
}

async function editMovie(movieId) {
    document.getElementById('listError').textContent = '';
    document.getElementById('statusMessage').textContent = '';
    try {
        const response = await fetch(API_URL + '/' + movieId);
        const movie = await response.json();
        if (!response.ok) {
            throw new Error(movie.error);
        }
        editingMovieId = movie.id;
        document.getElementById('title').value = movie.title;
        document.getElementById('director').value = movie.director;
        document.getElementById('releaseYear').value = movie.release_year === null ? '' : movie.release_year;
        document.getElementById('releaseYear').placeholder = movie.release_year === null ? '(NA)' : '(e.g. 2008)';
        document.getElementById('genre').value = movie.genre;
        document.getElementById('watchStatus').value = movie.watch_status === 'NA' ? 'Want to Watch' : movie.watch_status;
        document.getElementById('rating').value = movie.rating === null ? '' : movie.rating;
        document.getElementById('notes').value = movie.notes;
        document.getElementById('formHeading').textContent = 'Edit Movie';
        document.getElementById('saveButton').textContent = 'Save Changes';
        document.getElementById('cancelButton').hidden = false;
        document.getElementById('formError').textContent = '';
        document.getElementById('title').focus();
    } catch (error) {
        document.getElementById('listError').textContent = 'Could not open movie. ' + error.message;
    }
}

async function saveMovie(event) {
    event.preventDefault();
    const formError = document.getElementById('formError');
    const saveButton = document.getElementById('saveButton');
    formError.textContent = '';
    document.getElementById('statusMessage').textContent = '';

    const rating = document.getElementById('rating').value;
    const yearInput = document.getElementById('releaseYear');
    const movie = {
        title: document.getElementById('title').value.trim(),
        director: document.getElementById('director').value.trim(),
        release_year: yearInput.value === '' ? null : Number(yearInput.value),
        genre: document.getElementById('genre').value.trim(),
        watch_status: document.getElementById('watchStatus').value,
        rating: rating === '' ? null : Number(rating),
        notes: document.getElementById('notes').value.trim()
    };
    if (!movie.title) {
        formError.textContent = 'Please enter a movie title.';
        document.getElementById('title').focus();
        return;
    }
    if (yearInput.validity.badInput || (movie.release_year !== null &&
        (!Number.isInteger(movie.release_year) || movie.release_year < 1 || movie.release_year > 9999))) {
        formError.textContent = 'Release year must be a whole number from 1 to 9999, or left blank.';
        yearInput.focus();
        return;
    }

    const isEditing = editingMovieId !== null;
    const url = isEditing ? API_URL + '/' + editingMovieId : API_URL;
    saveButton.disabled = true;
    try {
        const response = await fetch(url, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(movie)
        });
        const savedMovie = await response.json();
        if (!response.ok) {
            throw new Error(savedMovie.error);
        }
        resetForm();
        document.getElementById('statusMessage').textContent = isEditing ? 'Movie updated.' : 'Movie added.';
        await fetchMovies();
    } catch (error) {
        formError.textContent = 'Could not save movie. ' + error.message;
    } finally {
        saveButton.disabled = false;
    }
}

async function deleteMovie(movieId, title) {
    if (!confirm('Delete "' + title + '" from your collection?')) {
        return;
    }
    document.getElementById('listError').textContent = '';
    document.getElementById('statusMessage').textContent = '';
    try {
        const response = await fetch(API_URL + '/' + movieId, { method: 'DELETE' });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }
        // DELETE returns 204 with no JSON body.
        if (editingMovieId === movieId) {
            resetForm();
        }
        document.getElementById('statusMessage').textContent = 'Movie deleted.';
        await fetchMovies();
    } catch (error) {
        document.getElementById('listError').textContent = 'Could not delete movie. ' + error.message;
    }
}
