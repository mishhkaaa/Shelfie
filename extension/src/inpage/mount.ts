import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { InpageApp } from "./InpageApp";
import { resumeRetryIfPending } from "./retryApply";

declare global {
  interface Window {
    __shelfieInpageMounted?: boolean;
  }
}

// Content scripts run once per real page load; Myntra's SPA pushState
// navigation (see content-script.ts) never re-triggers this file, so there's
// no teardown/re-mount concern — this guard only protects against a future
// refactor that adds imperative re-injection.
export function mountInpagePanel(): void {
  if (window.__shelfieInpageMounted) return;
  window.__shelfieInpageMounted = true;

  const host = document.createElement("div");
  host.id = "shelfie-inpage-root";
  // The Shadow DOM boundary isolates the PANEL's content from Myntra's CSS,
  // but the host element itself still lives in Myntra's page and is still
  // subject to broad page selectors (e.g. a `div { position: relative }` or
  // a flex/grid context on <body>) that could otherwise squash it to zero
  // size or an unexpected stacking context — pin these explicitly so the
  // fixed-position button/overlay inside always has a sane containing block.
  host.style.cssText = "position: fixed; top: 0; left: 0; width: 0; height: 0; overflow: visible; z-index: 2147483000;";
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });

  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);

  // React renders only after the compiled Tailwind CSS is actually in the
  // shadow root — rendering immediately and injecting CSS asynchronously
  // left a window where the backdrop/panel existed in the DOM (blocking
  // clicks, darkening the page) but had no styling applied yet, which read
  // as "an invisible popup" rather than a visible panel.
  const styleUrl = chrome.runtime.getURL("inpage-panel.css");
  fetch(styleUrl)
    .then((res) => res.text())
    .then((css) => {
      const style = document.createElement("style");
      style.textContent = css;
      shadowRoot.appendChild(style);
    })
    .catch((err) => console.error("Shelfie: failed to load in-page styles", err))
    .finally(() => {
      createRoot(mountPoint).render(createElement(InpageApp));
    });

  // Resume any apply-with-retry loop that's mid-flight from before this
  // reload (see retryApply.ts) — if all attempts are exhausted with still
  // no results, there's nothing more to auto-fix; just leave the user on
  // the last URL tried rather than silently looping forever.
  resumeRetryIfPending((constraints) => {
    console.warn("Shelfie: gave up retrying filters, no combination returned results", constraints);
  });
}
