import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

for (const file of ['service-terms.html', 'consumer-charter.html']) {
  const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  test(`${file}: publishes the balanced refusal tariff in both languages without changing outbound pricing`, () => {
    for (const marker of ['max(€1,50, €0,50 × d) + €0,30', 'max(€1.50, €0.50 × d) + €0.30',
      '€2,23 με ΦΠΑ', '€6,57 με ΦΠΑ', '€2.23 including VAT', '€6.57 including VAT',
      'Google Pay', 'Apple Pay', 'χωρίς πρόσθετη χρέωση ή δέσμευση', 'no additional card charge or hold',
      'χωρίς δεύτερη είσπραξη της αρχικής χρέωσης', 'without an automatic second attempt',
      'Ήδη επιβεβαιωμένες επιστροφές', 'Already confirmed returns', 'launch_v13_selective_distance_pricing']) {
      assert.ok(html.includes(marker), `${file} missing ${marker}`);
    }
  });
}

test('previous terms and charter are retained in the public archive', () => {
  const archive = readFileSync(new URL('../legal-archive.html', import.meta.url), 'utf8');
  for (const file of ['service-terms-v1.4-2026-10-16.html', 'consumer-charter-v1.3-2026-10-16.html']) {
    assert.ok(archive.includes(file));
    const previous = readFileSync(new URL(`../legal/versions/${file}`, import.meta.url), 'utf8');
    assert.ok(previous.includes('16 / 10 / 2026'));
    assert.ok(!previous.includes('max(€1,50, €0,50 × d) + €0,30'));
  }
});
