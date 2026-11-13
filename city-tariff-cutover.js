(() => {
  "use strict";

  const effectiveAt = Date.parse("2026-11-15T00:00:00+02:00");
  const terms = "/documents/service-terms-v1.7-2026-11-15.html";
  const charter = "/documents/consumer-charter-v1.6-2026-11-15.html";
  const current = Date.now() >= effectiveAt;
  const url = new URL(window.location.href);

  if (current && !url.searchParams.has("archive")) {
    const pages = { "/service-terms.html": terms, "/consumer-charter.html": charter };
    const next = pages[url.pathname];
    if (next) {
      window.location.replace(next + url.hash);
      return;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!current) return;
    const notice = document.querySelector("[data-city-tariff-notice]");
    if (notice) notice.remove();
  });
})();
