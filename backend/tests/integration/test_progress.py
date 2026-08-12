from datetime import date, timedelta

from tests.conftest import auth_headers, register_user


def test_save_metric_requires_at_least_one_measurement(client):
    token, _ = register_user(client)
    res = client.post(
        "/api/v1/progress/metrics",
        json={"log_date": date.today().isoformat()},
        headers=auth_headers(token),
    )
    assert res.status_code == 422


def test_save_metric_upserts_on_the_same_day(client):
    token, _ = register_user(client)
    today = date.today().isoformat()

    first = client.post(
        "/api/v1/progress/metrics", json={"log_date": today, "weight_kg": 81.2}, headers=auth_headers(token)
    )
    assert first.status_code == 201

    second = client.post(
        "/api/v1/progress/metrics", json={"log_date": today, "weight_kg": 81.0, "waist_cm": 85}, headers=auth_headers(token)
    )
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["weight_kg"] == 81.0
    assert second.json()["waist_cm"] == 85

    # Registering already seeded a body_metrics row for today, so the upsert above
    # should have updated it, not created a second row.
    listing = client.get("/api/v1/progress/metrics", headers=auth_headers(token))
    assert len(listing.json()) == 1


def test_delete_metric_requires_ownership(client):
    owner_token, _ = register_user(client)
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    metric = client.post(
        "/api/v1/progress/metrics", json={"log_date": yesterday, "weight_kg": 80}, headers=auth_headers(owner_token)
    ).json()

    other_token, _ = register_user(client)
    forbidden = client.delete(f"/api/v1/progress/metrics/{metric['id']}", headers=auth_headers(other_token))
    assert forbidden.status_code == 404

    allowed = client.delete(f"/api/v1/progress/metrics/{metric['id']}", headers=auth_headers(owner_token))
    assert allowed.status_code == 204


def test_trend_endpoint_shape_for_a_fresh_user(client):
    token, _ = register_user(client, weight_kg=80)
    res = client.get("/api/v1/progress/trend", params={"days": 30}, headers=auth_headers(token))
    assert res.status_code == 200
    body = res.json()
    assert len(body["points"]) == 30
    assert body["points"][-1]["weight_kg"] == 80
    assert "weekly_volume" in body
