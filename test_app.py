import json
import os
import unittest

from app import create_app
from database.models import Actor, Movie

database_name = "capstone_test.db"
project_dir = os.path.dirname(os.path.abspath(__file__))
database_path = "sqlite:///{}".format(os.path.join(project_dir, database_name))

casting_assistant_token = os.getenv("CASTING_ASSISTANT_JWT") or "demo:casting_assistant"
casting_director_token = os.getenv("CASTING_DIRECTOR_JWT") or "demo:casting_director"
executive_producer_token = os.getenv("EXECUTIVE_PRODUCER_JWT") or "demo:executive_producer"


def setup_auth(role):
    if role == "casting_assistant":
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {casting_assistant_token}",
        }
    if role == "casting_director":
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {casting_director_token}",
        }
    if role == "executive_producer":
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {executive_producer_token}",
        }
    return {"Content-Type": "application/json"}


class CastingTestCase(unittest.TestCase):
    """Test suite for the Casting Agency website and REST API."""

    def setUp(self):
        self.app = create_app(
            {
                "TESTING": True,
                "WTF_CSRF_ENABLED": False,
                "DEBUG": False,
                "SQLALCHEMY_DATABASE_URI": database_path,
                "RESET_DB": True,
            }
        )
        self.client = self.app.test_client

        self.new_actor1 = {
            "name": "Test Actor 1",
            "age": 24,
            "gender": "Female",
        }
        self.new_actor2 = {
            "name": "Test Actor 2",
            "age": 28,
            "gender": "Male",
        }
        self.new_movie1 = {
            "title": "The Test Movie 1",
            "release_date": "2026-10-15",
        }
        self.new_movie2 = {
            "title": "The Test Movie 2",
            "release_date": "2027-01-20",
        }

        self.client().post(
            "/actors",
            json=self.new_actor1,
            headers=setup_auth("executive_producer"),
        )
        self.client().post(
            "/movies",
            json=self.new_movie1,
            headers=setup_auth("executive_producer"),
        )

    def tearDown(self):
        pass

    # Website & Health routes
    def test_website_home_renders_html(self):
        res = self.client().get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"Casting Agency", res.data)

    def test_health_and_auth_config(self):
        res = self.client().get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(json.loads(res.data)["success"])

        cfg_res = self.client().get("/auth/config")
        self.assertEqual(cfg_res.status_code, 200)
        cfg = json.loads(cfg_res.data)
        self.assertTrue(cfg["success"])
        self.assertIn("executive_producer", cfg["roles"])

    # Actor Tests
    def test_get_actors_casting_assistant(self):
        res = self.client().get("/actors", headers=setup_auth("casting_assistant"))
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data["success"])
        self.assertTrue(len(data["actors"]) >= 1)

    def test_get_actors_casting_director(self):
        res = self.client().get("/actors", headers=setup_auth("casting_director"))
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data["success"])

    def test_get_actors_executive_producer(self):
        res = self.client().get("/actors", headers=setup_auth("executive_producer"))
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data["success"])

    def test_401_get_actor_fail(self):
        res = self.client().get("/actors", headers=setup_auth(""))
        self.assertEqual(res.status_code, 401)

    def test_post_actor_casting_assistant(self):
        res = self.client().post(
            "/actors", json=self.new_actor2, headers=setup_auth("casting_assistant")
        )
        self.assertEqual(res.status_code, 403)

    def test_post_actor_casting_director(self):
        res = self.client().post(
            "/actors", json=self.new_actor2, headers=setup_auth("casting_director")
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(len(data["actors"]), 1)

    def test_post_actor_executive_producer(self):
        res = self.client().post(
            "/actors", json=self.new_actor2, headers=setup_auth("executive_producer")
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data["success"])

    def test_422_post_actors_fail(self):
        res = self.client().post(
            "/actors", json={}, headers=setup_auth("casting_director")
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 422)
        self.assertFalse(data["success"])

    def test_patch_actor_casting_assistant(self):
        res = self.client().patch(
            "/actors/1", json={"age": 25}, headers=setup_auth("casting_assistant")
        )
        self.assertEqual(res.status_code, 403)

    def test_patch_actor_casting_director(self):
        self.client().post(
            "/actors", json=self.new_actor2, headers=setup_auth("executive_producer")
        )
        res = self.client().patch(
            "/actors/2",
            json={"age": 25, "movie_id": 1},
            headers=setup_auth("casting_director"),
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["actors"][0]["age"], 25)
        self.assertEqual(data["actors"][0]["movie_id"], 1)

    def test_404_patch_actor_fail(self):
        res = self.client().patch(
            "/actors/100", json={}, headers=setup_auth("executive_producer")
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 404)
        self.assertFalse(data["success"])

    def test_delete_actor_casting_assistant(self):
        res = self.client().delete(
            "/actors/1", headers=setup_auth("casting_assistant")
        )
        self.assertEqual(res.status_code, 403)

    def test_delete_actor_casting_director(self):
        self.client().post(
            "/actors", json=self.new_actor2, headers=setup_auth("executive_producer")
        )
        res = self.client().delete(
            "/actors/2", headers=setup_auth("casting_director")
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(int(data["deleted"]), 2)
        with self.app.app_context():
            self.assertIsNone(Actor.query.filter(Actor.id == 2).one_or_none())

    def test_401_delete_actor_fail(self):
        res = self.client().delete("/actors/1", headers=setup_auth(""))
        self.assertEqual(res.status_code, 401)

    # Movie Tests
    def test_get_movies_casting_assistant(self):
        res = self.client().get("/movies", headers=setup_auth("casting_assistant"))
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data["success"])
        self.assertTrue(len(data["movies"]) >= 1)

    def test_401_get_movie_fail(self):
        res = self.client().get("/movies", headers=setup_auth(""))
        self.assertEqual(res.status_code, 401)

    def test_post_movie_casting_assistant(self):
        res = self.client().post(
            "/movies", json=self.new_movie2, headers=setup_auth("casting_assistant")
        )
        self.assertEqual(res.status_code, 403)

    def test_post_movie_casting_director(self):
        res = self.client().post(
            "/movies", json=self.new_movie2, headers=setup_auth("casting_director")
        )
        self.assertEqual(res.status_code, 403)

    def test_post_movie_executive_producer(self):
        res = self.client().post(
            "/movies", json=self.new_movie2, headers=setup_auth("executive_producer")
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["movies"][0]["release_date"], "2027-01-20")

    def test_422_post_movies_fail(self):
        res = self.client().post(
            "/movies", json={}, headers=setup_auth("executive_producer")
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 422)
        self.assertFalse(data["success"])

    def test_patch_movie_casting_assistant(self):
        res = self.client().patch(
            "/movies/1",
            json={"title": "updated_movie"},
            headers=setup_auth("casting_assistant"),
        )
        self.assertEqual(res.status_code, 403)

    def test_patch_movie_casting_director(self):
        res = self.client().patch(
            "/movies/1",
            json={"title": "updated_movie1"},
            headers=setup_auth("casting_director"),
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["movies"][0]["title"], "updated_movie1")

    def test_404_patch_movie_fail(self):
        res = self.client().patch(
            "/movies/500", json={}, headers=setup_auth("executive_producer")
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 404)
        self.assertFalse(data["success"])

    def test_delete_movie_casting_assistant(self):
        res = self.client().delete(
            "/movies/1", headers=setup_auth("casting_assistant")
        )
        self.assertEqual(res.status_code, 403)

    def test_delete_movie_casting_director(self):
        res = self.client().delete(
            "/movies/1", headers=setup_auth("casting_director")
        )
        self.assertEqual(res.status_code, 403)

    def test_delete_movie_executive_producer(self):
        res = self.client().delete(
            "/movies/1", headers=setup_auth("executive_producer")
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data["success"])
        self.assertEqual(int(data["deleted"]), 1)
        with self.app.app_context():
            self.assertIsNone(Movie.query.filter(Movie.id == 1).one_or_none())

    def test_401_delete_movie_fail(self):
        res = self.client().delete("/movies/1", headers=setup_auth(""))
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
