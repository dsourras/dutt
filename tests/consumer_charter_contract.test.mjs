import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const charter = readFileSync(new URL('../consumer-charter.html', import.meta.url), 'utf8');
const homepage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const terms = readFileSync(new URL('../terms.html', import.meta.url), 'utf8');
const agreement = readFileSync(new URL('../service-terms.html', import.meta.url), 'utf8');

function scriptValue(name) {
  const marker = `const ${name} = `;
  const start = charter.indexOf(marker);
  assert.notEqual(start, -1, `${name} declaration is missing`);
  const valueStart = start + marker.length;
  const end = charter.indexOf('\n    ];', valueStart);
  assert.notEqual(end, -1, `${name} declaration is incomplete`);
  return vm.runInNewContext(`(${charter.slice(valueStart, end + 6)})`);
}

test('charter is a dedicated Greek-first bilingual document', () => {
  assert.match(charter, /<html lang="el">/);
  assert.match(charter, /Χάρτης Υποχρεώσεων προς τον Χρήστη-Καταναλωτή/);
  assert.match(charter, /User and Consumer Obligations Charter/);
  assert.deepEqual(
    [...charter.matchAll(/data-language-button="([^"]+)"/g)]
      .map((match) => match[1])
      .sort(),
    ['el', 'en'],
  );
});

test('homepage, general terms and individual agreement expose the charter', () => {
  assert.match(homepage, /href="\/consumer-charter\.html"[^>]*data-i18n="footerLink6"/);
  assert.match(homepage, /footerLink6: "Χάρτης Υποχρεώσεων προς τον Χρήστη-Καταναλωτή"/);
  assert.match(homepage, /footerLink6: "User and Consumer Obligations Charter"/);
  assert.match(terms, /href="\/consumer-charter\.html"/);
  assert.match(agreement, /href="\/consumer-charter\.html"/);
});

test('charter contains every minimum EETT topic in Greek and English', () => {
  const topics = [
    'Παρουσίαση επιχείρησης, οργάνωσης και δικτύου',
    'Παρεχόμενες υπηρεσίες',
    'Χρόνοι, ποιότητα και παρακολούθηση',
    'Τιμοκατάλογος υπηρεσιών',
    'Μη αποδεκτά και απαγορευμένα αντικείμενα',
    'Επίδοση, αποτυχημένη προσπάθεια και ανεπίδοτα',
    'Ευθύνη, αποζημιώσεις και προθεσμίες',
    'Περιπτώσεις έλλειψης ευθύνης',
    'Παράπονα, καταγγελίες και επίλυση διαφορών',
    'Επιτροπή Επίλυσης Διαφορών',
    'Εξυπηρέτηση χρηστών και προσβασιμότητα',
    'Προσωπικά δεδομένα και απόρρητο επικοινωνιών',
    'Ατομική σύμβαση και έγγραφα που λαμβάνει ο χρήστης',
    'Business, organisation and network',
    'Services supplied',
    'Service price list',
    'Dispute Resolution Committee',
    'User support and accessibility',
    'Personal data and confidentiality of communications',
    'Individual agreement and documents supplied to the user',
  ];
  for (const topic of topics) assert.ok(charter.includes(topic), `missing topic: ${topic}`);
});

test('complaint process carries the mandatory operational safeguards', () => {
  const safeguards = [
    'μοναδικό αριθμό αναφοράς',
    'δεκαπέντε εργάσιμες ημέρες',
    'Δευτέρα-Παρασκευή, 09:00-17:00',
    'δεν είναι πρόσθετης χρέωσης',
    'δικαιούται να παραστεί',
    'εκπρόσωπο των χρηστών',
  ];
  for (const safeguard of safeguards) {
    assert.ok(charter.includes(safeguard), `missing complaint safeguard: ${safeguard}`);
  }
});

test('charter price snapshot matches the current agreement', () => {
  const prices = scriptValue('standardPrices');
  assert.equal(prices.length, 40);
  assert.equal(prices[0], 4.09);
  assert.equal(prices[39], 49.67);
  assert.equal(
    charter.match(/data-pricing-policy-version="([^"]+)"/)?.[1],
    agreement.match(/data-pricing-policy-version="([^"]+)"/)?.[1],
  );
});

test('charter and agreement expose the same net, VAT and final price columns', () => {
  for (const document of [charter, agreement]) {
    assert.match(document, /<th>Καθαρή αξία<\/th><th>ΦΠΑ 24%<\/th><th>Τελική τιμή<\/th>/);
    assert.match(document, /<th>Net amount<\/th><th>VAT 24%<\/th><th>Final price<\/th>/);
    assert.match(document, /const VAT_RATE = 0\.24/);
    assert.match(document, /vat: \(finalCents - netCents\) \/ 100/);
  }
});

test('all charter table-of-contents targets and local document links resolve', () => {
  const ids = new Set([...charter.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const anchors = [...charter.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
  for (const anchor of anchors) assert.ok(ids.has(anchor), `missing anchor target: ${anchor}`);

  const requiredLocalDocuments = ['/privacy.html', '/service-terms.html', '/terms.html'];
  for (const href of requiredLocalDocuments) {
    assert.ok(charter.includes(`href="${href}"`), `missing local document link: ${href}`);
  }
});

test('charter is published as an effective version without unresolved placeholders', () => {
  assert.match(charter, /<span class="status-label">Έκδοση<\/span><span class="status-value">1\.0<\/span>/);
  assert.match(charter, /<span class="status-label">Έναρξη ισχύος<\/span><span class="status-value">29 \/ 08 \/ 2026<\/span>/);
  assert.match(charter, /Ο παρών Χάρτης τίθεται σε ισχύ στις 29 \/ 08 \/ 2026\./);
  assert.match(charter, /This Charter takes effect on 29 \/ 08 \/ 2026\./);
  assert.match(charter, /Τα ονόματα των μελών γνωστοποιούνται στον ενδιαφερόμενο με την έγγραφη πρόσκληση\./);
  assert.doesNotMatch(charter, /προσχέδι|προεπισκόπηση|θα συμπληρω|υπό συμπλήρωση|υπό τεχνική επιβεβαίωση|πριν από την εμπορική έναρξη/i);
  assert.doesNotMatch(charter, /public draft|public preview|draft version|draft date|to be completed|before commercial launch|undergoing technical confirmation/i);
  assert.doesNotMatch(charter, /TODO|TBD|PLACEHOLDER|\{\{[^}]+\}\}/i);
});

test('charter uses the public DUTT app name', () => {
  assert.doesNotMatch(charter, /Customer App/i);
  assert.match(charter, /εφαρμογ(?:ή|ής) DUTT/);
  assert.match(charter, /DUTT app/);
});
