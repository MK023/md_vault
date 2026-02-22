import { state } from "./state.js";
import { initAuth, showLogin, showMain, onLoginSuccess } from "./auth.js";
import { initDocuments, loadDocuments, onDocumentsLoaded } from "./documents.js";
import { initTree, renderTree } from "./tree.js";
import { initWindows } from "./windows.js";

// Wire cross-module callbacks
onLoginSuccess(loadDocuments);
onDocumentsLoaded(renderTree);

// Initialize all modules
initAuth();
initDocuments();
initTree();
initWindows();

// Start
if (state.token) {
    showMain();
} else {
    showLogin();
}
