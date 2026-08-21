import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../terms.html', import.meta.url), 'utf8');
const objectStart = html.indexOf('const translations = {');
const objectEnd = html.indexOf('\n    };', objectStart);
assert.notEqual(objectStart, -1);
assert.notEqual(objectEnd, -1);

const objectSource = html.slice(
  objectStart + 'const translations = '.length,
  objectEnd + 6,
);
const translations = vm.runInNewContext(`(${objectSource})`);
const visibleKeys = new Set(
  [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]),
);

test('the website exposes exactly its English and Greek translations', () => {
  assert.deepEqual(Object.keys(translations).sort(), ['el', 'en']);
  assert.deepEqual(
    [...html.matchAll(/data-lang="([^"]+)"/g)].map((match) => match[1]).sort(),
    ['el', 'en'],
  );
  for (const [language, copy] of Object.entries(translations)) {
    for (const key of visibleKeys) {
      assert.ok(copy[key], `${language} is missing ${key}`);
    }
  }
});

test('public terms state provider role and both courier models', () => {
  const markers = {
    en: ['contracting provider', 'DUTT-employed couriers', 'independent delivery partners'],
    el: ['συμβατικός πάροχος', 'μισθωτούς διανομείς', 'ανεξάρτητους συνεργάτες'],
  };
  for (const [language, phrases] of Object.entries(markers)) {
    const text = Object.values(translations[language]).join(' ');
    for (const phrase of phrases) assert.match(text, new RegExp(phrase, 'i'));
  }
});

test('public terms cover all channels, tax documents, and overdue safeguards', () => {
  for (const [language, copy] of Object.entries(translations)) {
    assert.ok(copy.s3p1 && copy.s3p2, `${language} Customer App flows`);
    assert.match(copy.s4t, /WooCommerce/i);
    assert.ok(copy.s5p1, `${language} business flow`);
    assert.ok(copy.s6p1 && copy.s6p2, `${language} fiscal separation`);
    assert.ok(copy.s7p1 && copy.s7p2 && copy.s7p3, `${language} overdue safeguards`);
  }
});

test('obsolete intermediary-only statements are absent', () => {
  assert.doesNotMatch(html, /solely as a .*intermediation/i);
  assert.doesNotMatch(html, /λειτουργεί αποκλειστικά ως .*διαμεσολάβ/i);
});
