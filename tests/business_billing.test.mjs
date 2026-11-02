import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WebsiteBillingFlow, parseBillingPage, billingCopy, money } from '../business/billing-client.mjs';
const fixtures = JSON.parse(readFileSync(new URL('../../business-recipient-billing-backend/test/business-recipient-billing/billing-read-client-fixtures.json', import.meta.url)));
const clone = name => structuredClone(fixtures[name]);
for (const variant of ['unbilled', 'credited', 'empty']) test(`shared website/native ${variant} fixture preserves exact cents`, () => {
  const data = parseBillingPage(clone(variant), '102026', 0);
  if (variant === 'credited') { assert.equal(data.balance.actualPaidCents, 0); assert.equal(data.balance.creditedCents.gross, 620); assert.equal(data.charges[0].currentCents.gross, 0); }
  if (variant === 'unbilled') { assert.equal(data.charges[0].currentCents.gross, 620); assert.equal(data.balance, null); }
  if (variant === 'empty') { assert.deepEqual(data.charges, []); assert.equal(data.balance, null); }
});
for (const change of [{ success: false }, { periodKey: '112026' }, { page: 1 }, { currency: 'USD' }, { totalCharges: 0 }, { customerUid: 'foreign' }, { charges: [] }, { invoice: null }, { balance: null }, { balance: { outstandingCents: -1 } }])
  test(`malformed page does not become zero debt: ${JSON.stringify(change)}`, () => assert.throws(() => parseBillingPage({ ...clone('credited'), ...change }, '102026', 0)));
function fixture() {
  let uid = 'synthetic-owner'; const calls = [];
  const flow = new WebsiteBillingFlow({ now: new Date(2026, 9, 31), currentUid: async () => uid, call: async (action, body) => { calls.push({ action, ...body }); return { ...clone('unbilled'), periodKey: body.periodKey }; } });
  flow.bindOwner(uid); return { flow, calls, owner: value => { uid = value; } };
}
test('billing requests cannot supply a debtor UID, phone, amounts or write action', async () => {
  const f = fixture(); await f.flow.load(); assert.deepEqual(f.calls, [{ action: 'read_website_business_billing', periodKey: '102026', page: 0 }]);
});
test('period switch rejects an old in-flight result', async () => {
  const f = fixture(); let release; f.flow.call = () => new Promise(resolve => { release = resolve; }); const first = f.flow.load(); await new Promise(resolve => setImmediate(resolve));
  f.flow.call = async (_, body) => ({ ...clone('unbilled'), periodKey: body.periodKey }); await f.flow.load('112026'); release(clone('unbilled')); await first; assert.equal(f.flow.data.periodKey, '112026');
});
test('owner change clears financial values and ignores pending replies', async () => {
  const f = fixture(); await f.flow.load(); f.owner('foreign'); f.flow.bindOwner('foreign'); assert.equal(f.flow.data, null);
});
test('failed refresh is unavailable rather than a zero or retained stale balance', async () => {
  const f = fixture(); await f.flow.load(); f.flow.call = async () => { throw Error('offline'); }; await f.flow.load(); assert.equal(f.flow.data, null); assert.equal(f.flow.error, 'billing_read_unavailable');
});
test('sender line cannot be relabeled as incoming', () => { const d = clone('unbilled'); d.charges[0].payerRole = 'sender'; assert.throws(() => parseBillingPage(d, '102026', 0)); });
test('integer money formatting is exact even at the maximum safe cent value', () => { assert.equal(money(620), '6.20 €'); assert.equal(money(0), '0.00 €'); assert.equal(money(Number.MAX_SAFE_INTEGER), '90071992547409.91 €'); });
test('Greek and English labels have identical coverage', () => assert.deepEqual(Object.keys(billingCopy.el).sort(), Object.keys(billingCopy.en).sort()));
test('actual page uses safe text-only rendering, protected session, and no raw database SDK', () => {
  const html = readFileSync(new URL('../business-access.html', import.meta.url), 'utf8'), view = readFileSync(new URL('../business/billing-view.mjs', import.meta.url), 'utf8');
  assert.ok(html.includes('id="incoming-billing"')); assert.ok(html.includes('type="month"')); assert.ok(!view.includes('innerHTML')); assert.ok(!view.includes('firebase-database'));
});
