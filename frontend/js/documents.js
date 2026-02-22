"use strict";

import { state } from "./state.js";
import { apiFetch, loadScript } from "./api.js";

var documentsLoadedCallback = null;

// --- DOM refs ---
var docContainer = document.getElementById("doc-container");
var statusCount = document.getElementById("status-count");
var searchInput = document.getElementById("search-input");
var searchBtn = document.getElementById("search-btn");
var editorOverlay = document.getElementById("editor-overlay");
var editorTitle = document.getElementById("editor-title");
var docTitleInput = document.getElementById("doc-title");
var docProjectInput = document.getElementById("doc-project");
var docTagsInput = document.getElementById("doc-tags");
var docContentInput = document.getElementById("doc-content");
var editorSave = document.getElementById("editor-save");
var editorCancel = document.getElementById("editor-cancel");
var editorClose = document.getElementById("editor-close");
var deleteOverlay = document.getElementById("delete-overlay");
var deleteMsg = document.getElementById("delete-msg");
var deleteYes = document.getElementById("delete-yes");
var deleteNo = document.getElementById("delete-no");
var uploadOverlay = document.getElementById("upload-overlay");
var uploadFileInput = document.getElementById("upload-file");
var uploadProjectInput = document.getElementById("upload-project");
var uploadTagsInput = document.getElementById("upload-tags");
var uploadError = document.getElementById("upload-error");
var treeContainer = document.getElementById("tree-container");

// --- File icon map ---
export var FILE_ICONS = {
    pdf: "\u{1F4D5} ", doc: "\u{1F4DD} ", docx: "\u{1F4DD} ",
    xls: "\u{1F4CA} ", xlsx: "\u{1F4CA} ", csv: "\u{1F4CA} ",
    ppt: "\u{1F4CA} ", pptx: "\u{1F4CA} ",
    png: "\u{1F5BC} ", jpg: "\u{1F5BC} ", jpeg: "\u{1F5BC} ", gif: "\u{1F5BC} ", svg: "\u{1F5BC} ",
    md: "\u{1F4C3} ", txt: "\u{1F4C3} ",
    json: "\u{2699} ", yaml: "\u{2699} ", yml: "\u{2699} ", xml: "\u{2699} ",
};

export function onDocumentsLoaded(fn) {
    documentsLoadedCallback = fn;
}

// --- Safe HTML rendering ---
function sanitize(html) {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["mark"] });
}

export function setDocContainerContent(elements) {
    docContainer.textContent = "";
    elements.forEach(function (el) {
        docContainer.appendChild(el);
    });
}

function renderMarkdownSafe(markdownText) {
    var rawHtml = marked.parse(markdownText);
    return DOMPurify.sanitize(rawHtml);
}

// createSanitizedFragment: input is ALWAYS pre-sanitized via DOMPurify before reaching here
function createSanitizedFragment(sanitizedHtml) {
    var template = document.createElement("template");
    // Safe: input is DOMPurify-sanitized before this function is ever called
    template.innerHTML = sanitizedHtml;
    return template.content;
}

// --- File type helpers ---
export function getFileIcon(doc) {
    if (!doc.file_name) return "\u{1F4C4} ";
    var ext = doc.file_name.split(".").pop().toLowerCase();
    return FILE_ICONS[ext] || "\u{1F4CE} ";
}

export function getFileExt(doc) {
    if (!doc.file_name) return null;
    return doc.file_name.split(".").pop().toLowerCase();
}

export function getTreeLabel(doc) {
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

// --- Documents ---
export async function loadDocuments() {
    try {
        var res = await apiFetch("/docs");
        state.documents = await res.json();
        statusCount.textContent = state.documents.length + " document" + (state.documents.length !== 1 ? "s" : "");
        // Clean emptyFolders: remove paths where docs exist with that exact project
        state.emptyFolders = state.emptyFolders.filter(function (path) {
            return !state.documents.some(function (d) { return d.project === path; });
        });
        if (documentsLoadedCallback) documentsLoadedCallback();
    } catch (err) {
        // handled by apiFetch
    }
}

// --- Document View ---
export async function loadDocument(id) {
    try {
        var res = await apiFetch("/docs/" + id);
        if (!res.ok) return;
        var doc = await res.json();
        state.currentDocId = doc.id;
        state.currentDoc = doc;

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

        // Body -- render based on file type
        var body = document.createElement("div");
        body.className = "doc-body";
        var ext = getFileExt(doc);

        if (!doc.file_name || ext === "md" || ext === "txt") {
            // Markdown / plain text -- sanitized via DOMPurify
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

// --- Editor ---
export function openEditor(doc) {
    if (doc) {
        state.editingDocId = doc.id;
        editorTitle.textContent = "Edit Document";
        docTitleInput.value = doc.title;
        docProjectInput.value = doc.project || "";
        docTagsInput.value = (doc.tags || []).join(", ");
        docContentInput.value = doc.content;
    } else {
        state.editingDocId = null;
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

// --- Delete ---
export function confirmDelete(doc) {
    deleteMsg.textContent = 'Delete "' + doc.title + '"?';
    state.pendingDeleteAction = async function () {
        if (doc.project) {
            var othersInFolder = state.documents.filter(function (d) {
                return d.project === doc.project && d.id !== doc.id;
            });
            if (othersInFolder.length === 0 && !state.emptyFolders.includes(doc.project)) {
                state.emptyFolders.push(doc.project);
            }
        }
        await apiFetch("/docs/" + doc.id, { method: "DELETE" });
        state.currentDocId = null;
        state.currentDoc = null;
        showWelcome();
        await loadDocuments();
    };
    deleteOverlay.style.display = "flex";
}

export function showWelcome() {
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

// --- Search ---
export async function doSearch() {
    var q = searchInput.value.trim();
    if (!q) {
        // Empty search: re-render tree from cache, re-render current doc from cache
        if (documentsLoadedCallback) documentsLoadedCallback();
        if (state.currentDoc) {
            loadDocument(state.currentDoc.id);
        }
        return;
    }

    try {
        var res = await apiFetch("/search?q=" + encodeURIComponent(q));
        if (!res.ok) return;
        var results = await res.json();

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

// --- Upload ---
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

export function initDocuments() {
    // Editor listeners
    editorCancel.addEventListener("click", closeEditor);
    editorClose.addEventListener("click", closeEditor);

    editorSave.addEventListener("click", async function () {
        var payload = {
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
            var res;
            if (state.editingDocId) {
                res = await apiFetch("/docs/" + state.editingDocId, {
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
                var saved = await res.json();
                closeEditor();
                await loadDocuments();
                loadDocument(saved.id);
            }
        } catch (err) {
            // handled
        }
    });

    // Delete dialog listeners
    deleteNo.addEventListener("click", function () {
        deleteOverlay.style.display = "none";
        state.pendingDeleteAction = null;
    });

    deleteYes.addEventListener("click", async function () {
        if (!state.pendingDeleteAction) return;
        var action = state.pendingDeleteAction;
        state.pendingDeleteAction = null;
        deleteOverlay.style.display = "none";
        try {
            await action();
        } catch (err) {
            // handled
        }
    });

    // Upload dialog listeners
    document.getElementById("upload-ok").addEventListener("click", doUpload);
    document.getElementById("upload-cancel").addEventListener("click", function () {
        uploadOverlay.style.display = "none";
    });
    document.getElementById("upload-close").addEventListener("click", function () {
        uploadOverlay.style.display = "none";
    });

    // Search listeners
    searchBtn.addEventListener("click", doSearch);
    searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") doSearch();
    });
}
