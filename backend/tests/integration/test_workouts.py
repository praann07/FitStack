from tests.conftest import auth_headers, register_user


def _create_exercise(client, token, name="Barbell Bench Press", muscle_group="chest"):
    res = client.post(
        "/api/v1/exercises",
        json={"name": name, "muscle_group": muscle_group, "equipment": "barbell"},
        headers=auth_headers(token),
    )
    assert res.status_code == 201
    return res.json()


def _start_session(client, token):
    res = client.post("/api/v1/workouts", json={}, headers=auth_headers(token))
    assert res.status_code == 201
    return res.json()


def _log_set(client, token, session_id, exercise_id, weight_kg, reps, set_type="normal"):
    res = client.post(
        f"/api/v1/workouts/{session_id}/sets",
        json={"exercise_id": exercise_id, "weight_kg": weight_kg, "reps": reps, "set_type": set_type},
        headers=auth_headers(token),
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_start_session_rejects_a_second_concurrent_session(client):
    token, _ = register_user(client)
    _start_session(client, token)
    second = client.post("/api/v1/workouts", json={}, headers=auth_headers(token))
    assert second.status_code == 409


def test_log_set_flags_the_first_qualifying_set_as_a_pr(client):
    token, _ = register_user(client)
    exercise = _create_exercise(client, token)
    session = _start_session(client, token)

    result = _log_set(client, token, session["id"], exercise["id"], weight_kg=80, reps=5)
    assert result["is_pr"] is True


def test_warmup_sets_never_count_as_a_pr_regardless_of_weight(client):
    token, _ = register_user(client)
    exercise = _create_exercise(client, token)
    session = _start_session(client, token)

    result = _log_set(client, token, session["id"], exercise["id"], weight_kg=500, reps=1, set_type="warmup")
    assert result["is_pr"] is False


def test_editing_a_set_retriggers_pr_recompute_for_later_sets(client):
    token, _ = register_user(client)
    exercise = _create_exercise(client, token)
    session = _start_session(client, token)
    sid = session["id"]

    set_a = _log_set(client, token, sid, exercise["id"], 80, 5)["set"]
    set_b = _log_set(client, token, sid, exercise["id"], 100, 5)["set"]
    set_c = _log_set(client, token, sid, exercise["id"], 90, 5)["set"]

    detail = client.get(f"/api/v1/workouts/{sid}", headers=auth_headers(token)).json()
    flags_by_id = {s["id"]: s["is_pr"] for group in detail["groups"] for s in group["sets"]}
    assert flags_by_id[set_a["id"]] is True
    assert flags_by_id[set_b["id"]] is True
    assert flags_by_id[set_c["id"]] is False  # 90 doesn't beat B's 100

    # Lower B below C's e1RM -> C should now qualify as the new best.
    edited = client.patch(
        f"/api/v1/workouts/{sid}/sets/{set_b['id']}", json={"weight_kg": 85}, headers=auth_headers(token)
    )
    assert edited.status_code == 200

    detail_after = client.get(f"/api/v1/workouts/{sid}", headers=auth_headers(token)).json()
    flags_after = {s["id"]: s["is_pr"] for group in detail_after["groups"] for s in group["sets"]}
    assert flags_after[set_a["id"]] is True
    assert flags_after[set_b["id"]] is True
    assert flags_after[set_c["id"]] is True


def test_delete_set_renumbers_remaining_sets_for_that_exercise(client):
    token, _ = register_user(client)
    exercise = _create_exercise(client, token)
    session = _start_session(client, token)
    sid = session["id"]

    set_1 = _log_set(client, token, sid, exercise["id"], 80, 5)["set"]
    set_2 = _log_set(client, token, sid, exercise["id"], 85, 5)["set"]
    assert set_2["set_number"] == 2

    deleted = client.delete(f"/api/v1/workouts/{sid}/sets/{set_1['id']}", headers=auth_headers(token))
    assert deleted.status_code == 204

    detail = client.get(f"/api/v1/workouts/{sid}", headers=auth_headers(token)).json()
    remaining = detail["groups"][0]["sets"]
    assert len(remaining) == 1
    assert remaining[0]["id"] == set_2["id"]
    assert remaining[0]["set_number"] == 1


def test_complete_session_requires_at_least_one_set(client):
    token, _ = register_user(client)
    session = _start_session(client, token)
    res = client.patch(f"/api/v1/workouts/{session['id']}/complete", json={}, headers=auth_headers(token))
    assert res.status_code == 422


def test_complete_session_then_it_appears_in_history(client):
    token, _ = register_user(client)
    exercise = _create_exercise(client, token)
    session = _start_session(client, token)
    _log_set(client, token, session["id"], exercise["id"], 80, 5)

    completed = client.patch(
        f"/api/v1/workouts/{session['id']}/complete", json={"notes": "solid"}, headers=auth_headers(token)
    )
    assert completed.status_code == 200
    assert completed.json()["ended_at"] is not None

    history = client.get("/api/v1/workouts", headers=auth_headers(token))
    assert [s["id"] for s in history.json()] == [session["id"]]


def test_discard_session_removes_it_and_its_sets(client):
    token, _ = register_user(client)
    exercise = _create_exercise(client, token)
    session = _start_session(client, token)
    _log_set(client, token, session["id"], exercise["id"], 80, 5)

    discarded = client.delete(f"/api/v1/workouts/{session['id']}", headers=auth_headers(token))
    assert discarded.status_code == 204

    fetched = client.get(f"/api/v1/workouts/{session['id']}", headers=auth_headers(token))
    assert fetched.status_code == 404


def test_weekly_volume_reflects_a_completed_session(client):
    token, _ = register_user(client)
    exercise = _create_exercise(client, token, muscle_group="chest")
    session = _start_session(client, token)
    _log_set(client, token, session["id"], exercise["id"], 100, 5)
    client.patch(f"/api/v1/workouts/{session['id']}/complete", json={}, headers=auth_headers(token))

    res = client.get("/api/v1/volume/weekly", params={"weeks": 1}, headers=auth_headers(token))
    assert res.status_code == 200
    week = res.json()[0]
    assert week["total_volume_kg"] == 500  # 100kg x 5 reps
    assert week["by_muscle_group"]["chest"] == 500
    assert week["sessions"] == 1
