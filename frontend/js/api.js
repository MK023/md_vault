"use strict";

import { state } from "./state.js";

const API = "/api";
var scriptCache = {};
var onUnauthorized = null;

export function setOnUnauthorized(fn) {
    onUnauthorized = fn;
}

export async function apiFetch(path, opts = {}) {
    var headers = opts.headers || {};
    if (state.token) headers["Authorization"] = "Bearer " + state.token;
    if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(opts.body);
    }
    var res = await fetch(API + path, { ...opts, headers });
    if (res.status === 401) {
        sessionStorage.removeItem("md_vault_token");
        state.token = null;
        if (onUnauthorized) onUnauthorized();
        throw new Error("Unauthorized");
    }
    return res;
}

export function loadScript(url) {
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
