(function () {
    "use strict";

    const API = "/api";
    let token = sessionStorage.getItem("md_vault_token");
    let documents = [];
    let currentDocId = null;
    let editingDocId = null;
    var pendingFolderAction = null;

    // --- DOM refs ---
    const loginOverlay = document.getElementById("login-overlay");
    const mainWindow = document.getElementById("main-window");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const loginBtn = document.getElementById("login-btn");
    const loginError = document.getElementById("login-error");
    const logoutBtn = document.getElementById("logout-btn");
    const treeContainer = document.getElementById("tree-container");
    const docContainer = document.getElementById("doc-container");
    const statusCount = document.getElementById("status-count");
    const searchInput = document.getElementById("search-input");
    const searchBtn = document.getElementById("search-btn");
    const menuNew = document.getElementById("menu-new");
    const menuEdit = document.getElementById("menu-edit");
    const menuView = document.getElementById("menu-view");
    const menuHelp = document.getElementById("menu-help");
    const dropdownFile = document.getElementById("dropdown-file");
    const dropdownEdit = document.getElementById("dropdown-edit");
    const dropdownView = document.getElementById("dropdown-view");
    const dropdownHelp = document.getElementById("dropdown-help");
    const allDropdowns = [dropdownFile, dropdownEdit, dropdownView, dropdownHelp];
    const btnNewDoc = document.getElementById("btn-new-doc");
    const btnRefresh = document.getElementById("btn-refresh");
    const btnLogout = document.getElementById("btn-logout");
    const editorOverlay = document.getElementById("editor-overlay");
    const editorTitle = document.getElementById("editor-title");
    const docTitleInput = document.getElementById("doc-title");
    const docProjectInput = document.getElementById("doc-project");
    const docTagsInput = document.getElementById("doc-tags");
    const docContentInput = document.getElementById("doc-content");
    const editorSave = document.getElementById("editor-save");
    const editorCancel = document.getElementById("editor-cancel");
    const editorClose = document.getElementById("editor-close");
    const deleteOverlay = document.getElementById("delete-overlay");
    const deleteMsg = document.getElementById("delete-msg");
    const deleteYes = document.getElementById("delete-yes");
    const deleteNo = document.getElementById("delete-no");
    const resizeHandle = document.getElementById("resize-handle");
    const treePanel = document.getElementById("tree-panel");

    // --- Safe HTML rendering ---
    function sanitize(html) {
        return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["mark"] });
    }

    function setDocContainerContent(elements) {
        docContainer.textContent = "";
        elements.forEach(function (el) {
            docContainer.appendChild(el);
        });
    }

    function renderMarkdownSafe(markdownText) {
        var rawHtml = marked.parse(markdownText);
        return DOMPurify.sanitize(rawHtml);
    }

    // --- Fetch helper ---
    async function apiFetch(path, opts = {}) {
        const headers = opts.headers || {};
        if (token) headers["Authorization"] = "Bearer " + token;
        if (opts.body && typeof opts.body === "object") {
            headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify(opts.body);
        }
        const res = await fetch(API + path, { ...opts, headers });
        if (res.status === 401) {
            sessionStorage.removeItem("md_vault_token");
            token = null;
            showLogin();
            throw new Error("Unauthorized");
        }
        return res;
    }

    // --- Auth ---
    function showLogin() {
        loginOverlay.style.display = "flex";
        mainWindow.style.display = "none";
        loginError.textContent = "";
        passwordInput.value = "";
        passwordInput.focus();
    }

    function showMain() {
        loginOverlay.style.display = "none";
        mainWindow.style.display = "flex";
        loadDocuments();
    }

    loginBtn.addEventListener("click", doLogin);
    passwordInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") doLogin();
    });

    async function doLogin() {
        loginError.textContent = "";
        try {
            const res = await fetch(API + "/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: usernameInput.value,
                    password: passwordInput.value,
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                loginError.textContent = data.detail || "Login failed";
                return;
            }
            const data = await res.json();
            token = data.access_token;
            sessionStorage.setItem("md_vault_token", token);
            showMain();
        } catch (err) {
            loginError.textContent = "Connection error";
        }
    }

    logoutBtn.addEventListener("click", doLogout);
    btnLogout.addEventListener("click", doLogout);

    function doLogout() {
        sessionStorage.removeItem("md_vault_token");
        token = null;
        closeAllMenus();
        showLogin();
    }

    // --- Menu (Win95-style: click to open, hover to switch) ---
    var menuOpen = false;
    var menuButtons = [
        { btn: menuNew, dd: dropdownFile },
        { btn: menuEdit, dd: dropdownEdit },
        { btn: menuView, dd: dropdownView },
        { btn: menuHelp, dd: dropdownHelp },
    ];

    function closeAllMenus() {
        allDropdowns.forEach(function (d) { d.classList.remove("show"); });
        menuOpen = false;
    }

    function openMenu(btn, dropdown) {
        closeAllMenus();
        dropdown.style.left = btn.offsetLeft + "px";
        dropdown.classList.add("show");
        menuOpen = true;
    }

    menuButtons.forEach(function (item) {
        item.btn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (item.dd.classList.contains("show")) {
                closeAllMenus();
            } else {
                openMenu(item.btn, item.dd);
            }
        });
        // Hover to switch when a menu is already open
        item.btn.addEventListener("mouseenter", function () {
            if (menuOpen) {
                openMenu(item.btn, item.dd);
            }
        });
    });

    document.addEventListener("click", closeAllMenus);

    btnNewDoc.addEventListener("click", function () {
        closeAllMenus();
        openEditor(null);
    });

    // New Folder
    var folderOverlay = document.getElementById("folder-overlay");
    var folderNameInput = document.getElementById("folder-name");
    var emptyFolders = [];

    document.getElementById("btn-new-folder").addEventListener("click", function () {
        closeAllMenus();
        pendingFolderAction = null;
        folderNameInput.value = "";
        folderOverlay.style.display = "flex";
        folderNameInput.focus();
    });

    function handleFolderOk() {
        if (pendingFolderAction) {
            pendingFolderAction();
            pendingFolderAction = null;
        } else {
            // Default: create new folder
            var name = folderNameInput.value.trim();
            if (!name) return;
            if (!emptyFolders.includes(name)) {
                emptyFolders.push(name);
            }
            renderTree();
        }
        folderOverlay.style.display = "none";
    }

    document.getElementById("folder-ok").addEventListener("click", handleFolderOk);
    folderNameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") handleFolderOk();
    });

    function closeFolderDialog() {
        folderOverlay.style.display = "none";
        pendingFolderAction = null;
    }

    document.getElementById("folder-cancel").addEventListener("click", closeFolderDialog);
    document.getElementById("folder-close").addEventListener("click", closeFolderDialog);

    // Upload file
    var uploadOverlay = document.getElementById("upload-overlay");
    var uploadFileInput = document.getElementById("upload-file");
    var uploadProjectInput = document.getElementById("upload-project");
    var uploadTagsInput = document.getElementById("upload-tags");
    var uploadError = document.getElementById("upload-error");

    document.getElementById("btn-upload").addEventListener("click", function () {
        closeAllMenus();
        uploadFileInput.value = "";
        uploadProjectInput.value = "";
        uploadTagsInput.value = "";
        uploadError.textContent = "";
        uploadOverlay.style.display = "flex";
    });

    document.getElementById("upload-ok").addEventListener("click", doUpload);
    document.getElementById("upload-cancel").addEventListener("click", function () {
        uploadOverlay.style.display = "none";
    });
    document.getElementById("upload-close").addEventListener("click", function () {
        uploadOverlay.style.display = "none";
    });

    async function doUpload() {
        var file = uploadFileInput.files[0];
        if (!file) {
            uploadError.textContent = "Select a file first";
            return;
        }
        uploadError.textContent = "Uploading...";
        var formData = new FormData();
        formData.append("file", file);
        if (uploadProjectInput.value.trim()) {
            formData.append("project", uploadProjectInput.value.trim());
        }
        if (uploadTagsInput.value.trim()) {
            formData.append("tags", uploadTagsInput.value.trim());
        }
        try {
            var res = await fetch(API + "/docs/upload", {
                method: "POST",
                headers: { "Authorization": "Bearer " + token },
                body: formData,
            });
            if (!res.ok) {
                var err = await res.json();
                uploadError.textContent = err.detail || "Upload failed";
                return;
            }
            var saved = await res.json();
            uploadOverlay.style.display = "none";
            await loadDocuments();
            loadDocument(saved.id);
        } catch (e) {
            uploadError.textContent = "Connection error";
        }
    }

    btnRefresh.addEventListener("click", function () {
        closeAllMenus();
        loadDocuments();
    });

    // Change Password
    var pwOverlay = document.getElementById("pw-overlay");
    var pwNewInput = document.getElementById("pw-new");
    var pwConfirmInput = document.getElementById("pw-confirm");
    var pwError = document.getElementById("pw-error");

    document.getElementById("btn-change-pw").addEventListener("click", function () {
        closeAllMenus();
        pwNewInput.value = "";
        pwConfirmInput.value = "";
        pwError.textContent = "";
        pwOverlay.style.display = "flex";
        pwNewInput.focus();
    });

    async function doChangePassword() {
        var newPw = pwNewInput.value;
        var confirmPw = pwConfirmInput.value;
        pwError.textContent = "";

        if (!newPw) {
            pwError.textContent = "Password cannot be empty";
            return;
        }
        if (newPw !== confirmPw) {
            pwError.textContent = "Passwords do not match";
            return;
        }

        try {
            var res = await apiFetch("/auth/password", {
                method: "PUT",
                body: { username: "admin", password: newPw },
            });
            if (res.ok || res.status === 204) {
                pwOverlay.style.display = "none";
                // Force re-login with new password
                sessionStorage.removeItem("md_vault_token");
                token = null;
                showLogin();
            } else {
                var data = await res.json();
                pwError.textContent = data.detail || "Failed to change password";
            }
        } catch (err) {
            pwError.textContent = "Connection error";
        }
    }

    document.getElementById("pw-ok").addEventListener("click", doChangePassword);
    pwConfirmInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") doChangePassword();
    });

    document.getElementById("pw-cancel").addEventListener("click", function () {
        pwOverlay.style.display = "none";
    });
    document.getElementById("pw-close").addEventListener("click", function () {
        pwOverlay.style.display = "none";
    });

    // Edit menu
    document.getElementById("btn-edit-current").addEventListener("click", function () {
        closeAllMenus();
        if (!currentDocId) return;
        apiFetch("/docs/" + currentDocId).then(function (res) {
            return res.json();
        }).then(function (doc) {
            openEditor(doc);
        });
    });

    document.getElementById("btn-delete-current").addEventListener("click", function () {
        closeAllMenus();
        if (!currentDocId) return;
        apiFetch("/docs/" + currentDocId).then(function (res) {
            return res.json();
        }).then(function (doc) {
            confirmDelete(doc);
        });
    });

    // View menu
    document.getElementById("btn-expand-all").addEventListener("click", function () {
        closeAllMenus();
        treeContainer.querySelectorAll(".tree-folder").forEach(function (f) {
            f.classList.remove("collapsed");
        });
    });

    document.getElementById("btn-collapse-all").addEventListener("click", function () {
        closeAllMenus();
        treeContainer.querySelectorAll(".tree-folder").forEach(function (f) {
            f.classList.add("collapsed");
        });
    });

    // Help menu
    document.getElementById("btn-about").addEventListener("click", function () {
        closeAllMenus();
        var about = document.createElement("div");
        about.className = "welcome-msg";
        var h = document.createElement("h2");
        h.textContent = "MD Vault v1.0";
        var p1 = document.createElement("p");
        p1.textContent = "Personal knowledge base with Win95 UI";
        var p2 = document.createElement("p");
        p2.textContent = "FastAPI + SQLite FTS5 + K3s";
        var p3 = document.createElement("p");
        p3.textContent = "mdvault.site";
        about.appendChild(h);
        about.appendChild(p1);
        about.appendChild(p2);
        about.appendChild(p3);
        setDocContainerContent([about]);
    });

    // --- Documents ---
    async function loadDocuments() {
        try {
            const res = await apiFetch("/docs");
            documents = await res.json();
            statusCount.textContent = documents.length + " document" + (documents.length !== 1 ? "s" : "");
            renderTree();
        } catch (err) {
            // handled by apiFetch
        }
    }

    // --- File type helpers ---
    function getFileIcon(doc) {
        if (!doc.file_name) return "\u{1F4C4} ";
        var ext = doc.file_name.split(".").pop().toLowerCase();
        var icons = {
            pdf: "\u{1F4D5} ", doc: "\u{1F4DD} ", docx: "\u{1F4DD} ",
            xls: "\u{1F4CA} ", xlsx: "\u{1F4CA} ", csv: "\u{1F4CA} ",
            ppt: "\u{1F4CA} ", pptx: "\u{1F4CA} ",
            png: "\u{1F5BC} ", jpg: "\u{1F5BC} ", jpeg: "\u{1F5BC} ", gif: "\u{1F5BC} ", svg: "\u{1F5BC} ",
            md: "\u{1F4C3} ", txt: "\u{1F4C3} ",
            json: "\u{2699} ", yaml: "\u{2699} ", yml: "\u{2699} ", xml: "\u{2699} ",
        };
        return icons[ext] || "\u{1F4CE} ";
    }

    function getFileExt(doc) {
        if (!doc.file_name) return null;
        return doc.file_name.split(".").pop().toLowerCase();
    }

    // --- Drag & Drop helpers ---
    function createTreeFile(doc) {
        var file = document.createElement("div");
        file.className = "tree-file tree-file-custom-icon";
        file.draggable = true;
        file.dataset.docId = doc.id;
        if (doc.id === currentDocId) file.classList.add("active");
        file.textContent = getFileIcon(doc) + doc.title;
        file.addEventListener("click", function (e) {
            e.stopPropagation();
            loadDocument(doc.id);
        });
        file.addEventListener("dragstart", function (e) {
            e.stopPropagation();
            e.dataTransfer.setData("text/plain", String(doc.id));
            e.dataTransfer.effectAllowed = "move";
            file.classList.add("dragging");
        });
        file.addEventListener("dragend", function () {
            file.classList.remove("dragging");
        });
        return file;
    }

    async function moveDocument(docId, newProject) {
        try {
            var res = await apiFetch("/docs/" + docId, {
                method: "PUT",
                body: { project: newProject },
            });
            if (res.ok) {
                await loadDocuments();
                if (currentDocId === docId) loadDocument(docId);
            }
        } catch (err) {
            // handled
        }
    }

    // --- Tree ---
    function renderTree() {
        treeContainer.textContent = "";
        var grouped = {};
        var ungrouped = [];

        documents.forEach(function (doc) {
            if (doc.project) {
                if (!grouped[doc.project]) grouped[doc.project] = [];
                grouped[doc.project].push(doc);
            } else {
                ungrouped.push(doc);
            }
        });

        // Include empty folders
        emptyFolders.forEach(function (name) {
            if (!grouped[name]) grouped[name] = [];
        });

        // Clean emptyFolders: remove ones that now have docs
        emptyFolders = emptyFolders.filter(function (name) {
            return !documents.some(function (d) { return d.project === name; });
        });

        var sortedProjects = Object.keys(grouped).sort();

        sortedProjects.forEach(function (project) {
            var folder = createTreeFolder(project, grouped[project]);
            treeContainer.appendChild(folder);
        });

        // Unsorted drop zone
        var unsortedZone = document.createElement("div");
        unsortedZone.className = "tree-unsorted-zone";
        unsortedZone.dataset.project = "";
        unsortedZone.addEventListener("dragover", function (e) {
            e.preventDefault();
            unsortedZone.classList.add("drag-over");
        });
        unsortedZone.addEventListener("dragleave", function () {
            unsortedZone.classList.remove("drag-over");
        });
        unsortedZone.addEventListener("drop", function (e) {
            e.preventDefault();
            unsortedZone.classList.remove("drag-over");
            var docId = e.dataTransfer.getData("text/plain");
            if (docId) moveDocument(parseInt(docId), null);
        });

        if (ungrouped.length > 0) {
            var sep = document.createElement("div");
            sep.className = "tree-no-project";
            sep.textContent = "— Unsorted —";
            unsortedZone.appendChild(sep);
            ungrouped.forEach(function (doc) {
                unsortedZone.appendChild(createTreeFile(doc));
            });
        } else {
            var sep = document.createElement("div");
            sep.className = "tree-no-project";
            sep.textContent = "— Drop here to unsort —";
            unsortedZone.appendChild(sep);
        }
        treeContainer.appendChild(unsortedZone);

        if (documents.length === 0 && sortedProjects.length === 0) {
            var empty = document.createElement("div");
            empty.className = "tree-no-project";
            empty.textContent = "No documents yet";
            treeContainer.appendChild(empty);
        }
    }

    function createTreeFolder(project, docs) {
        var folder = document.createElement("div");
        folder.className = "tree-folder";
        folder.dataset.project = project;

        var label = document.createElement("span");
        label.className = "tree-folder-icon";
        label.textContent = project;
        folder.appendChild(label);

        // Drop target
        folder.addEventListener("dragover", function (e) {
            e.preventDefault();
            e.stopPropagation();
            folder.classList.add("drag-over");
        });
        folder.addEventListener("dragleave", function (e) {
            if (!folder.contains(e.relatedTarget)) {
                folder.classList.remove("drag-over");
            }
        });
        folder.addEventListener("drop", function (e) {
            e.preventDefault();
            e.stopPropagation();
            folder.classList.remove("drag-over");
            var docId = e.dataTransfer.getData("text/plain");
            if (docId) moveDocument(parseInt(docId), project);
        });

        // Right-click context menu
        folder.addEventListener("contextmenu", function (e) {
            e.preventDefault();
            e.stopPropagation();
            showFolderContextMenu(e.clientX, e.clientY, project, docs);
        });

        var children = document.createElement("div");
        children.className = "tree-children";
        (docs || []).forEach(function (doc) {
            children.appendChild(createTreeFile(doc));
        });
        if (docs.length === 0) {
            var hint = document.createElement("div");
            hint.className = "tree-no-project";
            hint.textContent = "(empty)";
            children.appendChild(hint);
        }
        folder.appendChild(children);

        folder.addEventListener("click", function () {
            folder.classList.toggle("collapsed");
        });

        return folder;
    }

    // --- Folder context menu ---
    var ctxMenu = null;

    function hideContextMenu() {
        if (ctxMenu && ctxMenu.parentNode) {
            ctxMenu.parentNode.removeChild(ctxMenu);
        }
        ctxMenu = null;
    }

    document.addEventListener("click", hideContextMenu);

    function showFolderContextMenu(x, y, project, docs) {
        hideContextMenu();
        ctxMenu = document.createElement("div");
        ctxMenu.className = "dropdown-menu show";
        ctxMenu.style.position = "fixed";
        ctxMenu.style.left = x + "px";
        ctxMenu.style.top = y + "px";
        ctxMenu.style.zIndex = "300";

        var renameBtn = document.createElement("button");
        renameBtn.className = "dropdown-item";
        renameBtn.textContent = "Rename Folder";
        renameBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            hideContextMenu();
            promptRenameFolder(project);
        });

        var deleteBtn = document.createElement("button");
        deleteBtn.className = "dropdown-item";
        deleteBtn.textContent = "Delete Folder";
        deleteBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            hideContextMenu();
            confirmDeleteFolder(project, docs);
        });

        ctxMenu.appendChild(renameBtn);
        ctxMenu.appendChild(deleteBtn);
        document.body.appendChild(ctxMenu);
    }

    function promptRenameFolder(oldName) {
        folderNameInput.value = oldName;
        pendingFolderAction = function () {
            var newName = folderNameInput.value.trim();
            if (!newName || newName === oldName) return;
            renameFolder(oldName, newName);
        };
        folderOverlay.style.display = "flex";
        folderNameInput.focus();
        folderNameInput.select();
    }

    async function renameFolder(oldName, newName) {
        // Update all docs in the old project to new project name
        var docsInFolder = documents.filter(function (d) { return d.project === oldName; });
        for (var i = 0; i < docsInFolder.length; i++) {
            await apiFetch("/docs/" + docsInFolder[i].id, {
                method: "PUT",
                body: { project: newName },
            });
        }
        // Update emptyFolders
        var idx = emptyFolders.indexOf(oldName);
        if (idx !== -1) {
            emptyFolders[idx] = newName;
        }
        await loadDocuments();
    }

    function confirmDeleteFolder(project, docs) {
        if (docs && docs.length > 0) {
            deleteMsg.textContent = 'Delete folder "' + project + '"? Its ' + docs.length + ' document(s) will move to Unsorted.';
        } else {
            deleteMsg.textContent = 'Delete empty folder "' + project + '"?';
        }
        pendingDeleteAction = async function () {
            if (docs && docs.length > 0) {
                for (var i = 0; i < docs.length; i++) {
                    await apiFetch("/docs/" + docs[i].id, {
                        method: "PUT",
                        body: { project: null },
                    });
                }
            }
            emptyFolders = emptyFolders.filter(function (n) { return n !== project; });
            await loadDocuments();
        };
        deleteOverlay.style.display = "flex";
    }

    // --- Document View ---
    async function loadDocument(id) {
        try {
            const res = await apiFetch("/docs/" + id);
            if (!res.ok) return;
            const doc = await res.json();
            currentDocId = doc.id;
            renderTree();

            // Build document view using safe DOM methods
            var frag = document.createDocumentFragment();

            // Header
            var header = document.createElement("div");
            header.className = "doc-header";
            var h1 = document.createElement("h1");
            h1.textContent = doc.title;
            header.appendChild(h1);

            var actions = document.createElement("div");
            actions.className = "doc-actions";

            // Download button for file-backed docs
            if (doc.file_name) {
                var dlBtn = document.createElement("button");
                dlBtn.className = "win-btn-sm";
                dlBtn.textContent = "Download";
                dlBtn.addEventListener("click", function () {
                    var a = document.createElement("a");
                    a.href = API + "/docs/" + doc.id + "/file";
                    a.download = doc.file_name;
                    // Add auth via fetch+blob
                    fetch(API + "/docs/" + doc.id + "/file", {
                        headers: { "Authorization": "Bearer " + token }
                    }).then(function (r) { return r.blob(); }).then(function (blob) {
                        var url = URL.createObjectURL(blob);
                        a.href = url;
                        a.click();
                        URL.revokeObjectURL(url);
                    });
                });
                actions.appendChild(dlBtn);
                actions.appendChild(document.createTextNode(" "));
            }

            var editBtn = document.createElement("button");
            editBtn.className = "win-btn-sm";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", function () { openEditor(doc); });
            var delBtn = document.createElement("button");
            delBtn.className = "win-btn-sm win-btn-danger";
            delBtn.textContent = "Delete";
            delBtn.addEventListener("click", function () { confirmDelete(doc); });
            actions.appendChild(editBtn);
            actions.appendChild(document.createTextNode(" "));
            actions.appendChild(delBtn);
            header.appendChild(actions);
            frag.appendChild(header);

            // Meta
            var meta = document.createElement("div");
            meta.className = "doc-meta";
            var metaText = "";
            if (doc.project) metaText += "Project: " + doc.project + " | ";
            if (doc.file_name) metaText += "File: " + doc.file_name + " | ";
            metaText += "Updated: " + doc.updated_at;
            meta.textContent = metaText;
            frag.appendChild(meta);

            // Tags
            if (doc.tags && doc.tags.length > 0) {
                var tagsDiv = document.createElement("div");
                tagsDiv.className = "doc-tags";
                doc.tags.forEach(function (tag) {
                    var span = document.createElement("span");
                    span.className = "doc-tag";
                    span.textContent = tag;
                    tagsDiv.appendChild(span);
                });
                frag.appendChild(tagsDiv);
            }

            // Body — render based on file type
            var body = document.createElement("div");
            body.className = "doc-body";
            var ext = getFileExt(doc);

            if (!doc.file_name || ext === "md" || ext === "txt") {
                // Markdown / plain text
                var safeHtml = renderMarkdownSafe(doc.content || "");
                body.appendChild(createSanitizedFragment(safeHtml));
            } else {
                // File-based: render async
                body.textContent = "Loading preview...";
                renderFilePreview(doc, body);
            }

            frag.appendChild(body);
            setDocContainerContent([frag]);
        } catch (err) {
            // handled
        }
    }

    function createSanitizedFragment(sanitizedHtml) {
        var template = document.createElement("template");
        template.innerHTML = sanitizedHtml;
        return template.content;
    }

    // --- File preview renderers ---
    async function renderFilePreview(doc, container) {
        var ext = getFileExt(doc);
        try {
            var fileUrl = API + "/docs/" + doc.id + "/file";
            var headers = { "Authorization": "Bearer " + token };

            if (ext === "pdf") {
                await renderPdf(fileUrl, headers, container);
            } else if (ext === "docx" || ext === "doc") {
                await renderDocx(fileUrl, headers, container);
            } else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
                await renderSpreadsheet(fileUrl, headers, container, ext);
            } else if (["png", "jpg", "jpeg", "gif", "svg"].indexOf(ext) !== -1) {
                await renderImage(fileUrl, headers, container);
            } else if (ext === "drawio") {
                await renderDrawio(fileUrl, headers, container);
            } else if (["json", "yaml", "yml", "xml", "html", "htm"].indexOf(ext) !== -1) {
                renderCode(doc.content, container, ext);
            } else {
                container.textContent = "Preview not available for this file type. Use Download.";
            }
        } catch (e) {
            container.textContent = "Failed to load preview: " + e.message;
        }
    }

    async function renderPdf(url, headers, container) {
        container.textContent = "";
        var res = await fetch(url, { headers: headers });
        var data = await res.arrayBuffer();

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        var pdf = await pdfjsLib.getDocument({ data: data }).promise;

        for (var i = 1; i <= pdf.numPages; i++) {
            var page = await pdf.getPage(i);
            var viewport = page.getViewport({ scale: 1.2 });
            var canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.display = "block";
            canvas.style.marginBottom = "8px";
            canvas.style.maxWidth = "100%";
            var ctx = canvas.getContext("2d");
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            container.appendChild(canvas);
        }
    }

    async function renderDocx(url, headers, container) {
        container.textContent = "Converting...";
        var res = await fetch(url, { headers: headers });
        var data = await res.arrayBuffer();
        var result = await mammoth.convertToHtml({ arrayBuffer: data });
        container.textContent = "";
        var safeHtml = DOMPurify.sanitize(result.value);
        container.appendChild(createSanitizedFragment(safeHtml));
    }

    async function renderSpreadsheet(url, headers, container, ext) {
        container.textContent = "Loading spreadsheet...";
        var res = await fetch(url, { headers: headers });
        var data = await res.arrayBuffer();
        var workbook = XLSX.read(data, { type: "array" });
        container.textContent = "";

        workbook.SheetNames.forEach(function (name) {
            var sheet = workbook.Sheets[name];
            var htmlStr = XLSX.utils.sheet_to_html(sheet, { editable: false });

            var sheetTitle = document.createElement("h3");
            sheetTitle.textContent = "Sheet: " + name;
            sheetTitle.style.margin = "12px 0 4px";
            container.appendChild(sheetTitle);

            var wrapper = document.createElement("div");
            wrapper.className = "spreadsheet-view";
            var safeHtml = DOMPurify.sanitize(htmlStr);
            wrapper.appendChild(createSanitizedFragment(safeHtml));
            container.appendChild(wrapper);
        });
    }

    async function renderImage(url, headers, container) {
        container.textContent = "";
        var res = await fetch(url, { headers: headers });
        var blob = await res.blob();
        var img = document.createElement("img");
        img.src = URL.createObjectURL(blob);
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        container.appendChild(img);
    }

    async function renderDrawio(url, headers, container) {
        container.textContent = "Loading diagram...";
        var res = await fetch(url, { headers: headers });
        var xmlText = await res.text();
        container.textContent = "";

        // Use draw.io embed viewer via iframe
        var xmlB64 = btoa(unescape(encodeURIComponent(xmlText)));
        var iframe = document.createElement("iframe");
        iframe.style.width = "100%";
        iframe.style.height = "600px";
        iframe.style.border = "2px inset var(--bg)";
        iframe.style.background = "#ffffff";
        iframe.frameBorder = "0";
        iframe.src = "https://viewer.diagrams.net/?highlight=0000ff&nav=1&title=diagram#R" + encodeURIComponent(xmlB64);
        container.appendChild(iframe);

        // Also show raw XML toggle
        var toggle = document.createElement("button");
        toggle.className = "win-btn-sm";
        toggle.textContent = "Show XML Source";
        toggle.style.marginTop = "8px";
        var xmlPre = document.createElement("pre");
        var xmlCode = document.createElement("code");
        xmlCode.textContent = xmlText;
        xmlPre.appendChild(xmlCode);
        xmlPre.style.display = "none";
        toggle.addEventListener("click", function () {
            if (xmlPre.style.display === "none") {
                xmlPre.style.display = "block";
                toggle.textContent = "Hide XML Source";
            } else {
                xmlPre.style.display = "none";
                toggle.textContent = "Show XML Source";
            }
        });
        container.appendChild(toggle);
        container.appendChild(xmlPre);
    }

    function renderCode(content, container, ext) {
        container.textContent = "";
        var pre = document.createElement("pre");
        var code = document.createElement("code");
        code.textContent = content || "";
        pre.appendChild(code);
        container.appendChild(pre);
    }

    // --- Editor ---
    function openEditor(doc) {
        if (doc) {
            editingDocId = doc.id;
            editorTitle.textContent = "Edit Document";
            docTitleInput.value = doc.title;
            docProjectInput.value = doc.project || "";
            docTagsInput.value = (doc.tags || []).join(", ");
            docContentInput.value = doc.content;
        } else {
            editingDocId = null;
            editorTitle.textContent = "New Document";
            docTitleInput.value = "";
            docProjectInput.value = "";
            docTagsInput.value = "";
            docContentInput.value = "";
        }
        editorOverlay.style.display = "flex";
        docTitleInput.focus();
    }

    function closeEditor() {
        editorOverlay.style.display = "none";
    }

    editorCancel.addEventListener("click", closeEditor);
    editorClose.addEventListener("click", closeEditor);

    editorSave.addEventListener("click", async function () {
        const payload = {
            title: docTitleInput.value.trim(),
            content: docContentInput.value,
            project: docProjectInput.value.trim() || null,
            tags: docTagsInput.value.trim() || null,
        };

        if (!payload.title) {
            alert("Title is required");
            return;
        }

        try {
            let res;
            if (editingDocId) {
                res = await apiFetch("/docs/" + editingDocId, {
                    method: "PUT",
                    body: payload,
                });
            } else {
                res = await apiFetch("/docs", {
                    method: "POST",
                    body: payload,
                });
            }

            if (res.ok) {
                const saved = await res.json();
                closeEditor();
                await loadDocuments();
                loadDocument(saved.id);
            }
        } catch (err) {
            // handled
        }
    });

    // --- Delete (unified: docs + folders use same dialog) ---
    var pendingDeleteAction = null;

    function confirmDelete(doc) {
        deleteMsg.textContent = 'Delete "' + doc.title + '"?';
        pendingDeleteAction = async function () {
            // Preserve the folder if this was the last file in it
            if (doc.project) {
                var othersInFolder = documents.filter(function (d) {
                    return d.project === doc.project && d.id !== doc.id;
                });
                if (othersInFolder.length === 0 && !emptyFolders.includes(doc.project)) {
                    emptyFolders.push(doc.project);
                }
            }
            await apiFetch("/docs/" + doc.id, { method: "DELETE" });
            currentDocId = null;
            showWelcome();
            await loadDocuments();
        };
        deleteOverlay.style.display = "flex";
    }

    function showWelcome() {
        var welcome = document.createElement("div");
        welcome.className = "welcome-msg";
        var wh = document.createElement("h2");
        wh.textContent = "Welcome to MD Vault";
        var wp = document.createElement("p");
        wp.textContent = "Select a document from the tree.";
        welcome.appendChild(wh);
        welcome.appendChild(wp);
        setDocContainerContent([welcome]);
    }

    deleteNo.addEventListener("click", function () {
        deleteOverlay.style.display = "none";
        pendingDeleteAction = null;
    });

    deleteYes.addEventListener("click", async function () {
        if (!pendingDeleteAction) return;
        var action = pendingDeleteAction;
        pendingDeleteAction = null;
        deleteOverlay.style.display = "none";
        try {
            await action();
        } catch (err) {
            // handled
        }
    });

    // --- Search ---
    searchBtn.addEventListener("click", doSearch);
    searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") doSearch();
    });

    async function doSearch() {
        const q = searchInput.value.trim();
        if (!q) {
            loadDocuments();
            if (currentDocId) loadDocument(currentDocId);
            return;
        }

        try {
            const res = await apiFetch("/search?q=" + encodeURIComponent(q));
            if (!res.ok) return;
            const results = await res.json();

            var container = document.createElement("div");
            container.className = "search-results";

            var heading = document.createElement("strong");
            heading.textContent = "Search results for: " + q;
            container.appendChild(heading);
            container.appendChild(document.createElement("br"));
            container.appendChild(document.createElement("br"));

            if (results.length === 0) {
                var noResults = document.createElement("p");
                noResults.textContent = "No results found.";
                container.appendChild(noResults);
            } else {
                results.forEach(function (r) {
                    var item = document.createElement("div");
                    item.className = "search-result-item";

                    var title = document.createElement("div");
                    title.className = "search-result-title";
                    title.textContent = r.title;
                    item.appendChild(title);

                    var snippet = document.createElement("div");
                    snippet.className = "search-result-snippet";
                    // Snippet comes from FTS5 with <mark> tags, sanitize it
                    var safeSnippet = sanitize(r.snippet);
                    snippet.appendChild(createSanitizedFragment(safeSnippet));
                    item.appendChild(snippet);

                    item.addEventListener("click", function () {
                        loadDocument(r.id);
                    });

                    container.appendChild(item);
                });
            }

            setDocContainerContent([container]);
        } catch (err) {
            // handled
        }
    }

    // --- Resize ---
    let isResizing = false;

    resizeHandle.addEventListener("mousedown", function (e) {
        isResizing = true;
        e.preventDefault();
    });

    document.addEventListener("mousemove", function (e) {
        if (!isResizing) return;
        const newWidth = e.clientX - treePanel.getBoundingClientRect().left;
        if (newWidth > 100 && newWidth < 600) {
            treePanel.style.width = newWidth + "px";
        }
    });

    document.addEventListener("mouseup", function () {
        isResizing = false;
    });

    // --- Init ---
    if (token) {
        showMain();
    } else {
        showLogin();
    }
})();
