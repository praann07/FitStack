from datetime import date

from tests.conftest import auth_headers, register_user


def test_register_seeds_baseline_target_and_body_metric(client):
    token, user = register_user(client, weight_kg=80, height_cm=178, age=28, sex="male", activity_level="moderate")

    target_res = client.get("/api/v1/nutrition/targets/current", headers=auth_headers(token))
    assert target_res.status_code == 200
    target = target_res.json()
    assert target is not None
    assert target["source"] == "adaptive"
    assert target["calories"] > 0
    assert target["protein_g"] > 0

    metrics_res = client.get("/api/v1/progress/metrics", headers=auth_headers(token))
    assert metrics_res.status_code == 200
    metrics = metrics_res.json()
    assert len(metrics) == 1
    assert metrics[0]["weight_kg"] == 80
    assert metrics[0]["log_date"] == date.today().isoformat()

    assert user["goal"] == "cut"


def test_register_duplicate_email_conflicts(client):
    _, user = register_user(client)
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": user["email"],
            "password": "anotherpassword1",
            "goal": "bulk",
            "goal_rate_kg_week": 0.25,
            "height_cm": 175,
            "weight_kg": 75,
            "age": 30,
            "sex": "male",
            "activity_level": "light",
        },
    )
    assert res.status_code == 409


def test_login_success_and_wrong_password(client):
    _, user = register_user(client, email="login-test@example.com", password="correcthorse1")

    ok = client.post("/api/v1/auth/login", json={"email": user["email"], "password": "correcthorse1"})
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    bad = client.post("/api/v1/auth/login", json={"email": user["email"], "password": "wrongpassword"})
    assert bad.status_code == 401


def test_refresh_rotates_token_and_invalidates_the_old_one(client):
    register_user(client)
    old_refresh_cookie = client.cookies.get("refresh_token")

    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]
    assert client.cookies.get("refresh_token") != old_refresh_cookie

    # Replaying the pre-rotation refresh cookie must now fail.
    client.cookies.set("refresh_token", old_refresh_cookie)
    replay = client.post("/api/v1/auth/refresh")
    assert replay.status_code == 401


def test_refresh_without_cookie_is_unauthorized(client):
    client.cookies.clear()
    res = client.post("/api/v1/auth/refresh")
    assert res.status_code == 401


def test_logout_revokes_the_refresh_token(client):
    register_user(client)
    logout_res = client.post("/api/v1/auth/logout")
    assert logout_res.status_code == 204

    replay = client.post("/api/v1/auth/refresh")
    assert replay.status_code == 401


def test_me_requires_auth(client):
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401


def test_me_returns_current_user(client):
    token, user = register_user(client)
    res = client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["id"] == user["id"]


def test_update_me_goal_change_clears_tdee_estimates_and_dismissals(client, db_session):
    from app.models.nutrition import DismissedSuggestion, TdeeEstimate

    token, user = register_user(client, goal="cut")

    db_session.add(
        TdeeEstimate(
            user_id=user["id"], estimate_date=date.today(), estimated_tdee=2500, weight_trend_kg=80, confidence="low"
        )
    )
    db_session.add(DismissedSuggestion(user_id=user["id"], suggestion_id="sug-test"))
    db_session.commit()

    res = client.patch("/api/v1/auth/me", json={"goal": "bulk"}, headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["goal"] == "bulk"

    assert db_session.query(TdeeEstimate).filter_by(user_id=user["id"]).count() == 0
    assert db_session.query(DismissedSuggestion).filter_by(user_id=user["id"]).count() == 0


def test_auth_endpoints_rate_limit_after_five_requests_per_minute(client):
    for _ in range(5):
        res = client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong"})
        assert res.status_code == 401

    limited = client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong"})
    assert limited.status_code == 429
