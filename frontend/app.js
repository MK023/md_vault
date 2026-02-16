(function () {
    "use strict";

    const API = "/api";
    let token = sessionStorage.getItem("md_vault_token");
    let documents = [];
    let currentDocId = null;
    let currentDoc = null;
    let editingDocId = null;
    var pendingFolderAction = null;
    var emptyFolders = [];
    var collapsedPaths = new Set();

    // --- Lazy script loader ---
    var scriptCache = {};
    function loadScript(url) {
        if (scriptCache[url]) return scriptCache[url];
        scriptCache[url] = new Promise(function (resolve, reject) {
            var s = document.createElement("script");
            s.src = url;
            s.onload = resolve;
            s.onerror = function () { reject(new Error("Failed to load " + url)); };
            document.head.appendChild(s);
        });
        return scriptCache[url];
    }

    // --- File icon map (module-level constant) ---
    var FILE_ICONS = {
        pdf: "\u{1F4D5} ", doc: "\u{1F4DD} ", docx: "\u{1F4DD} ",
        xls: "\u{1F4CA} ", xlsx: "\u{1F4CA} ", csv: "\u{1F4CA} ",
        ppt: "\u{1F4CA} ", pptx: "\u{1F4CA} ",
        png: "\u{1F5BC} ", jpg: "\u{1F5BC} ", jpeg: "\u{1F5BC} ", gif: "\u{1F5BC} ", svg: "\u{1F5BC} ",
        md: "\u{1F4C3} ", txt: "\u{1F4C3} ",
        json: "\u{2699} ", yaml: "\u{2699} ", yml: "\u{2699} ", xml: "\u{2699} ",
    };

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
        var headers = opts.headers || {};
        if (token) headers["Authorization"] = "Bearer " + token;
        if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
            headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify(opts.body);
        }
        var res = await fetch(API + path, { ...opts, headers });
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
        taskbar.style.display = "none";
        desktopIcons.style.display = "none";
        loginError.textContent = "";
        passwordInput.value = "";
        passwordInput.focus();
    }

    function showMain() {
        loginOverlay.style.display = "none";
        mainWindow.style.display = "flex";
        taskbar.style.display = "none";
        desktopIcons.style.display = "none";
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
        item.btn.addEventListener("mouseenter", function () {
            if (menuOpen) {
                openMenu(item.btn, item.dd);
            }
        });
    });

    document.addEventListener("click", closeAllMenus);

    // --- Window controls (Win95 Minimize / Maximize) ---
    var minimizeBtn = document.getElementById("minimize-btn");
    var maximizeBtn = document.getElementById("maximize-btn");
    var taskbar = document.getElementById("taskbar");
    var taskbarBtn = document.getElementById("taskbar-btn");
    var desktopIcons = document.getElementById("desktop-icons");
    var isMaximized = false;

    function showDesktopIcons() {
        desktopIcons.style.display = "flex";
    }

    function hideDesktopIcons() {
        desktopIcons.style.display = "none";
    }

    minimizeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        mainWindow.style.display = "none";
        taskbar.style.display = "flex";
        showDesktopIcons();
    });

    taskbarBtn.addEventListener("click", function () {
        mainWindow.style.display = "flex";
        taskbar.style.display = "none";
        hideDesktopIcons();
    });

    maximizeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (isMaximized) {
            mainWindow.classList.remove("maximized");
            maximizeBtn.textContent = "\u25A1";
            isMaximized = false;
        } else {
            mainWindow.classList.add("maximized");
            maximizeBtn.textContent = "\u29C9";
            isMaximized = true;
        }
    });

    btnNewDoc.addEventListener("click", function () {
        closeAllMenus();
        openEditor(null);
    });

    // New Folder
    var folderOverlay = document.getElementById("folder-overlay");
    var folderNameInput = document.getElementById("folder-name");

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
        var currentProject = "";
        if (currentDoc && currentDoc.project) currentProject = currentDoc.project;
        uploadProjectInput.value = currentProject;
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
        var files = uploadFileInput.files;
        if (!files || files.length === 0) {
            uploadError.textContent = "Select a file first";
            return;
        }
        var total = files.length;
        var lastSavedId = null;
        var project = uploadProjectInput.value.trim();
        var tags = uploadTagsInput.value.trim();

        for (var i = 0; i < total; i++) {
            uploadError.textContent = "Uploading " + (i + 1) + "/" + total + "...";
            var formData = new FormData();
            formData.append("file", files[i]);
            if (project) formData.append("project", project);
            if (tags) formData.append("tags", tags);
            try {
                var res = await apiFetch("/docs/upload", {
                    method: "POST",
                    body: formData,
                });
                if (!res.ok) {
                    var err = await res.json();
                    uploadError.textContent = "Failed on " + files[i].name + ": " + (err.detail || "Upload failed");
                    return;
                }
                var saved = await res.json();
                lastSavedId = saved.id;
            } catch (e) {
                uploadError.textContent = "Connection error on " + files[i].name;
                return;
            }
        }
        uploadOverlay.style.display = "none";
        await loadDocuments();
        if (lastSavedId) loadDocument(lastSavedId);
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

    // Edit menu — uses cached currentDoc instead of API fetch
    document.getElementById("btn-edit-current").addEventListener("click", function () {
        closeAllMenus();
        if (!currentDoc) return;
        openEditor(currentDoc);
    });

    document.getElementById("btn-delete-current").addEventListener("click", function () {
        closeAllMenus();
        if (!currentDoc) return;
        confirmDelete(currentDoc);
    });

    // View menu
    document.getElementById("btn-expand-all").addEventListener("click", function () {
        closeAllMenus();
        collapsedPaths.clear();
        treeContainer.querySelectorAll(".tree-folder").forEach(function (f) {
            f.classList.remove("collapsed");
        });
    });

    document.getElementById("btn-collapse-all").addEventListener("click", function () {
        closeAllMenus();
        treeContainer.querySelectorAll(".tree-folder").forEach(function (f) {
            f.classList.add("collapsed");
            var path = f.dataset.project;
            if (path) collapsedPaths.add(path);
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
            // Clean emptyFolders: remove paths where docs exist with that exact project
            emptyFolders = emptyFolders.filter(function (path) {
                return !documents.some(function (d) { return d.project === path; });
            });
            renderTree();
        } catch (err) {
            // handled by apiFetch
        }
    }

    // --- File type helpers ---
    function getFileIcon(doc) {
        if (!doc.file_name) return "\u{1F4C4} ";
        var ext = doc.file_name.split(".").pop().toLowerCase();
        return FILE_ICONS[ext] || "\u{1F4CE} ";
    }

    function getFileExt(doc) {
        if (!doc.file_name) return null;
        return doc.file_name.split(".").pop().toLowerCase();
    }

    function getTreeLabel(doc) {
        var ext = getFileExt(doc);
        if (!ext) return doc.title;
        if (doc.title.toLowerCase().endsWith("." + ext)) return doc.title;
        return doc.title + "." + ext;
    }

    // --- Active tree item (no full re-render) ---
    function setActiveTreeItem(docId) {
        var prev = treeContainer.querySelector(".tree-file.active");
        if (prev) prev.classList.remove("active");
        if (docId) {
            var next = treeContainer.querySelector('[data-doc-id="' + docId + '"]');
            if (next) next.classList.add("active");
        }
    }

    // --- Drag & Drop helpers ---
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

    // --- Tree (nested folder support via "/" separator) ---
    function buildFolderTree() {
        var root = { children: {}, docs: [] };
        function ensurePath(parts) {
            var node = root;
            for (var i = 0; i < parts.length; i++) {
                if (!node.children[parts[i]]) {
                    node.children[parts[i]] = { children: {}, docs: [] };
                }
                node = node.children[parts[i]];
            }
            return node;
        }
        documents.forEach(function (doc) {
            if (!doc.project) return;
            var parts = doc.project.split("/");
            ensurePath(parts).docs.push(doc);
        });
        emptyFolders.forEach(function (path) {
            ensurePath(path.split("/"));
        });
        return root;
    }

    function renderTree() {
        // Save collapsed state before clearing
        treeContainer.querySelectorAll(".tree-folder.collapsed").forEach(function (f) {
            var path = f.dataset.project;
            if (path) collapsedPaths.add(path);
        });

        treeContainer.textContent = "";
        var ungrouped = documents.filter(function (d) { return !d.project; });

        var tree = buildFolderTree();
        var sortedNames = Object.keys(tree.children).sort();

        sortedNames.forEach(function (name) {
            var folder = createTreeFolder(name, name, tree.children[name]);
            treeContainer.appendChild(folder);
        });

        // Unsorted drop zone
        var unsortedZone = document.createElement("div");
        unsortedZone.className = "tree-unsorted-zone";
        unsortedZone.dataset.project = "";

        if (ungrouped.length > 0) {
            var sep = document.createElement("div");
            sep.className = "tree-no-project";
            sep.textContent = "\u2014 Unsorted \u2014";
            unsortedZone.appendChild(sep);
            ungrouped.forEach(function (doc) {
                unsortedZone.appendChild(createTreeFile(doc));
            });
        } else {
            var sep = document.createElement("div");
            sep.className = "tree-no-project";
            sep.textContent = "\u2014 Drop here to unsort \u2014";
            unsortedZone.appendChild(sep);
        }
        treeContainer.appendChild(unsortedZone);

        if (documents.length === 0 && sortedNames.length === 0) {
            var empty = document.createElement("div");
            empty.className = "tree-no-project";
            empty.textContent = "No documents yet";
            treeContainer.appendChild(empty);
        }
    }

    // createTreeFile: DOM only, zero listeners
    function createTreeFile(doc) {
        var file = document.createElement("div");
        file.className = "tree-file tree-file-custom-icon";
        file.draggable = true;
        file.dataset.docId = doc.id;
        if (doc.id === currentDocId) file.classList.add("active");
        file.textContent = getFileIcon(doc) + getTreeLabel(doc);
        return file;
    }

    // createTreeFolder: DOM only, zero listeners
    function createTreeFolder(name, fullPath, node) {
        var folder = document.createElement("div");
        folder.className = "tree-folder";
        folder.dataset.project = fullPath;

        // Restore collapsed state
        if (collapsedPaths.has(fullPath)) {
            folder.classList.add("collapsed");
        }

        var label = document.createElement("span");
        label.className = "tree-folder-icon";
        label.textContent = name;
        folder.appendChild(label);

        var children = document.createElement("div");
        children.className = "tree-children";

        var sortedChildNames = Object.keys(node.children).sort();
        sortedChildNames.forEach(function (childName) {
            var childPath = fullPath + "/" + childName;
            children.appendChild(createTreeFolder(childName, childPath, node.children[childName]));
        });

        (node.docs || []).forEach(function (doc) {
            children.appendChild(createTreeFile(doc));
        });

        if (sortedChildNames.length === 0 && node.docs.length === 0) {
            var hint = document.createElement("div");
            hint.className = "tree-no-project";
            hint.textContent = "(empty)";
            children.appendChild(hint);
        }
        folder.appendChild(children);

        return folder;
    }

    // --- Event delegation on treeContainer ---
    treeContainer.addEventListener("click", function (e) {
        var fileEl = e.target.closest(".tree-file");
        if (fileEl) {
            e.stopPropagation();
            var docId = parseInt(fileEl.dataset.docId);
            if (docId) loadDocument(docId);
            return;
        }
        var folderIcon = e.target.closest(".tree-folder-icon");
        if (folderIcon) {
            e.stopPropagation();
            var folder = folderIcon.closest(".tree-folder");
            if (folder) {
                folder.classList.toggle("collapsed");
                var path = folder.dataset.project;
                if (path) {
                    if (folder.classList.contains("collapsed")) {
                        collapsedPaths.add(path);
                    } else {
                        collapsedPaths.delete(path);
                    }
                }
            }
        }
    });

    treeContainer.addEventListener("contextmenu", function (e) {
        var fileEl = e.target.closest(".tree-file");
        if (fileEl) {
            e.preventDefault();
            e.stopPropagation();
            var docId = parseInt(fileEl.dataset.docId);
            var doc = documents.find(function (d) { return d.id === docId; });
            if (doc) showFileContextMenu(e.clientX, e.clientY, doc);
            return;
        }
        var folderEl = e.target.closest(".tree-folder");
        if (folderEl) {
            e.preventDefault();
            e.stopPropagation();
            var fullPath = folderEl.dataset.project;
            // Rebuild the node for this folder path
            var tree = buildFolderTree();
            var node = tree;
            var parts = fullPath.split("/");
            for (var i = 0; i < parts.length; i++) {
                node = (node.children && node.children[parts[i]]) || { children: {}, docs: [] };
            }
            showFolderContextMenu(e.clientX, e.clientY, fullPath, node);
        }
    });

    treeContainer.addEventListener("dragstart", function (e) {
        var fileEl = e.target.closest(".tree-file");
        if (fileEl) {
            e.stopPropagation();
            e.dataTransfer.setData("text/plain", fileEl.dataset.docId);
            e.dataTransfer.effectAllowed = "move";
            fileEl.classList.add("dragging");
        }
    });

    treeContainer.addEventListener("dragend", function (e) {
        var fileEl = e.target.closest(".tree-file");
        if (fileEl) {
            fileEl.classList.remove("dragging");
        }
    });

    treeContainer.addEventListener("dragover", function (e) {
        var folderEl = e.target.closest(".tree-folder");
        var unsortedEl = e.target.closest(".tree-unsorted-zone");
        if (folderEl || unsortedEl) {
            e.preventDefault();
            e.stopPropagation();
            (folderEl || unsortedEl).classList.add("drag-over");
        }
    });

    treeContainer.addEventListener("dragleave", function (e) {
        var folderEl = e.target.closest(".tree-folder");
        var unsortedEl = e.target.closest(".tree-unsorted-zone");
        var target = folderEl || unsortedEl;
        if (target && !target.contains(e.relatedTarget)) {
            target.classList.remove("drag-over");
        }
    });

    treeContainer.addEventListener("drop", function (e) {
        var folderEl = e.target.closest(".tree-folder");
        var unsortedEl = e.target.closest(".tree-unsorted-zone");
        var target = folderEl || unsortedEl;
        if (target) {
            e.preventDefault();
            e.stopPropagation();
            target.classList.remove("drag-over");
            var docId = e.dataTransfer.getData("text/plain");
            if (docId) {
                var newProject = target.dataset.project || null;
                moveDocument(parseInt(docId), newProject);
            }
        }
    });

    // --- Context menus (files + folders) ---
    var ctxMenu = null;

    function hideContextMenu() {
        if (ctxMenu && ctxMenu.parentNode) {
            ctxMenu.parentNode.removeChild(ctxMenu);
        }
        ctxMenu = null;
    }

    document.addEventListener("click", hideContextMenu);

    function createContextMenu(x, y, items) {
        hideContextMenu();
        ctxMenu = document.createElement("div");
        ctxMenu.className = "dropdown-menu show";
        ctxMenu.style.position = "fixed";
        ctxMenu.style.left = x + "px";
        ctxMenu.style.top = y + "px";
        ctxMenu.style.zIndex = "300";
        items.forEach(function (item) {
            var btn = document.createElement("button");
            btn.className = "dropdown-item";
            btn.textContent = item.label;
            btn.addEventListener("click", function (e) {
                e.stopPropagation();
                hideContextMenu();
                item.action();
            });
            ctxMenu.appendChild(btn);
        });
        document.body.appendChild(ctxMenu);
    }

    function showFileContextMenu(x, y, doc) {
        createContextMenu(x, y, [
            { label: "Edit", action: function () { openEditorForDoc(doc.id); } },
            { label: "Delete", action: function () { confirmDeleteFromList(doc.id); } },
        ]);
    }

    function openEditorForDoc(docId) {
        apiFetch("/docs/" + docId).then(function (res) {
            return res.json();
        }).then(openEditor);
    }

    function confirmDeleteFromList(docId) {
        apiFetch("/docs/" + docId).then(function (res) {
            return res.json();
        }).then(confirmDelete);
    }

    function showFolderContextMenu(x, y, fullPath, node) {
        createContextMenu(x, y, [
            { label: "New Subfolder", action: function () { promptNewSubfolder(fullPath); } },
            { label: "Rename Folder", action: function () { promptRenameFolder(fullPath); } },
            { label: "Delete Folder", action: function () { confirmDeleteFolder(fullPath, node); } },
        ]);
    }

    function promptNewSubfolder(parentPath) {
        folderNameInput.value = "";
        pendingFolderAction = function () {
            var name = folderNameInput.value.trim();
            if (!name) return;
            var newPath = parentPath + "/" + name;
            if (!emptyFolders.includes(newPath)) {
                emptyFolders.push(newPath);
            }
            renderTree();
        };
        folderOverlay.style.display = "flex";
        folderNameInput.focus();
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

    async function renameFolder(oldPath, newPath) {
        var docsToUpdate = documents.filter(function (d) {
            return d.project === oldPath || (d.project && d.project.startsWith(oldPath + "/"));
        });
        for (var i = 0; i < docsToUpdate.length; i++) {
            var updatedProject;
            if (docsToUpdate[i].project === oldPath) {
                updatedProject = newPath;
            } else {
                updatedProject = newPath + docsToUpdate[i].project.substring(oldPath.length);
            }
            await apiFetch("/docs/" + docsToUpdate[i].id, {
                method: "PUT",
                body: { project: updatedProject },
            });
        }
        emptyFolders = emptyFolders.map(function (p) {
            if (p === oldPath) return newPath;
            if (p.startsWith(oldPath + "/")) return newPath + p.substring(oldPath.length);
            return p;
        });
        // Update collapsed paths
        var newCollapsed = new Set();
        collapsedPaths.forEach(function (p) {
            if (p === oldPath) {
                newCollapsed.add(newPath);
            } else if (p.startsWith(oldPath + "/")) {
                newCollapsed.add(newPath + p.substring(oldPath.length));
            } else {
                newCollapsed.add(p);
            }
        });
        collapsedPaths = newCollapsed;
        await loadDocuments();
    }

    function collectAllDocs(node) {
        var result = node.docs.slice();
        Object.keys(node.children).forEach(function (k) {
            result = result.concat(collectAllDocs(node.children[k]));
        });
        return result;
    }

    function confirmDeleteFolder(fullPath, node) {
        var allDocs = collectAllDocs(node);
        if (allDocs.length > 0) {
            deleteMsg.textContent = 'Delete folder "' + fullPath + '"? Its ' + allDocs.length + ' document(s) will move to Unsorted.';
        } else {
            deleteMsg.textContent = 'Delete empty folder "' + fullPath + '"?';
        }
        pendingDeleteAction = async function () {
            for (var i = 0; i < allDocs.length; i++) {
                await apiFetch("/docs/" + allDocs[i].id, {
                    method: "PUT",
                    body: { project: null },
                });
            }
            emptyFolders = emptyFolders.filter(function (p) {
                return p !== fullPath && !p.startsWith(fullPath + "/");
            });
            collapsedPaths.delete(fullPath);
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
            currentDoc = doc;

            // Just toggle active class, don't re-render tree
            setActiveTreeItem(doc.id);

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

            if (doc.file_name) {
                var dlBtn = document.createElement("button");
                dlBtn.className = "win-btn-sm";
                dlBtn.textContent = "Download";
                dlBtn.addEventListener("click", function () {
                    apiFetch(filePath(doc.id)).then(function (r) {
                        return r.blob();
                    }).then(function (blob) {
                        var a = document.createElement("a");
                        var url = URL.createObjectURL(blob);
                        a.href = url;
                        a.download = doc.file_name;
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
                // Markdown / plain text — sanitized via DOMPurify
                var safeHtml = renderMarkdownSafe(doc.content || "");
                body.appendChild(createSanitizedFragment(safeHtml));
            } else {
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
        // sanitizedHtml is ALWAYS pre-sanitized via DOMPurify before reaching here
        var template = document.createElement("template");
        template.innerHTML = sanitizedHtml;  // safe: input is DOMPurify-sanitized
        return template.content;
    }

    // --- File preview renderers ---
    function filePath(docId) {
        return "/docs/" + docId + "/file";
    }

    async function renderFilePreview(doc, container) {
        var ext = getFileExt(doc);
        try {
            if (ext === "pdf") {
                await renderPdf(doc.id, container);
            } else if (ext === "docx" || ext === "doc") {
                await renderDocx(doc.id, container);
            } else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
                await renderSpreadsheet(doc.id, container);
            } else if (["png", "jpg", "jpeg", "gif", "svg"].indexOf(ext) !== -1) {
                await renderImage(doc.id, container);
            } else if (ext === "drawio") {
                await renderDrawio(doc.id, container);
            } else if (["json", "yaml", "yml", "xml", "html", "htm"].indexOf(ext) !== -1) {
                renderCode(doc.content, container);
            } else {
                container.textContent = "Preview not available for this file type. Use Download.";
            }
        } catch (e) {
            container.textContent = "Failed to load preview: " + e.message;
        }
    }

    async function renderPdf(docId, container) {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
        container.textContent = "";
        var res = await apiFetch(filePath(docId));
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

    async function renderDocx(docId, container) {
        await loadScript("https://cdn.jsdelivr.net/npm/mammoth@1/mammoth.browser.min.js");
        container.textContent = "Converting...";
        var res = await apiFetch(filePath(docId));
        var data = await res.arrayBuffer();
        var result = await mammoth.convertToHtml({ arrayBuffer: data });
        container.textContent = "";
        var safeHtml = DOMPurify.sanitize(result.value);
        container.appendChild(createSanitizedFragment(safeHtml));
    }

    async function renderSpreadsheet(docId, container) {
        await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18/dist/xlsx.full.min.js");
        container.textContent = "Loading spreadsheet...";
        var res = await apiFetch(filePath(docId));
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
            // DOMPurify-sanitized before template.innerHTML
            var safeHtml = DOMPurify.sanitize(htmlStr);
            wrapper.appendChild(createSanitizedFragment(safeHtml));
            container.appendChild(wrapper);
        });
    }

    async function renderImage(docId, container) {
        container.textContent = "";
        var res = await apiFetch(filePath(docId));
        var blob = await res.blob();
        var img = document.createElement("img");
        var blobUrl = URL.createObjectURL(blob);
        img.src = blobUrl;
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        img.onload = function () { URL.revokeObjectURL(blobUrl); };
        container.appendChild(img);
    }

    async function renderDrawio(docId, container) {
        container.textContent = "Loading diagram...";
        var res = await apiFetch(filePath(docId));
        var xmlText = await res.text();
        container.textContent = "";

        var jsonConfig = JSON.stringify({ xml: xmlText });
        var attrSafe = jsonConfig.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
        var blob = new Blob([
            '<!DOCTYPE html><html><body>' +
            '<div class="mxgraph" data-mxgraph=\'' + attrSafe + '\'></div>' +
            '<script src="https://viewer.diagrams.net/js/viewer-static.min.js"><\/script>' +
            '</body></html>'
        ], { type: 'text/html' });
        var iframe = document.createElement("iframe");
        iframe.style.width = "100%";
        iframe.style.height = "600px";
        iframe.style.border = "2px inset var(--bg)";
        iframe.style.background = "#ffffff";
        iframe.frameBorder = "0";
        var blobUrl = URL.createObjectURL(blob);
        iframe.src = blobUrl;
        iframe.onload = function () { URL.revokeObjectURL(blobUrl); };
        container.appendChild(iframe);

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

    function renderCode(content, container) {
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
            currentDoc = null;
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
            // Empty search: re-render tree from cache, re-render current doc from cache
            renderTree();
            if (currentDoc) {
                loadDocument(currentDoc.id);
            }
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
                    // DOMPurify-sanitized before template.innerHTML
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

    // --- Desktop Icons ---
    var iconMyComputer = document.getElementById("icon-mycomputer");
    var iconRecycle = document.getElementById("icon-recycle");
    var sysinfoOverlay = document.getElementById("sysinfo-overlay");
    var sysinfoTable = document.getElementById("sysinfo-table");
    var allDesktopIcons = [iconMyComputer, iconRecycle];

    // Click to select, double-click to open
    allDesktopIcons.forEach(function (icon) {
        icon.addEventListener("click", function (e) {
            e.stopPropagation();
            allDesktopIcons.forEach(function (ic) { ic.classList.remove("selected"); });
            icon.classList.add("selected");
        });
    });

    // Click on desktop background deselects
    document.body.addEventListener("click", function (e) {
        if (!e.target.closest(".desktop-icon")) {
            allDesktopIcons.forEach(function (ic) { ic.classList.remove("selected"); });
        }
    });

    // My Computer — double-click to show system info (restores window if minimized)
    iconMyComputer.addEventListener("dblclick", function () {
        mainWindow.style.display = "flex";
        taskbar.style.display = "none";
        hideDesktopIcons();
        sysinfoTable.textContent = "";
        var loadingRow = document.createElement("tr");
        var loadingCell = document.createElement("td");
        loadingCell.colSpan = 2;
        loadingCell.textContent = "Caricamento...";
        loadingRow.appendChild(loadingCell);
        sysinfoTable.appendChild(loadingRow);
        sysinfoOverlay.style.display = "flex";

        apiFetch("/system-info").then(function (res) {
            return res.json();
        }).then(function (info) {
            sysinfoTable.textContent = "";
            var rows = [
                ["Computer", info.hostname],
                ["Sistema Operativo", info.os],
                ["Architettura", info.arch],
                ["Processori", info.cpu_count],
                ["Python", info.python],
                ["SQLite", info.sqlite],
                ["Database", info.db_size_mb + " MB"],
                ["Documenti", info.doc_count],
            ];
            rows.forEach(function (r) {
                var tr = document.createElement("tr");
                var tdLabel = document.createElement("td");
                tdLabel.className = "sysinfo-label";
                tdLabel.textContent = r[0] + ":";
                var tdValue = document.createElement("td");
                tdValue.textContent = r[1];
                tr.appendChild(tdLabel);
                tr.appendChild(tdValue);
                sysinfoTable.appendChild(tr);
            });
        }).catch(function () {
            sysinfoTable.textContent = "";
            var errRow = document.createElement("tr");
            var errCell = document.createElement("td");
            errCell.colSpan = 2;
            errCell.textContent = "Errore nel caricamento delle informazioni.";
            errRow.appendChild(errCell);
            sysinfoTable.appendChild(errRow);
        });
    });

    document.getElementById("sysinfo-close").addEventListener("click", function () {
        sysinfoOverlay.style.display = "none";
    });
    document.getElementById("sysinfo-ok").addEventListener("click", function () {
        sysinfoOverlay.style.display = "none";
    });

    // Recycle Bin — double-click shows empty message (restores window if minimized)
    iconRecycle.addEventListener("dblclick", function () {
        mainWindow.style.display = "flex";
        taskbar.style.display = "none";
        hideDesktopIcons();
        var msg = document.createElement("div");
        msg.className = "welcome-msg";
        var h = document.createElement("h2");
        h.textContent = "Cestino";
        var p = document.createElement("p");
        p.textContent = "Il Cestino \u00e8 vuoto.";
        msg.appendChild(h);
        msg.appendChild(p);
        setDocContainerContent([msg]);
    });

    // --- Init ---
    if (token) {
        showMain();
    } else {
        showLogin();
    }
})();
