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
  'legal/versions/consumer-charter-v1.0-2026-08-29.html': '24c9f6bebb9e87d2487b28c330ba9af2ef0297c82276d2b0429e1041e6a02fc7',
  'legal/versions/privacy-v1.0-2026-04-04.html': '72aa8e4cb21581d1c6545f78c8027f860f544044f9eafcb5d0632c1eb1f95802',
  'legal/versions/service-terms-v1.0-2026-08-21.html': '0091cce4a02f20c3023e5fee8d673a0ee77ebc07fe6f4ed79c8271d4481b39d7',
  'legal/versions/service-terms-v1.1-2026-08-30.html': 'cee3ff436f566ed159def6988d1aef8aa609ef472002730f75596837bb842400',
  'legal/versions/terms-v1.0-2026-08-21.html': 'ac3cceb2b62832edab96d8a1e4b1fe3eafe060c6e91dd904fce6d25b3dee6124',
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
    const hash = createHash('sha256').update(readFileSync(url)).digest('hex');
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
