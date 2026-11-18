// Content script: relays messages between the Butterfly page and the extension.
// Runs at document_start so the flag exists before the page's own scripts run.
document.documentElement.dataset.butterflyExt = "1";

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== "butterfly-page") return;

  let reply;
  try {
    reply = await chrome.runtime.sendMessage({ endpoint: msg.endpoint, body: msg.body });
  } catch (err) {
    reply = { status: 500, data: { error: String(err?.message ?? err) } };
  }
  window.postMessage({ source: "butterfly-ext", id: msg.id, ...reply }, window.location.origin);
});
