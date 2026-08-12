from datetime import date, timedelta

from tests.conftest import auth_headers, register_user


def _create_food(client, token, **overrides):
    payload = {
        "name": "Chicken Breast",
        "brand": None,
        "calories_per_100g": 165,
        "protein_per_100g": 31,
        "carbs_per_100g": 0,
        "fat_per_100g": 3.6,
        "serving_label": None,
        "serving_g": None,
        **overrides,
    }
    res = client.post("/api/v1/foods", json=payload, headers=auth_headers(token))
    assert res.status_code == 201, res.text
    return res.json()


def test_food_crud_and_search(client):
    token, _ = register_user(client)
    food = _create_food(client, token)
    assert food["is_custom"] is True

    dupe = client.post(
        "/api/v1/foods",
        json={
            "name": "chicken breast",
            "calories_per_100g": 165,
            "protein_per_100g": 31,
            "carbs_per_100g": 0,
            "fat_per_100g": 3.6,
        },
        headers=auth_headers(token),
    )
    assert dupe.status_code == 409

    found = client.get("/api/v1/foods", params={"search": "chicken"}, headers=auth_headers(token))
    assert [f["id"] for f in found.json()] == [food["id"]]

    empty_search = client.get("/api/v1/foods", params={"search": "salmon"}, headers=auth_headers(token))
    assert empty_search.json() == []


def test_log_update_and_delete_a_food_entry(client):
    token, _ = register_user(client)
    food = _create_food(client, token)
    today = date.today().isoformat()

    logged = client.post(
        "/api/v1/nutrition/logs",
        json={"food_id": food["id"], "log_date": today, "quantity_g": 200, "meal_type": "lunch"},
        headers=auth_headers(token),
    )
    assert logged.status_code == 201
    log_id = logged.json()["id"]

    day = client.get("/api/v1/nutrition/logs", params={"log_date": today}, headers=auth_headers(token))
    assert day.status_code == 200
    body = day.json()
    assert len(body["entries"]) == 1
    # 200g of 165 kcal/100g = 330 kcal
    assert body["totals"]["calories"] == 330
    assert body["by_meal"]["lunch"]["totals"]["calories"] == 330
    assert body["by_meal"]["dinner"]["entries"] == []

    updated = client.patch(
        f"/api/v1/nutrition/logs/{log_id}", json={"quantity_g": 100}, headers=auth_headers(token)
    )
    assert updated.status_code == 200
    assert updated.json()["quantity_g"] == 100

    invalid = client.patch(
        f"/api/v1/nutrition/logs/{log_id}", json={"quantity_g": 0}, headers=auth_headers(token)
    )
    assert invalid.status_code == 422

    deleted = client.delete(f"/api/v1/nutrition/logs/{log_id}", headers=auth_headers(token))
    assert deleted.status_code == 204

    day_after = client.get("/api/v1/nutrition/logs", params={"log_date": today}, headers=auth_headers(token))
    assert day_after.json()["entries"] == []


def test_copy_day_duplicates_entries_onto_a_new_date(client):
    token, _ = register_user(client)
    food = _create_food(client, token)
    source_date = date.today()
    dest_date = source_date + timedelta(days=1)

    client.post(
        "/api/v1/nutrition/logs",
        json={
            "food_id": food["id"],
            "log_date": source_date.isoformat(),
            "quantity_g": 150,
            "meal_type": "breakfast",
        },
        headers=auth_headers(token),
    )

    copied = client.post(
        "/api/v1/nutrition/logs/copy",
        json={"from_date": source_date.isoformat(), "to_date": dest_date.isoformat()},
        headers=auth_headers(token),
    )
    assert copied.status_code == 200
    assert copied.json() == 1

    dest_day = client.get(
        "/api/v1/nutrition/logs", params={"log_date": dest_date.isoformat()}, headers=auth_headers(token)
    )
    assert len(dest_day.json()["entries"]) == 1


def test_copy_day_404s_when_the_source_day_has_nothing_logged(client):
    token, _ = register_user(client)
    empty_source = date.today() + timedelta(days=30)
    res = client.post(
        "/api/v1/nutrition/logs/copy",
        json={"from_date": empty_source.isoformat(), "to_date": (empty_source + timedelta(days=1)).isoformat()},
        headers=auth_headers(token),
    )
    assert res.status_code == 404


def test_manual_target_overrides_the_registration_baseline(client):
    token, _ = register_user(client)

    manual = client.post(
        "/api/v1/nutrition/targets",
        json={"calories": 2200, "protein_g": 180, "carbs_g": 200, "fat_g": 60},
        headers=auth_headers(token),
    )
    assert manual.status_code == 200
    assert manual.json()["source"] == "manual"

    current = client.get("/api/v1/nutrition/targets/current", headers=auth_headers(token))
    assert current.json()["calories"] == 2200
    assert current.json()["source"] == "manual"

    history = client.get("/api/v1/nutrition/targets", headers=auth_headers(token))
    # Same-day manual target replaces the registration baseline rather than stacking.
    assert len(history.json()) == 1


def test_recompute_without_enough_data_reports_insufficient_history(client):
    token, _ = register_user(client)
    res = client.post("/api/v1/nutrition/targets/recompute", headers=auth_headers(token))
    assert res.status_code == 200
    body = res.json()
    assert body["tdee"] is None
    assert body["suggestion"] is None


def test_dismiss_suggestion_is_idempotent(client):
    token, _ = register_user(client)
    res1 = client.post(
        "/api/v1/nutrition/targets/dismiss", json={"suggestion_id": "sug-does-not-exist"}, headers=auth_headers(token)
    )
    assert res1.status_code == 204
    res2 = client.post(
        "/api/v1/nutrition/targets/dismiss", json={"suggestion_id": "sug-does-not-exist"}, headers=auth_headers(token)
    )
    assert res2.status_code == 204


def test_tdee_history_starts_empty(client):
    token, _ = register_user(client)
    res = client.get("/api/v1/nutrition/tdee-history", headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json() == []
