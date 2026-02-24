"use strict";

import { state } from "./state.js";
import { apiFetch } from "./api.js";
import { openEditor, confirmDelete, loadDocuments, setDocContainerContent } from "./documents.js";
import { renderTree } from "./tree.js";

// --- DOM refs ---
var mainWindow = document.getElementById("main-window");
var menuNew = document.getElementById("menu-new");
var menuEdit = document.getElementById("menu-edit");
var menuView = document.getElementById("menu-view");
var menuHelp = document.getElementById("menu-help");
var dropdownFile = document.getElementById("dropdown-file");
var dropdownEdit = document.getElementById("dropdown-edit");
var dropdownView = document.getElementById("dropdown-view");
var dropdownHelp = document.getElementById("dropdown-help");
var allDropdowns = [dropdownFile, dropdownEdit, dropdownView, dropdownHelp];
var btnNewDoc = document.getElementById("btn-new-doc");
var btnRefresh = document.getElementById("btn-refresh");
var minimizeBtn = document.getElementById("minimize-btn");
var maximizeBtn = document.getElementById("maximize-btn");
var taskbar = document.getElementById("taskbar");
var taskbarBtn = document.getElementById("taskbar-btn");
var desktopIcons = document.getElementById("desktop-icons");
var resizeHandle = document.getElementById("resize-handle");
var treePanel = document.getElementById("tree-panel");
var treeContainer = document.getElementById("tree-container");
var folderOverlay = document.getElementById("folder-overlay");
var uploadOverlay = document.getElementById("upload-overlay");
var uploadFileInput = document.getElementById("upload-file");
var uploadProjectInput = document.getElementById("upload-project");
var uploadTagsInput = document.getElementById("upload-tags");
var uploadError = document.getElementById("upload-error");
var sysinfoOverlay = document.getElementById("sysinfo-overlay");
var sysinfoTable = document.getElementById("sysinfo-table");
var iconMyComputer = document.getElementById("icon-mycomputer");
var iconRecycle = document.getElementById("icon-recycle");
var recycleOverlay = document.getElementById("recycle-overlay");
var allDesktopIcons = [iconMyComputer, iconRecycle];

// --- Menu ---
function closeAllMenus() {
    allDropdowns.forEach(function (d) { d.classList.remove("show"); });
    state.menuOpen = false;
}

function openMenu(btn, dropdown) {
    closeAllMenus();
    dropdown.style.left = btn.offsetLeft + "px";
    dropdown.classList.add("show");
    state.menuOpen = true;
}

function showDesktopIcons() {
    desktopIcons.style.display = "flex";
}

function hideDesktopIcons() {
    desktopIcons.style.display = "none";
}

export function initWindows() {
    var menuButtons = [
        { btn: menuNew, dd: dropdownFile },
        { btn: menuEdit, dd: dropdownEdit },
        { btn: menuView, dd: dropdownView },
        { btn: menuHelp, dd: dropdownHelp },
    ];

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
            if (state.menuOpen) {
                openMenu(item.btn, item.dd);
            }
        });
    });

    document.addEventListener("click", closeAllMenus);

    // --- Window controls ---
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
        sysinfoOverlay.style.display = "none";
        var ro = document.getElementById("recycle-overlay");
        if (ro) ro.style.display = "none";
    });

    maximizeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (state.isMaximized) {
            mainWindow.classList.remove("maximized");
            maximizeBtn.textContent = "\u25A1";
            state.isMaximized = false;
        } else {
            mainWindow.classList.add("maximized");
            maximizeBtn.textContent = "\u29C9";
            state.isMaximized = true;
        }
    });

    // --- File menu items ---
    btnNewDoc.addEventListener("click", function () {
        closeAllMenus();
        openEditor(null);
    });

    // New Folder
    document.getElementById("btn-new-folder").addEventListener("click", function () {
        closeAllMenus();
        state.pendingFolderAction = null;
        document.getElementById("folder-name").value = "";
        folderOverlay.style.display = "flex";
        document.getElementById("folder-name").focus();
    });

    // Upload file
    document.getElementById("btn-upload").addEventListener("click", function () {
        closeAllMenus();
        uploadFileInput.value = "";
        var currentProject = "";
        if (state.currentDoc && state.currentDoc.project) currentProject = state.currentDoc.project;
        uploadProjectInput.value = currentProject;
        uploadTagsInput.value = "";
        uploadError.textContent = "";
        uploadOverlay.style.display = "flex";
    });

    btnRefresh.addEventListener("click", function () {
        closeAllMenus();
        loadDocuments();
    });

    // Change Password
    document.getElementById("btn-change-pw").addEventListener("click", function () {
        closeAllMenus();
    });

    // --- Edit menu ---
    document.getElementById("btn-edit-current").addEventListener("click", function () {
        closeAllMenus();
        if (!state.currentDoc) return;
        openEditor(state.currentDoc);
    });

    document.getElementById("btn-delete-current").addEventListener("click", function () {
        closeAllMenus();
        if (!state.currentDoc) return;
        confirmDelete(state.currentDoc);
    });

    // --- View menu ---
    document.getElementById("btn-expand-all").addEventListener("click", function () {
        closeAllMenus();
        state.collapsedPaths.clear();
        treeContainer.querySelectorAll(".tree-folder").forEach(function (f) {
            f.classList.remove("collapsed");
        });
    });

    document.getElementById("btn-collapse-all").addEventListener("click", function () {
        closeAllMenus();
        treeContainer.querySelectorAll(".tree-folder").forEach(function (f) {
            f.classList.add("collapsed");
            var path = f.dataset.project;
            if (path) state.collapsedPaths.add(path);
        });
    });

    // --- Help menu ---
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
        p3.textContent = window.location.hostname;
        about.appendChild(h);
        about.appendChild(p1);
        about.appendChild(p2);
        about.appendChild(p3);
        setDocContainerContent([about]);
    });

    // --- Resize ---
    resizeHandle.addEventListener("mousedown", function (e) {
        state.isResizing = true;
        e.preventDefault();
    });

    document.addEventListener("mousemove", function (e) {
        if (!state.isResizing) return;
        var newWidth = e.clientX - treePanel.getBoundingClientRect().left;
        if (newWidth > 100 && newWidth < 600) {
            treePanel.style.width = newWidth + "px";
        }
    });

    document.addEventListener("mouseup", function () {
        state.isResizing = false;
    });

    // --- Desktop Icons ---
    allDesktopIcons.forEach(function (icon) {
        icon.addEventListener("click", function (e) {
            e.stopPropagation();
            allDesktopIcons.forEach(function (ic) { ic.classList.remove("selected"); });
            icon.classList.add("selected");
        });
    });

    document.body.addEventListener("click", function (e) {
        if (!e.target.closest(".desktop-icon")) {
            allDesktopIcons.forEach(function (ic) { ic.classList.remove("selected"); });
        }
    });

    // My Computer -- double-click to show system info dialog
    iconMyComputer.addEventListener("dblclick", function () {
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

    // Recycle Bin -- double-click shows empty message in a dialog
    iconRecycle.addEventListener("dblclick", function () {
        if (recycleOverlay) {
            recycleOverlay.style.display = "flex";
        }
    });
    document.getElementById("recycle-close").addEventListener("click", function () {
        recycleOverlay.style.display = "none";
    });
    document.getElementById("recycle-ok").addEventListener("click", function () {
        recycleOverlay.style.display = "none";
    });
}
