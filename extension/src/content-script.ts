// content-script.ts
import { parseGatewayUrlToConstraints } from "./adapter/urlSchema";

console.log("Shelfie Content Script Loaded!");

// We need to notify the Side Panel whenever the Myntra URL changes.
// Myntra is a Single Page Application, so it doesn't reload the page.
// We have to listen to `pushState` and `popstate` events.

function notifyUrlChange() {
  chrome.runtime.sendMessage({ 
    type: "MYNTRA_URL_CHANGED", 
    url: window.location.href 
  }, () => {
    if (chrome.runtime.lastError) {
      // Ignore: Side panel might be closed
    }
  });
}

// 1. Fire on initial load
notifyUrlChange();

// 2. Listen to normal browser navigation (Back/Forward buttons)
window.addEventListener("popstate", notifyUrlChange);

// 3. Listen to Myntra's internal router (pushState)
// This is a common hack to detect URL changes in SPAs without polling
const originalPushState = history.pushState;
history.pushState = function (...args) {
  originalPushState.apply(this, args);
  notifyUrlChange();
};

const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
  originalReplaceState.apply(this, args);
  notifyUrlChange();
};

// 4. Listen for navigation commands from the Side Panel
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "NAVIGATE_TO") {
    console.log("Shelfie: Navigating to", msg.url);
    window.location.href = msg.url;
  }
});

// 5. Relay from the MAIN-world interceptor (main-world-interceptor.ts) —
// that script patches window.fetch/XHR in the page's REAL js context (an
// isolated-world content script can't see the page's own fetch calls, they
// have separate `window` objects) and posts a message here whenever Myntra's
// own app hits its search gateway. This is an additive read-signal only —
// it enriches liveConstraints alongside MYNTRA_URL_CHANGED above, it never
// replaces it, and it's never used to apply/write filters.
window.addEventListener("message", (event) => {
  if (event.origin !== "https://www.myntra.com") return;
  if (event.data?.source !== "shelfie-interceptor") return;

  if (event.data.type === "GATEWAY_SEARCH_URL") {
    try {
      const constraints = parseGatewayUrlToConstraints(event.data.url);
      chrome.runtime.sendMessage({ type: "MYNTRA_GATEWAY_CONSTRAINTS", constraints }, () => {
        if (chrome.runtime.lastError) {
          // Ignore: side panel might be closed.
        }
      });
    } catch (err) {
      console.error("Shelfie: failed to parse intercepted gateway URL", err);
    }
    return;
  }

  if (event.data.type === "GATEWAY_SEARCH_RESULT") {
    // Also dispatched as a same-page custom event (not just chrome.runtime
    // messaging) so the in-page panel — itself a content script sharing this
    // page's DOM — can listen for it directly without a round-trip through
    // the extension messaging bus, which the retry-on-zero-results flow
    // needs to react to as soon as the reload it triggered finishes.
    window.dispatchEvent(
      new CustomEvent("shelfie:gateway-result", {
        detail: { url: event.data.url, resultCount: event.data.resultCount },
      })
    );
  }
});
