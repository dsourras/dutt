import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function file(path) {
  return readFile(new URL(path, root));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

test("WooCommerce release manifests and packages are byte-for-byte consistent", async () => {
  const jsonManifest = JSON.parse(await file("plugin-updates/dutt-same-hour-delivery.json"));
  const routeManifest = JSON.parse(await file("plugin-updates/dutt-same-hour-delivery"));
  assert.deepEqual(routeManifest, jsonManifest);

  const packageName = new URL(jsonManifest.package).pathname.split("/").pop();
  assert.equal(packageName, `dutt-same-hour-delivery-${jsonManifest.version}.zip`);

  const versionedPackage = await file(`downloads/${packageName}`);
  const latestPackage = await file("downloads/dutt-same-hour-delivery-latest.zip");
  const genericPackage = await file("downloads/dutt-same-hour-delivery.zip");
  const expectedChecksum = `${jsonManifest.sha256}  ${packageName}`;
  const latestChecksum = `${jsonManifest.sha256}  dutt-same-hour-delivery-latest.zip`;

  assert.equal(versionedPackage.byteLength, jsonManifest.size_bytes);
  assert.equal(sha256(versionedPackage), jsonManifest.sha256);
  assert.equal(sha256(latestPackage), jsonManifest.sha256);
  assert.equal(sha256(genericPackage), jsonManifest.sha256);
  assert.equal((await file(`downloads/${packageName}.sha256`)).toString().trim(), expectedChecksum);
  assert.equal(
    (await file("downloads/dutt-same-hour-delivery-latest.zip.sha256")).toString().trim(),
    latestChecksum,
  );

  const installationPage = (await file("downloads/woocommerce-installation.html")).toString();
  assert.match(installationPage, new RegExp(`plugin ${jsonManifest.version.replaceAll(".", "\\.")}`));
});
