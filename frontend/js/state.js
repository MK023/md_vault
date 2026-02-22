"use strict";

export const state = {
    token: sessionStorage.getItem("md_vault_token"),
    documents: [],
    currentDocId: null,
    currentDoc: null,
    editingDocId: null,
    pendingFolderAction: null,
    emptyFolders: [],
    collapsedPaths: new Set(),
    menuOpen: false,
    isMaximized: false,
    pendingDeleteAction: null,
    ctxMenu: null,
    isResizing: false,
};
