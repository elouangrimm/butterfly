// Service worker: runs the SAME handlers as api/*.js, but locally in the browser.
// Bundle with:  npx esbuild background.js --bundle --format=esm --outfile=dist/background.js
import login from "../api/login.js";
import loginWebview from "../api/login-webview.js";
import loginQr from "../api/login-qr.js";
import overview from "../api/overview.js";
import timetable from "../api/timetable.js";
import assignments from "../api/assignments.js";

const ROUTES = {
  "/api/login": login,
  "/api/login-webview": loginWebview,
  "/api/login-qr": loginQr,
  "/api/overview": overview,
  "/api/timetable": timetable,
  "/api/assignments": assignments,
};

// Minimal fake req/res so the Vercel-style handlers run unchanged.
function run(handler, body) {
  return new Promise((resolve) => {
    let status = 200;
    const res = {
      status(c) { status = c; return res; },
      json(data) { resolve({ status, data }); return res; },
      setHeader() {}, send() {}, end() { resolve({ status, data: {} }); },
    };
    Promise.resolve(handler({ method: "POST", body }, res)).catch((err) =>
      resolve({ status: 500, data: { error: String(err?.message ?? err) } })
    );
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = ROUTES[msg?.endpoint];
  if (!handler) {
    sendResponse({ status: 404, data: { error: "Unknown endpoint: " + msg?.endpoint } });
    return;
  }
  run(handler, msg.body).then(sendResponse);
  return true; // keep the channel open for the async response
});
