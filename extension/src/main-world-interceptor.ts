// Injected into the MAIN world (the page's own JS context, not the
// extension's isolated content-script world) — this is the only way to see
// Myntra's own fetch()/XHR calls, since an isolated-world content script has
// a separate `window` and can only patch its own private copy of fetch.
// This file cannot import anything from chrome.* (MAIN-world scripts have no
// extension API access at all) — the only way out is window.postMessage,
// relayed by content-script.ts's isolated-world listener.
//
// This started as a read-only signal for live filter state, and now also
// reports the search response's result count — used by the retry-on-zero-
// results flow (see inpage/retryApply.ts) so an applied filter combination
// that Myntra actually returns nothing for can be detected and repaired,
// instead of silently leaving the user on a dead page. Still never used to
// WRITE/apply filters directly — applying always goes through
// buildUrlFromConstraints + a real navigation.
(function () {
  const GATEWAY_PATTERN = /\/gateway\/v4\/search\//;

  function isGatewaySearchUrl(rawUrl: string): boolean {
    try {
      const u = new URL(rawUrl, window.location.href);
      return u.host === "www.myntra.com" && GATEWAY_PATTERN.test(u.pathname);
    } catch {
      return false;
    }
  }

  function reportUrl(url: string): void {
    window.postMessage({ source: "shelfie-interceptor", type: "GATEWAY_SEARCH_URL", url }, "https://www.myntra.com");
  }

  // The response body shape is undocumented — probe the handful of field
  // names a Myntra-style search API is plausibly using rather than assuming
  // one exact schema. Returns null (not 0) when nothing recognizable is
  // found, so callers can tell "genuinely zero results" apart from "we
  // couldn't parse this response" and avoid retrying on a false signal.
  function extractResultCount(body: unknown): number | null {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    const candidates = [
      b.totalCount,
      b.total,
      (b.data as Record<string, unknown> | undefined)?.totalCount,
      Array.isArray(b.products) ? b.products.length : undefined,
      Array.isArray((b.data as Record<string, unknown> | undefined)?.products)
        ? ((b.data as Record<string, unknown>).products as unknown[]).length
        : undefined,
    ];
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c)) return c;
    }
    return null;
  }

  function reportResult(url: string, resultCount: number | null): void {
    window.postMessage(
      { source: "shelfie-interceptor", type: "GATEWAY_SEARCH_RESULT", url, resultCount },
      "https://www.myntra.com"
    );
  }

  const originalFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isMatch = isGatewaySearchUrl(url);
    if (isMatch) reportUrl(url);

    const result = originalFetch.call(this, input as any, init);
    if (isMatch) {
      result
        .then((res) => res.clone().json())
        .then((body) => reportResult(url, extractResultCount(body)))
        .catch(() => reportResult(url, null));
    }
    return result;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    const urlStr = typeof url === "string" ? url : url.toString();
    const isMatch = isGatewaySearchUrl(urlStr);
    if (isMatch) {
      reportUrl(urlStr);
      this.addEventListener("load", () => {
        try {
          reportResult(urlStr, extractResultCount(JSON.parse(this.responseText)));
        } catch {
          reportResult(urlStr, null);
        }
      });
    }
    // @ts-expect-error - forwarding the original variadic signature as-is
    return originalOpen.call(this, method, url, ...rest);
  };
})();
