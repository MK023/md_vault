"""Tests for authentication endpoints."""

from datetime import datetime, timedelta, timezone

import jwt


class TestLogin:
    """Tests for POST /api/auth/login."""

    def test_login_success(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "testpass123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrongpass"},
        )
        assert resp.status_code == 401

    def test_login_wrong_username(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"username": "nonexistent", "password": "testpass123"},
        )
        assert resp.status_code == 401

    def test_login_empty_body(self, client):
        resp = client.post("/api/auth/login", json={})
        assert resp.status_code == 422


class TestRateLimit:
    """Tests for login rate limiting."""

    def test_blocks_after_10_attempts(self, client):
        from backend.routers.auth import _login_attempts

        _login_attempts.clear()

        for i in range(10):
            resp = client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "wrongpass"},
            )
            assert resp.status_code == 401, f"Attempt {i + 1} should be 401"

        # 11th attempt should be rate limited
        resp = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrongpass"},
        )
        assert resp.status_code == 429

    def test_successful_login_clears_limit(self, client):
        from backend.routers.auth import _login_attempts

        _login_attempts.clear()

        # Make some failed attempts
        for _ in range(5):
            client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "wrongpass"},
            )

        # Successful login should clear the counter
        resp = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "testpass123"},
        )
        assert resp.status_code == 200

        # Should be able to make more failed attempts now without hitting limit
        for _ in range(5):
            resp = client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "wrongpass"},
            )
            assert resp.status_code == 401


class TestChangePassword:
    """Tests for PUT /api/auth/password."""

    def test_change_password_works(self, client, auth_header):
        # Change password
        resp = client.put(
            "/api/auth/password",
            json={"username": "admin", "password": "newpass456"},
            headers=auth_header,
        )
        assert resp.status_code == 204

        # Old password should fail
        resp = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "testpass123"},
        )
        assert resp.status_code == 401

        # New password should work
        resp = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "newpass456"},
        )
        assert resp.status_code == 200

    def test_forbid_changing_other_user(self, client, auth_header):
        resp = client.put(
            "/api/auth/password",
            json={"username": "otheruser", "password": "newpass456"},
            headers=auth_header,
        )
        assert resp.status_code == 403

    def test_unauthenticated_returns_401(self, client):
        resp = client.put(
            "/api/auth/password",
            json={"username": "admin", "password": "newpass456"},
        )
        assert resp.status_code == 401


class TestTokenValidation:
    """Tests for token validation."""

    def test_expired_token_returns_401(self, client):
        secret = "test-secret-key-for-testing-minimum-32-bytes"
        payload = {
            "sub": "admin",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "iat": datetime.now(timezone.utc) - timedelta(hours=2),
        }
        expired_token = jwt.encode(payload, secret, algorithm="HS256")
        resp = client.get(
            "/api/system-info",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, client):
        resp = client.get(
            "/api/system-info",
            headers={"Authorization": "Bearer this-is-not-a-valid-jwt-token"},
        )
        assert resp.status_code == 401

    def test_no_token_returns_401(self, client):
        resp = client.get("/api/system-info")
        assert resp.status_code == 401
