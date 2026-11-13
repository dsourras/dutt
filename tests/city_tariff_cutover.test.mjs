import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const script = readFileSync(new URL("../city-tariff-cutover.js", import.meta.url), "utf8");
const effectiveAt = Date.parse("2026-11-14T22:00:00Z");

function visit(path, now) {
  const effects = [];
  vm.runInNewContext(script, {
    Date: { parse: Date.parse, now: () => now },
    URL,
    window: { location: {
      href: `https://dutt.gr${path}`,
      replace: next => effects.push(next),
    } },
    document: {
      addEventListener: (event, callback) => { if (event === "DOMContentLoaded") callback(); },
      querySelector: selector => selector === "[data-city-tariff-notice]"
        ? { remove: () => effects.push("removed notice") } : null,
    },
  });
  return effects;
}

test("the public tariff changes exactly at midnight in Athens", () => {
  assert.deepEqual(visit("/service-terms.html#pricing", effectiveAt - 1), []);
  assert.deepEqual(visit("/service-terms.html#pricing-en", effectiveAt),
    ["/documents/service-terms-v1.7-2026-11-15.html#pricing-en"]);
  assert.deepEqual(visit("/consumer-charter.html#pricing", effectiveAt),
    ["/documents/consumer-charter-v1.6-2026-11-15.html#pricing"]);
  assert.deepEqual(visit("/", effectiveAt - 1), []);
  assert.deepEqual(visit("/", effectiveAt), ["removed notice"]);
  for (const path of ["/service-terms.html?archive=1", "/consumer-charter.html?archive=1"]) {
    assert.ok(!visit(path, effectiveAt).some(effect => effect.startsWith("/documents/")));
  }
});
