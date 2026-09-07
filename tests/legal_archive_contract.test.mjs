import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const homepage = read('index.html');
const archive = read('legal-archive.html');
const charter = read('consumer-charter.html');
const agreement = read('service-terms.html');
const terms = read('terms.html');
const privacy = read('privacy.html');

const immutableHashes = {
  'legal/versions/consumer-charter-v1.0-2026-08-29.html': 'd346a94b7398bf1f6c7d972e49e7d68df9a6c245c56f010572f455c8ecba12b4',
  'legal/versions/consumer-charter-v1.1-2026-08-30.html': '86f960a7885f034db4ab863f1b9f399a1768b4998540f7f8c8e683383243e06c',
  'legal/versions/privacy-v1.0-2026-04-04.html': 'f51bb34cdb24c01494fa451e307b4e79da71d3d31d6e8f4c73f6070ab69f0cd8',
  'legal/versions/service-terms-v1.0-2026-08-21.html': '6fd16f4c5f6855b4dc4a315aaee04989c3bdf323d387f0a7c700ef6491e58886',
  'legal/versions/service-terms-v1.1-2026-08-30.html': 'c3c2063f1e71090eff26cd69afdcf84bbe4add431832b72c789dcb5f7c1044ff',
  'legal/versions/terms-v1.0-2026-08-21.html': 'e0dd0cf7620ec8635eb39417d2490d64140bc2ad32ff4eabfee6b536aea92088',
};

test('homepage and every current legal document expose the public archive', () => {
  for (const document of [homepage, charter, agreement, terms, privacy]) {
    assert.match(document, /href="\/legal-archive\.html"/);
  }
  assert.match(homepage, /footerLink8: "Legal document archive"/);
  assert.match(homepage, /footerLink8: "Αρχείο νομικών κειμένων"/);
});

test('archive lists every current and previous public version', () => {
  for (const marker of [
    'service-terms-v1.0-2026-08-21.html',
    'service-terms-v1.1-2026-08-30.html',
    'consumer-charter-v1.0-2026-08-29.html',
    'consumer-charter-v1.1-2026-08-30.html',
    'terms-v1.0-2026-08-21.html',
    'privacy-v1.0-2026-04-04.html',
    'Έκδοση νομικών κειμένων',
  ]) {
    if (marker === 'Έκδοση νομικών κειμένων') continue;
    assert.ok(archive.includes(marker), `missing archive marker: ${marker}`);
  }
  assert.match(archive, /<span class="version-id">1\.2<\/span>/);
  assert.match(archive, /<span class="version-id">2\.0<\/span>/);
  assert.match(archive, /Οι χρεώσεις δεν μεταβλήθηκαν/);
});

test('archived versions remain byte-for-byte immutable', () => {
  for (const [path, expectedHash] of Object.entries(immutableHashes)) {
    const url = new URL(path, root);
    assert.equal(existsSync(url), true, `missing archived file: ${path}`);
    const canonicalContent = readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
    const hash = createHash('sha256').update(canonicalContent).digest('hex');
    assert.equal(hash, expectedHash, `archived file changed: ${path}`);
  }
});

test('current legal texts share the mandatory deadlines and retention policy', () => {
  for (const document of [charter, agreement]) {
    assert.match(document, /μία εργάσιμη ημέρα/);
    assert.match(document, /one working day/);
    assert.match(document, /δεκαπέντε εργάσιμες ημέρες/);
    assert.match(document, /fifteen business days/);
    assert.match(document, /τουλάχιστον δύο έτη/);
    assert.match(document, /at least two years/);
  }
  assert.match(privacy, /τουλάχιστον δύο έτη/);
  assert.match(privacy, /at least two years/);
  assert.match(privacy, /30 ημέρες/);
  assert.match(privacy, /30 days/);
});

test('privacy policy covers the real ecosystem and data-subject safeguards', () => {
  for (const marker of [
    'ΣΟΥΡΡΑΣ ΔΗΜΗΤΡΙΟΣ ΕΥΑΓΓΕΛΟΣ',
    'WooCommerce',
    'ΣΥ.ΔΕ.ΤΑ.',
    'Google/Firebase',
    'Viva.com',
    'Elorus',
    'Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα',
    'Hellenic Data Protection Authority',
    'legal hold',
  ]) assert.ok(privacy.includes(marker), `missing privacy marker: ${marker}`);
  assert.doesNotMatch(privacy, /for as long as reasonably necessary|για όσο χρονικό διάστημα είναι εύλογα απαραίτητο/i);
});

test('current documents contain no unresolved launch or drafting markers', () => {
  const unresolved = /προσχέδι|προεπισκόπηση|θα συμπληρω|υπό συμπλήρωση|υπό τεχνική επιβεβαίωση|πριν από την εμπορική έναρξη|public draft|public preview|to be completed|before commercial launch|undergoing technical confirmation|TODO|TBD|PLACEHOLDER/i;
  for (const [name, document] of Object.entries({ charter, agreement, terms, privacy, archive })) {
    assert.doesNotMatch(document, unresolved, `${name} contains an unresolved marker`);
  }
});
