import datetime
from flask import Flask, abort, jsonify, render_template, request
from flask_cors import CORS

from auth.auth import (
    ALLOW_DEMO_AUTH,
    API_AUDIENCE,
    AUTH0_DOMAIN,
    AuthError,
    CLIENT_ID,
    IS_AUTH0_CONFIGURED,
    ROLE_PERMISSIONS,
    requires_auth,
)
from database.models import (
    Actor,
    Movie,
    db,
    db_create_all_and_seed,
    db_drop_and_create_all,
    setup_db,
)


def _parse_release_date(value):
    """Parse an incoming date string into a datetime object."""
    if value is None or value == '':
        return None
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, datetime.date):
        return datetime.datetime(value.year, value.month, value.day)
    if isinstance(value, str):
        cleaned = value.strip()
        for fmt in ('%Y-%m-%d', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%SZ'):
            try:
                return datetime.datetime.strptime(cleaned, fmt)
            except ValueError:
                continue
        try:
            return datetime.datetime.fromisoformat(cleaned.replace('Z', '+00:00'))
        except ValueError:
            return None
    return None


def create_app(test_config=None):
    """Create and configure the Flask Casting Agency web application."""
    app = Flask(__name__)
    app.config.from_object('config')
    if test_config:
        app.config.update(test_config)

    setup_db(app)
    CORS(app)

    with app.app_context():
        if test_config and test_config.get('RESET_DB'):
            db_drop_and_create_all()
        else:
            db_create_all_and_seed()

    @app.after_request
    def after_request(response):
        response.headers.add(
            'Access-Control-Allow-Headers', 'Content-Type, Authorization, true'
        )
        response.headers.add(
            'Access-Control-Allow-Methods', 'GET, PATCH, POST, DELETE, OPTIONS'
        )
        return response

    # Website entry point
    @app.route('/')
    def home():
        return render_template('index.html')

    # Public API health check
    @app.route('/api/health')
    def health():
        return jsonify({
            'success': True,
            'message': 'Casting Agency API is running',
        })

    # Public authentication & RBAC configuration for the web UI
    @app.route('/auth/config')
    def auth_config():
        return jsonify({
            'success': True,
            'auth_mode': 'auth0' if IS_AUTH0_CONFIGURED else 'demo',
            'allow_demo_auth': ALLOW_DEMO_AUTH,
            'auth0_domain': AUTH0_DOMAIN,
            'api_audience': API_AUDIENCE,
            'client_id': CLIENT_ID,
            'roles': ROLE_PERMISSIONS,
        })

    @app.route('/actors')
    @requires_auth(permission='get:actors')
    def get_actors(payload):
        data = Actor.query.order_by(Actor.id.asc()).all()
        actors = [actor.get_actor() for actor in data]
        return jsonify({
            'success': True,
            'actors': actors,
        })

    @app.route('/movies')
    @requires_auth('get:movies')
    def get_movies(payload):
        data = Movie.query.order_by(Movie.id.asc()).all()
        movies = [movie.get_movie() for movie in data]
        return jsonify({
            'success': True,
            'movies': movies,
        })

    @app.route('/actors', methods=['POST'])
    @requires_auth('post:actors')
    def post_actor(payload):
        body = request.get_json(silent=True)
        if not body:
            abort(422)

        name = (body.get('name') or '').strip()
        age = body.get('age')
        gender = (body.get('gender') or '').strip()
        movie_id = body.get('movie_id')

        if not name or age is None or not gender:
            abort(422)

        try:
            age = int(age)
            if age < 1 or age > 120:
                abort(422)
        except (TypeError, ValueError):
            abort(422)

        if movie_id in ('', None):
            movie_id = None
        else:
            try:
                movie_id = int(movie_id)
            except (TypeError, ValueError):
                abort(422)
            if db.session.get(Movie, movie_id) is None:
                abort(404)

        duplicate = Actor.query.filter(Actor.name.ilike(name)).one_or_none()
        if duplicate is not None:
            return jsonify({
                'success': False,
                'error': 400,
                'message': f'An actor named "{name}" already exists.',
            }), 400

        try:
            new_actor = Actor(
                name=name,
                age=age,
                gender=gender,
                movie_id=movie_id,
            )
            new_actor.insert()
            return jsonify({
                'success': True,
                'actors': [new_actor.get_actor()],
            })
        except Exception:
            abort(422)

    @app.route('/movies', methods=['POST'])
    @requires_auth('post:movies')
    def post_movie(payload):
        body = request.get_json(silent=True)
        if not body or 'title' not in body:
            abort(422)

        title = (body.get('title') or '').strip()
        if not title:
            abort(422)

        raw_date = body.get('release_date')
        if raw_date in (None, ''):
            release_date = datetime.datetime.utcnow()
        else:
            release_date = _parse_release_date(raw_date)
            if release_date is None:
                abort(422)

        duplicate = Movie.query.filter(Movie.title.ilike(title)).one_or_none()
        if duplicate is not None:
            return jsonify({
                'success': False,
                'error': 400,
                'message': f'A movie titled "{title}" already exists.',
            }), 400

        try:
            new_movie = Movie(title=title, release_date=release_date)
            new_movie.insert()
            return jsonify({
                'success': True,
                'movies': [new_movie.get_movie()],
            })
        except Exception:
            abort(422)

    @app.route('/actors/<int:actor_id>', methods=['PATCH'])
    @requires_auth('patch:actors')
    def update_actor(payload, actor_id):
        actor = Actor.query.filter(Actor.id == actor_id).one_or_none()
        if actor is None:
            abort(404)

        body = request.get_json(silent=True)
        if body is None:
            abort(422)

        if 'name' in body:
            updated_name = (body.get('name') or '').strip()
            if not updated_name:
                abort(422)
            duplicate = Actor.query.filter(
                Actor.name.ilike(updated_name), Actor.id != actor_id
            ).one_or_none()
            if duplicate is not None:
                return jsonify({
                    'success': False,
                    'error': 400,
                    'message': f'An actor named "{updated_name}" already exists.',
                }), 400
            actor.name = updated_name

        if 'age' in body:
            try:
                updated_age = int(body.get('age'))
                if updated_age < 1 or updated_age > 120:
                    abort(422)
                actor.age = updated_age
            except (TypeError, ValueError):
                abort(422)

        if 'gender' in body:
            updated_gender = (body.get('gender') or '').strip()
            if not updated_gender:
                abort(422)
            actor.gender = updated_gender

        if 'movie_id' in body:
            movie_id = body.get('movie_id')
            if movie_id in ('', None):
                actor.movie_id = None
            else:
                try:
                    movie_id = int(movie_id)
                except (TypeError, ValueError):
                    abort(422)
                if db.session.get(Movie, movie_id) is None:
                    abort(404)
                actor.movie_id = movie_id

        try:
            actor.update()
            return jsonify({
                'success': True,
                'actors': [actor.get_actor()],
            })
        except Exception:
            abort(422)

    @app.route('/movies/<int:movie_id>', methods=['PATCH'])
    @requires_auth('patch:movies')
    def update_movie(payload, movie_id):
        movie = Movie.query.filter(Movie.id == movie_id).one_or_none()
        if movie is None:
            abort(404)

        body = request.get_json(silent=True)
        if body is None:
            abort(422)

        if 'title' in body:
            updated_title = (body.get('title') or '').strip()
            if not updated_title:
                abort(422)
            duplicate = Movie.query.filter(
                Movie.title.ilike(updated_title), Movie.id != movie_id
            ).one_or_none()
            if duplicate is not None:
                return jsonify({
                    'success': False,
                    'error': 400,
                    'message': f'A movie titled "{updated_title}" already exists.',
                }), 400
            movie.title = updated_title

        if 'release_date' in body and body.get('release_date') not in (None, ''):
            parsed_date = _parse_release_date(body.get('release_date'))
            if parsed_date is None:
                abort(422)
            movie.release_date = parsed_date

        try:
            movie.update()
            return jsonify({
                'success': True,
                'movies': [movie.get_movie()],
            })
        except Exception:
            abort(422)

    @app.route('/actors/<int:actor_id>', methods=['DELETE'])
    @requires_auth('delete:actors')
    def delete_actor(payload, actor_id):
        selected_actor = Actor.query.filter(Actor.id == actor_id).one_or_none()
        if selected_actor is None:
            abort(404)
        try:
            selected_actor.delete()
            return jsonify({
                'success': True,
                'deleted': actor_id,
            })
        except Exception:
            abort(422)

    @app.route('/movies/<int:movie_id>', methods=['DELETE'])
    @requires_auth('delete:movies')
    def delete_movie(payload, movie_id):
        selected_movie = Movie.query.filter(Movie.id == movie_id).one_or_none()
        if selected_movie is None:
            abort(404)
        try:
            for actor in list(selected_movie.actors):
                actor.movie_id = None
            selected_movie.delete()
            return jsonify({
                'success': True,
                'deleted': movie_id,
            })
        except Exception:
            abort(422)

    # Error Handling
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            'success': False,
            'error': 404,
            'message': 'resource not found',
        }), 404

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({
            'success': False,
            'error': 400,
            'message': 'bad request',
        }), 400

    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({
            'success': False,
            'error': 401,
            'message': 'unauthorized',
        }), 401

    @app.errorhandler(403)
    def forbidden(error):
        return jsonify({
            'success': False,
            'error': 403,
            'message': 'forbidden',
        }), 403

    @app.errorhandler(405)
    def not_allowed(error):
        return jsonify({
            'success': False,
            'error': 405,
            'message': 'method not allowed',
        }), 405

    @app.errorhandler(422)
    def unprocessable(error):
        return jsonify({
            'success': False,
            'error': 422,
            'message': 'unprocessable',
        }), 422

    @app.errorhandler(500)
    def server_error(error):
        return jsonify({
            'success': False,
            'error': 500,
            'message': 'internal server error',
        }), 500

    @app.errorhandler(AuthError)
    def auth_error(error):
        return jsonify({
            'success': False,
            'error': error.status_code,
            'code': error.error['code'],
            'message': error.error['description'],
        }), error.status_code

    return app


APP = create_app()

if __name__ == '__main__':
    APP.run(host='127.0.0.1', port=5000, debug=True)
