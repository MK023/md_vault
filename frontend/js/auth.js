"use strict";

import { state } from "./state.js";
import { apiFetch, setOnUnauthorized } from "./api.js";

var loginSuccessCallback = null;

// --- DOM refs ---
var loginOverlay = document.getElementById("login-overlay");
var mainWindow = document.getElementById("main-window");
var usernameInput = document.getElementById("username");
var passwordInput = document.getElementById("password");
var loginBtn = document.getElementById("login-btn");
var loginError = document.getElementById("login-error");
var logoutBtn = document.getElementById("logout-btn");
var taskbar = document.getElementById("taskbar");
var desktopIcons = document.getElementById("desktop-icons");
var btnLogout = document.getElementById("btn-logout");
var pwOverlay = document.getElementById("pw-overlay");
var pwNewInput = document.getElementById("pw-new");
var pwConfirmInput = document.getElementById("pw-confirm");
var pwError = document.getElementById("pw-error");

export function onLoginSuccess(fn) {
    loginSuccessCallback = fn;
}

export function showLogin() {
    loginOverlay.style.display = "flex";
    mainWindow.style.display = "none";
    taskbar.style.display = "none";
    desktopIcons.style.display = "none";
    loginError.textContent = "";
    passwordInput.value = "";
    passwordInput.focus();
}

export function showMain() {
    loginOverlay.style.display = "none";
    mainWindow.style.display = "flex";
    taskbar.style.display = "none";
    desktopIcons.style.display = "none";
    if (loginSuccessCallback) loginSuccessCallback();
}

async function doLogin() {
    loginError.textContent = "";
    try {
        var res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: usernameInput.value,
                password: passwordInput.value,
            }),
        });
        if (!res.ok) {
            var data = await res.json();
            loginError.textContent = data.detail || "Login failed";
            return;
        }
        var data = await res.json();
        state.token = data.access_token;
        sessionStorage.setItem("md_vault_token", state.token);
        showMain();
    } catch (err) {
        loginError.textContent = "Connection error";
    }
}

function doLogout() {
    sessionStorage.removeItem("md_vault_token");
    state.token = null;
    showLogin();
}

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
            state.token = null;
            showLogin();
        } else {
            var data = await res.json();
            pwError.textContent = data.detail || "Failed to change password";
        }
    } catch (err) {
        pwError.textContent = "Connection error";
    }
}

export function initAuth() {
    setOnUnauthorized(showLogin);

    loginBtn.addEventListener("click", doLogin);
    passwordInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") doLogin();
    });

    logoutBtn.addEventListener("click", doLogout);
    btnLogout.addEventListener("click", doLogout);

    // Change Password dialog
    document.getElementById("btn-change-pw").addEventListener("click", function () {
        pwNewInput.value = "";
        pwConfirmInput.value = "";
        pwError.textContent = "";
        pwOverlay.style.display = "flex";
        pwNewInput.focus();
    });

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
}
