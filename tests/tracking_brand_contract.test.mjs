import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const trackingPageUrl = new URL("../t/index.html", import.meta.url);
const appIconUrl = new URL("../dutt-app-icon.png", import.meta.url);

test("secure tracking page uses the current DUTT app icon everywhere", async () => {
  const [html, icon] = await Promise.all([
    readFile(trackingPageUrl, "utf8"),
    readFile(appIconUrl),
  ]);

  assert.match(html, /<img src="\.\.\/dutt-app-icon\.png" alt="DUTT">/u);
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/dutt\.gr\/dutt-app-icon\.png">/u,
  );
  assert.match(
    html,
    /<meta name="twitter:image" content="https:\/\/dutt\.gr\/dutt-app-icon\.png">/u,
  );
  assert.doesNotMatch(html, /<img src="\.\.\/logo\.png"/u);
  assert.equal(icon.subarray(1, 4).toString("ascii"), "PNG");
  assert.ok(icon.length > 10_000);
});
