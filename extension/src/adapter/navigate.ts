// Single shared mechanism for driving the real Myntra tab from a constraint
// object — used by both ProfileList (reopening a saved profile) and
// IntentCompiler (applying an AI-compiled patch). There must only ever be
// one way to do this: a second parallel implementation is exactly how you'd
// end up with one path that updates the real page and another that only
// pretends to (see BACKEND_BUILD_LOG.md's "Apply to search" postmortem).
export function navigateActiveTabTo(url: string): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { type: "NAVIGATE_TO", url }, () => {
      if (chrome.runtime.lastError) {
        // Content script isn't loaded (e.g. the tab wasn't refreshed since
        // install) — fall back to a hard navigation.
        chrome.tabs.update(tabId, { url });
      }
    });
  });
}
