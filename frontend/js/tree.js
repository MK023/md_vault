"use strict";

import { state } from "./state.js";
import { apiFetch } from "./api.js";
import { getFileIcon, getTreeLabel, loadDocuments, loadDocument, openEditor, confirmDelete } from "./documents.js";

// --- DOM refs ---
var treeContainer = document.getElementById("tree-container");
var folderOverlay = document.getElementById("folder-overlay");
var folderNameInput = document.getElementById("folder-name");
var deleteOverlay = document.getElementById("delete-overlay");
var deleteMsg = document.getElementById("delete-msg");

// --- Folder tree builder ---
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
    state.documents.forEach(function (doc) {
        if (!doc.project) return;
        var parts = doc.project.split("/");
        ensurePath(parts).docs.push(doc);
    });
    state.emptyFolders.forEach(function (path) {
        ensurePath(path.split("/"));
    });
    return root;
}

// --- createTreeFile: DOM only, zero listeners ---
function createTreeFile(doc) {
    var file = document.createElement("div");
    file.className = "tree-file tree-file-custom-icon";
    file.draggable = true;
    file.dataset.docId = doc.id;
    if (doc.id === state.currentDocId) file.classList.add("active");
    file.textContent = getFileIcon(doc) + getTreeLabel(doc);
    return file;
}

// --- createTreeFolder: DOM only, zero listeners ---
function createTreeFolder(name, fullPath, node) {
    var folder = document.createElement("div");
    folder.className = "tree-folder";
    folder.dataset.project = fullPath;

    // Restore collapsed state
    if (state.collapsedPaths.has(fullPath)) {
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

// --- Drag & Drop helpers ---
async function moveDocument(docId, newProject) {
    try {
        var res = await apiFetch("/docs/" + docId, {
            method: "PUT",
            body: { project: newProject },
        });
        if (res.ok) {
            await loadDocuments();
            if (state.currentDocId === docId) loadDocument(docId);
        }
    } catch (err) {
        // handled
    }
}

// --- Context menus ---
function hideContextMenu() {
    if (state.ctxMenu && state.ctxMenu.parentNode) {
        state.ctxMenu.parentNode.removeChild(state.ctxMenu);
    }
    state.ctxMenu = null;
}

function createContextMenu(x, y, items) {
    hideContextMenu();
    state.ctxMenu = document.createElement("div");
    state.ctxMenu.className = "dropdown-menu show";
    state.ctxMenu.style.position = "fixed";
    state.ctxMenu.style.left = x + "px";
    state.ctxMenu.style.top = y + "px";
    state.ctxMenu.style.zIndex = "300";
    items.forEach(function (item) {
        var btn = document.createElement("button");
        btn.className = "dropdown-item";
        btn.textContent = item.label;
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            hideContextMenu();
            item.action();
        });
        state.ctxMenu.appendChild(btn);
    });
    document.body.appendChild(state.ctxMenu);
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

function showFileContextMenu(x, y, doc) {
    createContextMenu(x, y, [
        { label: "Edit", action: function () { openEditorForDoc(doc.id); } },
        { label: "Delete", action: function () { confirmDeleteFromList(doc.id); } },
    ]);
}

function showFolderContextMenu(x, y, fullPath, node) {
    createContextMenu(x, y, [
        { label: "New Subfolder", action: function () { promptNewSubfolder(fullPath); } },
        { label: "Rename Folder", action: function () { promptRenameFolder(fullPath); } },
        { label: "Delete Folder", action: function () { confirmDeleteFolder(fullPath, node); } },
    ]);
}

// --- Folder operations ---
function promptNewSubfolder(parentPath) {
    folderNameInput.value = "";
    state.pendingFolderAction = function () {
        var name = folderNameInput.value.trim();
        if (!name) return;
        var newPath = parentPath + "/" + name;
        if (!state.emptyFolders.includes(newPath)) {
            state.emptyFolders.push(newPath);
        }
        renderTree();
    };
    folderOverlay.style.display = "flex";
    folderNameInput.focus();
}

function promptRenameFolder(oldName) {
    folderNameInput.value = oldName;
    state.pendingFolderAction = function () {
        var newName = folderNameInput.value.trim();
        if (!newName || newName === oldName) return;
        renameFolder(oldName, newName);
    };
    folderOverlay.style.display = "flex";
    folderNameInput.focus();
    folderNameInput.select();
}

async function renameFolder(oldPath, newPath) {
    var docsToUpdate = state.documents.filter(function (d) {
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
    state.emptyFolders = state.emptyFolders.map(function (p) {
        if (p === oldPath) return newPath;
        if (p.startsWith(oldPath + "/")) return newPath + p.substring(oldPath.length);
        return p;
    });
    // Update collapsed paths
    var newCollapsed = new Set();
    state.collapsedPaths.forEach(function (p) {
        if (p === oldPath) {
            newCollapsed.add(newPath);
        } else if (p.startsWith(oldPath + "/")) {
            newCollapsed.add(newPath + p.substring(oldPath.length));
        } else {
            newCollapsed.add(p);
        }
    });
    state.collapsedPaths = newCollapsed;
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
    state.pendingDeleteAction = async function () {
        for (var i = 0; i < allDocs.length; i++) {
            await apiFetch("/docs/" + allDocs[i].id, {
                method: "PUT",
                body: { project: null },
            });
        }
        state.emptyFolders = state.emptyFolders.filter(function (p) {
            return p !== fullPath && !p.startsWith(fullPath + "/");
        });
        state.collapsedPaths.delete(fullPath);
        await loadDocuments();
    };
    deleteOverlay.style.display = "flex";
}

// --- handleFolderOk ---
function handleFolderOk() {
    if (state.pendingFolderAction) {
        state.pendingFolderAction();
        state.pendingFolderAction = null;
    } else {
        var name = folderNameInput.value.trim();
        if (!name) return;
        if (!state.emptyFolders.includes(name)) {
            state.emptyFolders.push(name);
        }
        renderTree();
    }
    folderOverlay.style.display = "none";
}

function closeFolderDialog() {
    folderOverlay.style.display = "none";
    state.pendingFolderAction = null;
}

// --- Render Tree ---
export function renderTree() {
    // Save collapsed state before clearing
    treeContainer.querySelectorAll(".tree-folder.collapsed").forEach(function (f) {
        var path = f.dataset.project;
        if (path) state.collapsedPaths.add(path);
    });

    treeContainer.textContent = "";
    var ungrouped = state.documents.filter(function (d) { return !d.project; });

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

    if (state.documents.length === 0 && sortedNames.length === 0) {
        var empty = document.createElement("div");
        empty.className = "tree-no-project";
        empty.textContent = "No documents yet";
        treeContainer.appendChild(empty);
    }
}

// --- Init Tree ---
export function initTree() {
    // Event delegation on treeContainer
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
                        state.collapsedPaths.add(path);
                    } else {
                        state.collapsedPaths.delete(path);
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
            var doc = state.documents.find(function (d) { return d.id === docId; });
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

    // Context menu close on click
    document.addEventListener("click", hideContextMenu);

    // Folder dialog listeners
    document.getElementById("folder-ok").addEventListener("click", handleFolderOk);
    folderNameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") handleFolderOk();
    });
    document.getElementById("folder-cancel").addEventListener("click", closeFolderDialog);
    document.getElementById("folder-close").addEventListener("click", closeFolderDialog);
}
