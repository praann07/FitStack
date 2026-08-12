from tests.conftest import auth_headers, register_user


def _create_exercise(client, token, name="Barbell Back Squat", muscle_group="legs"):
    res = client.post(
        "/api/v1/exercises",
        json={"name": name, "muscle_group": muscle_group, "equipment": "barbell"},
        headers=auth_headers(token),
    )
    assert res.status_code == 201
    return res.json()


def _routine_payload(exercise_ids: list[str]) -> dict:
    return {
        "name": "Leg Day",
        "notes": "Heavy squats",
        "exercises": [
            {
                "exercise_id": ex_id,
                "target_sets": 4,
                "target_rep_range": "6-10",
                "target_rpe": 8,
                "rest_seconds": 120,
                "notes": None,
            }
            for ex_id in exercise_ids
        ],
    }


def test_create_list_and_get_routine(client):
    token, _ = register_user(client)
    exercise = _create_exercise(client, token)

    created = client.post(
        "/api/v1/routines", json=_routine_payload([exercise["id"]]), headers=auth_headers(token)
    )
    assert created.status_code == 201, created.text
    routine = created.json()
    assert routine["name"] == "Leg Day"
    assert len(routine["exercises"]) == 1
    assert routine["exercises"][0]["exercise"]["id"] == exercise["id"]

    listing = client.get("/api/v1/routines", headers=auth_headers(token))
    assert [r["id"] for r in listing.json()] == [routine["id"]]

    fetched = client.get(f"/api/v1/routines/{routine['id']}", headers=auth_headers(token))
    assert fetched.status_code == 200
    assert fetched.json()["id"] == routine["id"]


def test_update_routine_replaces_and_reorders_exercises(client):
    token, _ = register_user(client)
    squat = _create_exercise(client, token, "Barbell Back Squat", "legs")
    lunge = _create_exercise(client, token, "Walking Lunge", "legs")

    created = client.post(
        "/api/v1/routines", json=_routine_payload([squat["id"]]), headers=auth_headers(token)
    ).json()

    updated = client.put(
        f"/api/v1/routines/{created['id']}",
        json=_routine_payload([lunge["id"], squat["id"]]),
        headers=auth_headers(token),
    )
    assert updated.status_code == 200
    exercises = updated.json()["exercises"]
    assert [e["exercise_id"] for e in exercises] == [lunge["id"], squat["id"]]
    assert [e["order_index"] for e in exercises] == [0, 1]


def test_routine_not_visible_to_another_user(client):
    owner_token, _ = register_user(client)
    exercise = _create_exercise(client, owner_token)
    routine = client.post(
        "/api/v1/routines", json=_routine_payload([exercise["id"]]), headers=auth_headers(owner_token)
    ).json()

    other_token, _ = register_user(client)
    res = client.get(f"/api/v1/routines/{routine['id']}", headers=auth_headers(other_token))
    assert res.status_code == 404


def test_delete_routine_nulls_reference_on_past_sessions_not_cascade(client):
    token, _ = register_user(client)
    exercise = _create_exercise(client, token)
    routine = client.post(
        "/api/v1/routines", json=_routine_payload([exercise["id"]]), headers=auth_headers(token)
    ).json()

    session = client.post(
        "/api/v1/workouts", json={"routine_id": routine["id"]}, headers=auth_headers(token)
    )
    assert session.status_code == 201
    session_id = session.json()["id"]

    deleted = client.delete(f"/api/v1/routines/{routine['id']}", headers=auth_headers(token))
    assert deleted.status_code == 204

    fetched_session = client.get(f"/api/v1/workouts/{session_id}", headers=auth_headers(token))
    assert fetched_session.status_code == 200
    assert fetched_session.json()["routine_id"] is None
