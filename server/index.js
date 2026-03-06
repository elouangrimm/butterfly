/**
 * Butterfly local API server — Tauri sidecar
 *
 * Wraps every api/ Vercel handler behind an Express HTTP server so Tauri can
 * call them on http://127.0.0.1:47291.  The Vercel serverless signature
 * (req, res) is identical to Express, so handlers work without any adapters.
 */

import express from "express";
import loginHandler from "../api/login.js";
import loginWebviewHandler from "../api/login-webview.js";
import proxyInitHandler from "../api/proxy-init.js";
import proxyHandler from "../api/proxy.js";
import overviewHandler from "../api/overview.js";
import timetableHandler from "../api/timetable.js";
import assignmentsHandler from "../api/assignments.js";

const PORT = 47291;
const HOST = "127.0.0.1"; // loopback only — not exposed to network

const app = express();

// Body parsers  
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// CORS — allow the Tauri WebView origin (tauri://localhost or asset requests)
app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "X-Proxy-Cookies, X-Proxy-Final-Url");
    next();
});
app.options("*", (_req, res) => res.sendStatus(204));

// ── API routes (map Vercel handler → Express) ────────────────────────────────
app.post("/api/login",          (req, res) => loginHandler(req, res));
app.post("/api/login-webview",  (req, res) => loginWebviewHandler(req, res));
app.post("/api/proxy-init",     (req, res) => proxyInitHandler(req, res));
app.all ("/api/proxy",          (req, res) => proxyHandler(req, res));
app.post("/api/overview",       (req, res) => overviewHandler(req, res));
app.post("/api/timetable",      (req, res) => timetableHandler(req, res));
app.post("/api/assignments",    (req, res) => assignmentsHandler(req, res));

// Health check
app.get("/api/ping", (_req, res) => res.json({ ok: true, port: PORT }));

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
    // Signal readiness to Tauri (the parent process reads this line from stdout)
    process.stdout.write(JSON.stringify({ ready: true, port: PORT }) + "\n");
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT",  () => process.exit(0));
