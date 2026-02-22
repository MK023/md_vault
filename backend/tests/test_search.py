"""Tests for search, healthz, and system-info endpoints."""


class TestSearch:
    """Tests for GET /api/search."""

    def test_finds_document(self, client, auth_header):
        client.post(
            "/api/docs",
            json={"title": "Python Guide", "content": "Learn Python programming"},
            headers=auth_header,
        )

        resp = client.get("/api/search", params={"q": "Python"}, headers=auth_header)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["title"] == "Python Guide"

    def test_no_results(self, client, auth_header):
        resp = client.get("/api/search", params={"q": "xyznonexistent"}, headers=auth_header)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_empty_query(self, client, auth_header):
        resp = client.get("/api/search", params={"q": ""}, headers=auth_header)
        assert resp.status_code == 422

    def test_special_characters(self, client, auth_header):
        client.post(
            "/api/docs",
            json={"title": "Special Chars", "content": "C++ and C# languages"},
            headers=auth_header,
        )

        resp = client.get("/api/search", params={"q": "C++"}, headers=auth_header)
        assert resp.status_code == 200
        # Should not crash; may or may not find results depending on FTS5 handling

    def test_quotes_in_content(self, client, auth_header):
        client.post(
            "/api/docs",
            json={
                "title": "Quoted Doc",
                "content": 'He said "hello world" to everyone',
            },
            headers=auth_header,
        )

        resp = client.get("/api/search", params={"q": "hello"}, headers=auth_header)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1

    def test_unauthenticated(self, client):
        resp = client.get("/api/search", params={"q": "test"})
        assert resp.status_code == 401


class TestHealthz:
    """Tests for GET /api/healthz."""

    def test_returns_ok(self, client):
        resp = client.get("/api/healthz")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["db"] == "connected"


class TestSystemInfo:
    """Tests for GET /api/system-info."""

    def test_authenticated_returns_data(self, client, auth_header):
        resp = client.get("/api/system-info", headers=auth_header)
        assert resp.status_code == 200
        data = resp.json()
        assert "hostname" in data
        assert "os" in data
        assert "python" in data
        assert "sqlite" in data
        assert "doc_count" in data
        assert "db_size_mb" in data

    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/api/system-info")
        assert resp.status_code == 401
