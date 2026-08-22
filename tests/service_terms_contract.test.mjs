import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const agreement = readFileSync(new URL('../service-terms.html', import.meta.url), 'utf8');
const homepage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const generalTerms = readFileSync(new URL('../terms.html', import.meta.url), 'utf8');

function scriptValue(name) {
  const startMarker = `const ${name} = `;
  const start = agreement.indexOf(startMarker);
  assert.notEqual(start, -1, `${name} declaration is missing`);
  const valueStart = start + startMarker.length;
  const end = agreement.indexOf('\n    ];', valueStart);
  assert.notEqual(end, -1, `${name} declaration is incomplete`);
  return vm.runInNewContext(`(${agreement.slice(valueStart, end + 6)})`);
}

test('agreement is a dedicated Greek-first page with only Greek and English', () => {
  assert.match(agreement, /<html lang="el">/);
  assert.match(agreement, /setLanguage\(localStorage\.getItem\("dutt_lang"\) \|\| "el"\)/);
  assert.deepEqual(
    [...agreement.matchAll(/data-language-button="([^"]+)"/g)]
      .map((match) => match[1])
      .sort(),
    ['el', 'en'],
  );
  assert.match(agreement, /data-language="el"/);
  assert.match(agreement, /data-language="en"/);
  assert.doesNotMatch(agreement, /data-language(?:-button)?="(?:de|fr|it|es|ar|ru|zh)"/i);
});

test('homepage exposes the required agreement and price-list links', () => {
  assert.match(homepage, /href="\/service-terms\.html"[^>]*data-i18n="footerLink4"/);
  assert.match(homepage, /href="\/service-terms\.html#pricing"[^>]*data-i18n="footerLink5"/);
  assert.match(homepage, /footerLink4: "Σύμβαση Όρων Παροχής"/);
  assert.match(homepage, /footerLink5: "Τιμοκατάλογος"/);
  assert.match(homepage, /footerLink4: "Service Provision Agreement"/);
  assert.match(homepage, /footerLink5: "Price List"/);
  assert.match(generalTerms, /href="\/service-terms\.html"/);
  assert.match(agreement, /selected === "en" \? "#pricing-en" : "#pricing"/);
  assert.match(agreement, /document\.querySelector\(pricingHash\)\?\.scrollIntoView\(\)/);
});

test('agreement contains every minimum EETT contract topic in both languages', () => {
  const requiredGreek = [
    'Παρεχόμενες υπηρεσίες',
    'Χρόνοι, ποιότητα και παρακολούθηση',
    'Δικαιώματα και υποχρεώσεις',
    'Μη αποδεκτά και απαγορευμένα αντικείμενα',
    'Τιμοκατάλογος υπηρεσιών',
    'Ακυρώσεις, επιστροφές χρημάτων και αλλαγές',
    'Επίδοση, αποτυχημένη προσπάθεια και ανεπίδοτα',
    'Ευθύνη, αποζημιώσεις και προθεσμίες',
    'Δηλωμένη αξία και ασφαλιστική κάλυψη',
    'Παράπονα, καταγγελίες και επίλυση διαφορών',
    'ελληνικά δικαστήρια',
  ];
  const requiredEnglish = [
    'Services supplied',
    'Time, quality and tracking',
    'Sender and recipient rights and duties',
    'Non-accepted and prohibited items',
    'Service price list',
    'Cancellations, refunds and changes',
    'Delivery, failed attempt and undelivered items',
    'Liability, compensation and deadlines',
    'Declared value and insurance',
    'Complaints and dispute resolution',
    'Greek courts',
  ];
  for (const phrase of [...requiredGreek, ...requiredEnglish]) {
    assert.ok(agreement.includes(phrase), `missing required topic: ${phrase}`);
  }
});

test('identity, item limits and current fiscal price metadata are explicit', () => {
  assert.match(agreement, /ΣΟΥΡΡΑΣ ΔΗΜΗΤΡΙΟΣ ΕΥΑΓΓΕΛΟΣ/);
  assert.match(agreement, /103922076/);
  assert.match(agreement, /Κουτλιμπάνα 5-7, Λάρισα/);
  assert.match(agreement, /info@dutt\.gr/);
  assert.match(agreement, /tel:\+302414005377/);
  assert.match(agreement, /241 400 5377/);
  assert.match(agreement, /Δευτέρα-Παρασκευή, 09:00-17:00/);
  assert.match(agreement, /Monday-Friday, 09:00-17:00 \(Europe\/Athens\)/);
  assert.match(agreement, /δεν είναι πρόσθετης χρέωσης/);
  assert.match(agreement, /not a premium-rate line/);
  assert.match(homepage, /tel:\+302414005377/);
  assert.match(agreement, /45 × 45 × 45 cm/);
  assert.match(agreement, /20 kg/);
  assert.match(agreement, /21 \/ 08 \/ 2026/);
  assert.match(agreement, /ΦΠΑ 24%/);
  assert.match(agreement, /data-pricing-policy-version="launch_v12_tiered_customer_uplift"/);
});

test('published standard distance prices match the current canonical policy snapshot', () => {
  const prices = scriptValue('standardPrices');
  assert.equal(prices.length, 40);
  assert.equal(prices[0], 4.09);
  assert.equal(prices[9], 11.52);
  assert.equal(prices[19], 23.95);
  assert.equal(prices[29], 36.59);
  assert.equal(prices[39], 49.67);
  assert.match(agreement, /0%, 1%, 1,5% ή 2,5%/);
  assert.match(agreement, /Προσαύξηση 40%/);
  assert.match(agreement, /€0,00 \/ €0,09 \/ €0,32 \/ €0,38 \/ €0,68/);
});

test('public price list separates net amount, VAT and final price without changing totals', () => {
  assert.match(agreement, /<th>Καθαρή αξία<\/th><th>ΦΠΑ 24%<\/th><th>Τελική τιμή<\/th>/);
  assert.match(agreement, /<th>Net amount<\/th><th>VAT 24%<\/th><th>Final price<\/th>/);
  assert.match(agreement, /data-price-locale="el"/);
  assert.match(agreement, /data-price-locale="en"/);

  for (const finalPrice of scriptValue('standardPrices')) {
    const finalCents = Math.round(finalPrice * 100);
    const netCents = Math.round(finalCents / 1.24);
    const vatCents = finalCents - netCents;
    assert.equal(netCents + vatCents, finalCents);
  }
});

test('cancellation and undelivered-item charges mirror the active policy', () => {
  const markers = [
    'έως 90 δευτερόλεπτα',
    '€1,00 + €0,18',
    'μέγιστο 70%',
    '€1,50 + €0,18',
    'μέγιστο 85%',
    'Αρχική προσφορά + €2,00',
    '€0,00 τέλος φύλαξης',
    'πρόσθετη χρέωση όχι μεγαλύτερη από την αρχική χρέωση αποστολής',
    '50% της αρχικής καθαρής αξίας',
  ];
  for (const marker of markers) assert.ok(agreement.includes(marker), `missing policy marker: ${marker}`);
});

test('latest 2026 compensation safeguards and complaint deadlines are present', () => {
  const markers = [
    'δέκα φορές το καταβληθέν ταχυδρομικό τέλος',
    'οκτώ φορές το καταβληθέν τέλος',
    'δύο φορές το ταχυδρομικό τέλος',
    '3/12 του τέλους',
    'δεκαπέντε εργάσιμων ημερών',
    'έξι μήνες',
    'είκοσι εργάσιμες ημέρες',
    'δύο εργάσιμες ημέρες',
    'μοναδικό αριθμό αναφοράς',
  ];
  for (const marker of markers) assert.ok(agreement.includes(marker), `missing safeguard: ${marker}`);
});

test('agreement has no unresolved legal placeholders or obsolete intermediary disclaimer', () => {
  assert.doesNotMatch(agreement, /TODO|TBD|PLACEHOLDER|θα συμπληρωθεί|να προστεθεί/i);
  assert.doesNotMatch(agreement, /solely (?:a|an) .*intermediar/i);
  assert.doesNotMatch(agreement, /αποκλειστικά ως .*διαμεσολαβ/i);
});

test('public legal copy uses the DUTT app name instead of an internal product label', () => {
  for (const document of [generalTerms, agreement]) {
    assert.doesNotMatch(document, /Customer App/i);
    assert.match(document, /εφαρμογ(?:ή|ής) DUTT/);
    assert.match(document, /DUTT app/);
  }
});
