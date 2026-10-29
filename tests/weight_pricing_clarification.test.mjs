import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8').replace(/\r\n/g, '\n');
const clarification = /\r?\n        <p data-weight-pricing-clarification="2026-10-29">[\s\S]*?<\/p>/g;

for (const [current, previous] of [
  ['service-terms.html', 'legal/versions/service-terms-v1.5-2026-10-18.html'],
  ['consumer-charter.html', 'legal/versions/consumer-charter-v1.4-2026-10-18.html'],
]) {
  test(`${current}: only the dated weight clarification is added`, () => {
    const html = read(current);
    assert.equal([...html.matchAll(clarification)].length, 2);
    assert.equal(html.replace(clarification, ''), read(previous));
    assert.match(html, /βάρους έως 20 κιλά και διαστάσεων έως 45 × 45 × 45 εκατοστά/);
    assert.match(html, /δεν εφαρμόζεται πρόσθετη χρέωση βάσει βάρους/);
    assert.match(html, /no additional weight-based charge applies/);
    assert.match(html, /does not change the current prices or return policy/);
  });
}

test('both pre-clarification documents remain available in the public archive', () => {
  const archive = read('legal-archive.html');
  assert.match(archive, /service-terms-v1\.5-2026-10-18\.html/);
  assert.match(archive, /consumer-charter-v1\.4-2026-10-18\.html/);
  assert.match(archive, /29 \/ 10 \/ 2026/);
});
