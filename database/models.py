import os
import datetime
import json
from sqlalchemy import Column, String, Integer, DateTime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def setup_db(app, database_path=None):
    """Bind a Flask application and a SQLAlchemy service."""
    if database_path:
        app.config["SQLALCHEMY_DATABASE_URI"] = database_path
    db.app = app
    db.init_app(app)


def db_drop_and_create_all():
    """Drop all database tables and recreate them fresh."""
    db.drop_all()
    db.create_all()


def db_create_all_and_seed():
    """Create tables if needed and seed initial studio data when empty."""
    db.create_all()
    if Movie.query.count() == 0 and Actor.query.count() == 0:
        sample_movies = [
            Movie(
                title="Midnight Horizon",
                release_date=datetime.datetime(2026, 7, 17)
            ),
            Movie(
                title="The Glass Conservatory",
                release_date=datetime.datetime(2026, 11, 6)
            ),
            Movie(
                title="Echoes of Meridian",
                release_date=datetime.datetime(2027, 2, 19)
            ),
            Movie(
                title="Velvet & Iron",
                release_date=datetime.datetime(2027, 5, 14)
            ),
        ]
        for movie in sample_movies:
            db.session.add(movie)
        db.session.flush()

        sample_actors = [
            Actor(name="Elena Rostova", age=29, gender="Female", movie_id=sample_movies[0].id),
            Actor(name="Marcus Vance", age=41, gender="Male", movie_id=sample_movies[0].id),
            Actor(name="Sora Takahashi", age=26, gender="Non-binary", movie_id=sample_movies[1].id),
            Actor(name="Julian Mercer", age=34, gender="Male", movie_id=sample_movies[2].id),
            Actor(name="Amara Okafor", age=31, gender="Female", movie_id=sample_movies[1].id),
            Actor(name="Liam Thorne", age=23, gender="Male", movie_id=None),
        ]
        for actor in sample_actors:
            db.session.add(actor)

        db.session.commit()


class inheritedCastingModels(db.Model):
    __abstract__ = True

    def insert(self):
        db.session.add(self)
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()

    def update(self):
        db.session.commit()


class Movie(inheritedCastingModels):
    """Persistent movie entity."""

    __tablename__ = "movies"

    id = Column(Integer().with_variant(Integer, "sqlite"), primary_key=True)
    title = Column(String(120), nullable=False)
    release_date = Column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )
    actors = db.relationship("Actor", backref="movies", lazy=True)

    def get_movie(self):
        return {
            "id": self.id,
            "title": self.title,
            "release_date": (
                self.release_date.strftime("%Y-%m-%d")
                if self.release_date
                else None
            ),
            "actors": [
                {
                    "id": actor.id,
                    "name": actor.name,
                    "age": actor.age,
                    "gender": actor.gender,
                }
                for actor in self.actors
            ],
        }

    def __repr__(self):
        return json.dumps(self.get_movie())


class Actor(inheritedCastingModels):
    """Persistent actor entity."""

    __tablename__ = "actors"

    id = Column(Integer().with_variant(Integer, "sqlite"), primary_key=True)
    name = Column(String(120), nullable=False)
    age = Column(Integer(), nullable=False)
    gender = Column(String(80), nullable=False)
    movie_id = Column(Integer(), db.ForeignKey("movies.id"), nullable=True)

    def get_actor(self):
        return {
            "id": self.id,
            "name": self.name,
            "age": self.age,
            "gender": self.gender,
            "movie_id": self.movie_id,
            "movie_title": self.movies.title if self.movies else None,
        }

    def __repr__(self):
        return json.dumps(self.get_actor())
