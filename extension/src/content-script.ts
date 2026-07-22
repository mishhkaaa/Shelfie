// content-script.ts
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
