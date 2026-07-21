/// <reference types="chrome" />
// background.ts
chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
  // This tells Chrome to open the side panel when the user clicks our extension icon
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});
