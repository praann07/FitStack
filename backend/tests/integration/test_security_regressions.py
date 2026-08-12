"""Regression tests for defects found in the 2026-08-12 audit.

Each test below failed against the code as it stood before that audit. They
exist to make sure the specific hole stays closed, so keep them even if the
surrounding endpoints are refactored.
"""

from datetime import date

from tests.conftest import auth_headers, register_user


def _exercise(client, token, name="Barbell Bench Press"):
    res = client.post(
        "/api/v1/exercises",
        json={"name": name, "muscle_group": "chest", "equipment": "barbell"},
        headers=auth_headers(token),
    )
    assert res.status_code == 201, res.text
    return res.json()


def _session_with_set(client, token, exercise_id):
    session = client.post("/api/v1/workouts", json={}, headers=auth_headers(token))
    assert session.status_code == 201, session.text
    session_id = session.json()["id"]
    logged = client.post(
        f"/api/v1/workouts/{session_id}/sets",
        json={"exercise_id": exercise_id, "weight_kg": 100, "reps": 5, "set_type": "normal"},
        headers=auth_headers(token),
    )
    assert logged.status_code == 201, logged.text
    return session_id, logged.json()["set"]["id"]


def test_cannot_delete_another_users_set_via_your_own_session(client):
    """delete_set validated session ownership but then looked the set up by id
    alone, so passing your own session id plus a stranger's set id deleted their
    data and returned 204."""
    victim_token, _ = register_user(client)
    attacker_token, _ = register_user(client)

    exercise = _exercise(client, victim_token)
    victim_session, victim_set = _session_with_set(client, victim_token, exercise["id"])

    attacker_session = client.post("/api/v1/workouts", json={}, headers=auth_headers(attacker_token))
    assert attacker_session.status_code == 201
    attacker_session_id = attacker_session.json()["id"]

    res = client.delete(
        f"/api/v1/workouts/{attacker_session_id}/sets/{victim_set}",
        headers=auth_headers(attacker_token),
    )
    assert res.status_code == 404

    still_there = client.get(f"/api/v1/workouts/{victim_session}", headers=auth_headers(victim_token))
    assert still_there.status_code == 200
    assert still_there.json()["total_sets"] == 1


def test_cannot_update_another_users_set_via_your_own_session(client):
    victim_token, _ = register_user(client)
    attacker_token, _ = register_user(client)

    exercise = _exercise(client, victim_token)
    _, victim_set = _session_with_set(client, victim_token, exercise["id"])

    attacker_session = client.post("/api/v1/workouts", json={}, headers=auth_headers(attacker_token))
    attacker_session_id = attacker_session.json()["id"]

    res = client.patch(
        f"/api/v1/workouts/{attacker_session_id}/sets/{victim_set}",
        json={"reps": 99},
        headers=auth_headers(attacker_token),
    )
    assert res.status_code == 404


def test_cannot_log_another_users_custom_food(client):
    """log_food checked that the food existed but not that the caller could see
    it, so a stranger's private food could be logged -- and its name and macros
    came straight back in the day view."""
    victim_token, _ = register_user(client)
    attacker_token, _ = register_user(client)

    food = client.post(
        "/api/v1/foods",
        json={
            "name": "Victims Secret Recipe",
            "calories_per_100g": 500,
            "protein_per_100g": 10,
            "carbs_per_100g": 40,
            "fat_per_100g": 30,
        },
        headers=auth_headers(victim_token),
    )
    assert food.status_code == 201
    food_id = food.json()["id"]

    res = client.post(
        "/api/v1/nutrition/logs",
        json={
            "food_id": food_id,
            "log_date": date.today().isoformat(),
            "quantity_g": 100,
            "meal_type": "lunch",
        },
        headers=auth_headers(attacker_token),
    )
    assert res.status_code == 404

    day = client.get(
        "/api/v1/nutrition/logs",
        params={"log_date": date.today().isoformat()},
        headers=auth_headers(attacker_token),
    )
    assert day.status_code == 200
    assert day.json()["entries"] == []


def test_explicit_null_goal_rate_is_rejected(client):
    """PATCH /auth/me accepted an explicit null and stored it, after which the
    dashboard raised ResponseValidationError on every request -- an unrecoverable
    500 on the home screen."""
    token, _ = register_user(client)

    res = client.patch(
        "/api/v1/auth/me", json={"goal_rate_kg_week": None}, headers=auth_headers(token)
    )
    assert res.status_code == 422

    dashboard = client.get("/api/v1/dashboard/summary", headers=auth_headers(token))
    assert dashboard.status_code == 200
    assert dashboard.json()["body"]["goal_rate_kg_week"] == -0.5


def test_explicit_null_goal_is_rejected(client):
    token, _ = register_user(client)
    res = client.patch("/api/v1/auth/me", json={"goal": None}, headers=auth_headers(token))
    assert res.status_code == 422


def test_omitting_a_field_still_leaves_it_untouched(client):
    """The null guard must not break partial updates, which is the whole point
    of exclude_unset."""
    token, _ = register_user(client)
    res = client.patch("/api/v1/auth/me", json={"full_name": "Renamed"}, headers=auth_headers(token))
    assert res.status_code == 200
    body = res.json()
    assert body["full_name"] == "Renamed"
    assert body["goal_rate_kg_week"] == -0.5
    assert body["goal"] == "cut"


def test_email_is_case_insensitive(client):
    """Registering VICTIM@ when victim@ existed created a second account, and a
    user who signed up as Bob@ could not log in by typing bob@."""
    _, user = register_user(client, email="Casing@Example.com", password="testpassword123")
    assert user["email"] == "casing@example.com"

    dupe = client.post(
        "/api/v1/auth/register",
        json={
            "email": "CASING@EXAMPLE.COM",
            "password": "testpassword123",
            "goal": "cut",
            "goal_rate_kg_week": -0.5,
            "height_cm": 178,
            "weight_kg": 80,
            "age": 28,
            "sex": "male",
            "activity_level": "moderate",
        },
    )
    assert dupe.status_code == 409

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "cAsInG@eXaMpLe.CoM", "password": "testpassword123"},
    )
    assert login.status_code == 200


def test_security_headers_are_present(client):
    res = client.get("/health")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
