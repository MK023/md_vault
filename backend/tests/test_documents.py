"""Tests for document CRUD endpoints."""

import io


class TestListDocuments:
    """Tests for GET /api/docs."""

    def test_empty_list(self, client, auth_header):
        resp = client.get("/api/docs", headers=auth_header)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_documents(self, client, auth_header):
        # Create a document with content
        client.post(
            "/api/docs",
            json={
                "title": "Test Doc",
                "content": "This is detailed content",
                "project": "proj1",
                "tags": "tag1,tag2",
            },
            headers=auth_header,
        )

        resp = client.get("/api/docs", headers=auth_header)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "Test Doc"
        # List response should NOT include content field
        assert "content" not in data[0]


class TestCreateDocument:
    """Tests for POST /api/docs."""

    def test_full_create(self, client, auth_header):
        resp = client.post(
            "/api/docs",
            json={
                "title": "Full Doc",
                "content": "Full content here",
                "project": "myproject",
                "tags": "alpha,beta",
            },
            headers=auth_header,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Full Doc"
        assert data["content"] == "Full content here"
        assert data["project"] == "myproject"
        assert data["tags"] == ["alpha", "beta"]
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_minimal_create(self, client, auth_header):
        resp = client.post(
            "/api/docs",
            json={"title": "Minimal Doc", "content": ""},
            headers=auth_header,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Minimal Doc"
        assert data["project"] is None
        assert data["tags"] == []

    def test_unauthenticated(self, client):
        resp = client.post(
            "/api/docs",
            json={"title": "No Auth", "content": "test"},
        )
        assert resp.status_code == 401


class TestGetDocument:
    """Tests for GET /api/docs/{doc_id}."""

    def test_existing(self, client, auth_header):
        create_resp = client.post(
            "/api/docs",
            json={"title": "Get Me", "content": "body text"},
            headers=auth_header,
        )
        doc_id = create_resp.json()["id"]

        resp = client.get(f"/api/docs/{doc_id}", headers=auth_header)
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Get Me"
        assert data["content"] == "body text"

    def test_nonexistent(self, client, auth_header):
        resp = client.get("/api/docs/99999", headers=auth_header)
        assert resp.status_code == 404


class TestUpdateDocument:
    """Tests for PUT /api/docs/{doc_id}."""

    def test_partial_update(self, client, auth_header):
        create_resp = client.post(
            "/api/docs",
            json={
                "title": "Original Title",
                "content": "Original content",
                "project": "proj1",
            },
            headers=auth_header,
        )
        doc_id = create_resp.json()["id"]

        # Update only the title
        resp = client.put(
            f"/api/docs/{doc_id}",
            json={"title": "Updated Title"},
            headers=auth_header,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Updated Title"
        # Unchanged fields should be preserved
        assert data["content"] == "Original content"
        assert data["project"] == "proj1"

    def test_nonexistent(self, client, auth_header):
        resp = client.put(
            "/api/docs/99999",
            json={"title": "Nope"},
            headers=auth_header,
        )
        assert resp.status_code == 404


class TestDeleteDocument:
    """Tests for DELETE /api/docs/{doc_id}."""

    def test_delete_works(self, client, auth_header):
        create_resp = client.post(
            "/api/docs",
            json={"title": "Delete Me", "content": "bye"},
            headers=auth_header,
        )
        doc_id = create_resp.json()["id"]

        resp = client.delete(f"/api/docs/{doc_id}", headers=auth_header)
        assert resp.status_code == 204

        # Verify it is gone
        resp = client.get(f"/api/docs/{doc_id}", headers=auth_header)
        assert resp.status_code == 404

    def test_nonexistent(self, client, auth_header):
        resp = client.delete("/api/docs/99999", headers=auth_header)
        assert resp.status_code == 404


class TestFileUpload:
    """Tests for file upload and download."""

    def test_text_file(self, client, auth_header):
        file_content = b"Hello, this is a test file."
        resp = client.post(
            "/api/docs/upload",
            files={"file": ("test.txt", io.BytesIO(file_content), "text/plain")},
            data={"project": "uploads", "tags": "file,test"},
            headers=auth_header,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "test"
        assert data["file_name"] == "test.txt"
        # Text file content should be extracted
        assert data["content"] == "Hello, this is a test file."

    def test_binary_file(self, client, auth_header):
        binary_data = bytes(range(256))
        resp = client.post(
            "/api/docs/upload",
            files={"file": ("image.png", io.BytesIO(binary_data), "image/png")},
            headers=auth_header,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["file_name"] == "image.png"
        # Binary file should have empty content
        assert data["content"] == ""

    def test_disallowed_extension(self, client, auth_header):
        resp = client.post(
            "/api/docs/upload",
            files={"file": ("evil.exe", io.BytesIO(b"bad"), "application/octet-stream")},
            headers=auth_header,
        )
        assert resp.status_code == 400

    def test_download_file(self, client, auth_header):
        file_content = b"Download me!"
        upload_resp = client.post(
            "/api/docs/upload",
            files={"file": ("dl.txt", io.BytesIO(file_content), "text/plain")},
            headers=auth_header,
        )
        doc_id = upload_resp.json()["id"]

        resp = client.get(f"/api/docs/{doc_id}/file", headers=auth_header)
        assert resp.status_code == 200
        assert resp.content == file_content

    def test_download_no_file_doc(self, client, auth_header):
        # Create a document without a file attachment
        create_resp = client.post(
            "/api/docs",
            json={"title": "No File", "content": "just text"},
            headers=auth_header,
        )
        doc_id = create_resp.json()["id"]

        resp = client.get(f"/api/docs/{doc_id}/file", headers=auth_header)
        assert resp.status_code == 404


class TestTags:
    """Tests for GET /api/docs/meta/tags."""

    def test_list_unique_tags(self, client, auth_header):
        client.post(
            "/api/docs",
            json={"title": "Doc1", "content": "a", "tags": "python,fastapi"},
            headers=auth_header,
        )
        client.post(
            "/api/docs",
            json={"title": "Doc2", "content": "b", "tags": "python,vue"},
            headers=auth_header,
        )

        resp = client.get("/api/docs/meta/tags", headers=auth_header)
        assert resp.status_code == 200
        tags = resp.json()
        assert sorted(tags) == ["fastapi", "python", "vue"]
