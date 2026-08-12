from tests.conftest import auth_headers, register_user


def _create_exercise(client, token, **overrides):
    payload = {"name": "Cable Crossover", "muscle_group": "chest", "equipment": "machine", **overrides}
    res = client.post("/api/v1/exercises", json=payload, headers=auth_headers(token))
    assert res.status_code == 201, res.text
    return res.json()


def test_list_and_create_custom_exercise(client):
    token, _ = register_user(client)

    empty = client.get("/api/v1/exercises", headers=auth_headers(token))
    assert empty.status_code == 200
    assert empty.json() == []

    created = _create_exercise(client, token)
    assert created["is_custom"] is True
    assert created["muscle_group"] == "chest"

    listing = client.get("/api/v1/exercises", headers=auth_headers(token))
    assert [e["id"] for e in listing.json()] == [created["id"]]

    filtered = client.get("/api/v1/exercises", params={"muscle_group": "legs"}, headers=auth_headers(token))
    assert filtered.json() == []


def test_duplicate_exercise_name_conflicts_for_the_same_user(client):
    token, _ = register_user(client)
    _create_exercise(client, token)
    dupe = client.post(
        "/api/v1/exercises",
        json={"name": "cable crossover", "muscle_group": "chest"},
        headers=auth_headers(token),
    )
    assert dupe.status_code == 409


def test_custom_exercise_is_scoped_to_its_creator(client):
    owner_token, _ = register_user(client)
    _create_exercise(client, owner_token)

    other_token, _ = register_user(client)
    other_listing = client.get("/api/v1/exercises", headers=auth_headers(other_token))
    assert other_listing.json() == []


def test_history_and_plateau_status_for_an_untrained_exercise(client):
    token, _ = register_user(client)
    exercise = _create_exercise(client, token)

    history = client.get(f"/api/v1/exercises/{exercise['id']}/history", headers=auth_headers(token))
    assert history.status_code == 200
    assert history.json() == []

    # An untrained-but-real exercise still returns a status object (all zeroed
    # out), not None -- None is reserved for a nonexistent exercise_id.
    plateau = client.get(f"/api/v1/exercises/{exercise['id']}/plateau-status", headers=auth_headers(token))
    assert plateau.status_code == 200
    body = plateau.json()
    assert body["is_plateaued"] is False
    assert body["sessions_analysed"] == 0

    missing = client.get("/api/v1/exercises/00000000-0000-0000-0000-000000000000/plateau-status", headers=auth_headers(token))
    assert missing.status_code == 200
    assert missing.json() is None

    all_plateaus = client.get("/api/v1/exercises/plateau-status", headers=auth_headers(token))
    assert all_plateaus.status_code == 200
    assert all_plateaus.json() == []
