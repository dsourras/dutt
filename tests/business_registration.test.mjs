import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RegistrationApi, RegistrationError, RegistrationFlow, registrationPayload } from '../business/registration-client.mjs';
const payload = { legalName: 'Synthetic Workshop', contactName: 'Synthetic Owner', email: 'synthetic@example.invalid', phone: '2410123456', afm: '123456783',
  address: { street: 'Example', number: '1', city: 'Larisa', postalCode: '41223' } };
function fixture({ current = null, available = true, register, create } = {}) {
  const data = new Map(), calls = { auth: 0, create: 0, register: [], availability: 0 };
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const auth = { current: async () => current, create: async (email, password) => { calls.create++; current = create ? await create(email, password) : { uid: 'synthetic-owner', email }; return current; }, token: async () => 'synthetic-token' };
  const api = { available: async () => { calls.availability++; return available; }, register: async (pending, token) => {
    calls.register.push({ pending: structuredClone(pending), token });
    return register ? register(pending) : { success: true, status: 'registered', customerUid: current.uid, registrationState: 'pending_verification' };
  } };
  const args = { api, storage, authFactory: async () => { calls.auth++; return auth; }, newKey: () => 'synthetic-request-key' };
  return { flow: new RegistrationFlow(args), args, calls, data, auth, setCurrent: value => { current = value; } };
}
test('closed payload normalization excludes passwords UID authority and unknown fields', () => {
  const result = registrationPayload({ ...payload, email: ' Synthetic@Example.invalid ', password: 'not-retained', credit: true, source: 'admin' });
  assert.equal(result.email, payload.email); assert.equal(result.phoneCountry, 'GR'); assert.equal(result.password, undefined); assert.equal(result.source, undefined);
});
test('invalid AFM phone email address and postal code fail before Auth creation', async () => {
  for (const extra of [{ afm: '000000000' }, { email: 'wrong' }, { phone: 'call me' }, { address: {} }, { address: { ...payload.address, postalCode: '123' } }]) {
    const f = fixture(); await assert.rejects(f.flow.submit({ ...payload, ...extra }, 'Synthetic-Only-123')); assert.equal(f.calls.auth, 0); assert.equal(f.calls.create, 0);
  }
});
test('default closed availability prevents Auth and company creation', async () => {
  const f = fixture({ available: false }); await assert.rejects(f.flow.submit(payload, 'Synthetic-Only-123'), /business_registration_not_enabled/);
  assert.equal(f.calls.auth, 0); assert.equal(f.calls.create, 0); assert.equal(f.flow.pending, null);
});
test('new registration uses same owner UID and stores no password or bearer token', async () => {
  const f = fixture(); const result = await f.flow.submit(payload, 'Synthetic-Only-123');
  assert.equal(result.customerUid, 'synthetic-owner'); assert.equal(f.calls.create, 1); assert.equal(f.calls.register[0].pending.uid, result.customerUid);
  assert.equal(JSON.stringify(f.calls.register).includes('Synthetic-Only-123'), false); assert.equal(f.data.size, 0);
});
test('existing email is an ownership requirement and never becomes a second registration', async () => {
  const f = fixture({ create: async () => { throw { code: 'auth/email-already-in-use' }; } });
  await assert.rejects(f.flow.submit(payload, 'Synthetic-Only-123'), /account_access_required/); assert.equal(f.calls.register.length, 0);
});
test('weak passwords are rejected without company mutation', async () => {
  const f = fixture(); await assert.rejects(f.flow.submit(payload, 'short'), /invalid_password/); assert.equal(f.calls.create, 0);
  const weak = fixture({ create: async () => { throw { code: 'auth/weak-password' }; } });
  await assert.rejects(weak.flow.submit(payload, 'Synthetic-Only-123'), /invalid_password/); assert.equal(weak.calls.register.length, 0);
});
test('lost acknowledgement freezes payload and retries exact key without another Auth signup', async () => {
  let first = true;
  const f = fixture({ register: pending => { if (first) { first = false; throw new RegistrationError('temporarily_unavailable', { ambiguous: true }); }
    return { success: true, status: 'registered', customerUid: pending.uid, registrationState: 'pending_verification' }; } });
  await assert.rejects(f.flow.submit(payload, 'Synthetic-Only-123'));
  assert.equal([...f.data.values()][0].includes('Synthetic-Only-123'), false); assert.equal([...f.data.values()][0].includes('synthetic-token'), false);
  await f.flow.submit({ ...payload, legalName: 'Must not replace' });
  assert.equal(f.calls.create, 1); assert.deepEqual(f.calls.register[0], f.calls.register[1]);
});
test('same-tab reload restores owned request but never adopts a different signed-in UID', async () => {
  const f = fixture({ register: () => { throw new RegistrationError('temporarily_unavailable'); } });
  await assert.rejects(f.flow.submit(payload, 'Synthetic-Only-123'));
  const restored = new RegistrationFlow(f.args); assert.deepEqual(restored.pending, f.flow.pending);
  f.setCurrent({ uid: 'foreign', email: payload.email }); await assert.rejects(restored.submit(payload), /account_mismatch/); assert.equal(f.calls.register.length, 1);
});
test('missing owner session after partial registration requires same-account access', async () => {
  const f = fixture({ register: () => { throw new RegistrationError('temporarily_unavailable'); } });
  await assert.rejects(f.flow.submit(payload, 'Synthetic-Only-123')); f.setCurrent(null);
  await assert.rejects(f.flow.submit(payload, 'Synthetic-Only-123'), /account_access_required/); assert.equal(f.calls.create, 1);
});
test('different email session cannot be used to register or overwrite another owner', async () => {
  const f = fixture({ current: { uid: 'foreign', email: 'foreign@example.invalid' } });
  await assert.rejects(f.flow.submit(payload, 'Synthetic-Only-123'), /account_mismatch/); assert.equal(f.calls.create, 0); assert.equal(f.calls.register.length, 0);
});
test('concurrent submissions cannot duplicate Auth or company requests', async () => {
  let resolve; const wait = new Promise(r => { resolve = r; }); const f = fixture({ create: async email => { await wait; return { uid: 'synthetic-owner', email }; } });
  const first = f.flow.submit(payload, 'Synthetic-Only-123'); await assert.rejects(f.flow.submit(payload, 'Synthetic-Only-123'), /in_progress/);
  resolve(); await first; assert.equal(f.calls.create, 1); assert.equal(f.calls.register.length, 1);
});
test('unavailable session storage blocks Auth before side effects', async () => {
  const f = fixture(); f.args.storage.setItem = () => { throw new Error('unavailable'); };
  await assert.rejects(f.flow.submit(payload, 'Synthetic-Only-123'), /storage_unavailable/); assert.equal(f.calls.create, 0);
});
test('foreign UID malformed or unknown success never confirms registration', async () => {
  for (const response of [{}, { status: 'registered', customerUid: 'foreign', registrationState: 'ready' }, { status: 'registered', customerUid: 'synthetic-owner', registrationState: 'unknown' }]) {
    const f = fixture({ register: () => response }); await assert.rejects(f.flow.submit(payload, 'Synthetic-Only-123'), /temporarily_unavailable/); assert.ok(f.flow.pending);
  }
});
test('HTTP contract has closed body bearer session and no credential data', async () => {
  const calls = [], api = new RegistrationApi({ endpoint: 'http://127.0.0.1/local', fetcher: async (url, options) => {
    calls.push({ url, options }); return new Response(JSON.stringify({ success: true, available: true }), { status: 200 });
  } });
  assert.equal(await api.available(), true); await api.register({ key: 'synthetic-key', payload }, 'synthetic-token');
  assert.equal(calls[0].options.headers.Authorization, undefined); assert.equal(calls[1].options.headers.Authorization, 'Bearer synthetic-token');
  assert.deepEqual(JSON.parse(calls[1].options.body), { action: 'register_website_business_customer', idempotencyKey: 'synthetic-key', payload });
});
test('HTTP failure and malformed or overlarge responses cannot report success', async () => {
  for (const raw of ['{}', 'not json', 'x'.repeat(32769)]) {
    const api = new RegistrationApi({ endpoint: 'http://127.0.0.1/local', fetcher: async () => new Response(raw) });
    await assert.rejects(api.available());
  }
});
test('default browser fetch retains its native global receiver', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = function () { assert.equal(this, globalThis); return Promise.resolve(new Response('{"success":true,"available":true}')); };
    assert.equal(await new RegistrationApi({ endpoint: 'http://127.0.0.1/local' }).available(), true);
  } finally { globalThis.fetch = original; }
});
test('correcting rejected company details retains owner identity without another signup', async () => {
  let reject = true;
  const f = fixture({ register: pending => { if (reject) throw new RegistrationError('invalid_phone', { status: 'invalid_input' });
    return { success: true, status: 'registered', customerUid: pending.uid, registrationState: 'pending_verification' }; } });
  await assert.rejects(f.flow.submit(payload, 'Synthetic-Only-123')); f.flow.correct();
  await assert.rejects(f.flow.submit({ ...payload, email: 'foreign@example.invalid' }), /account_mismatch/);
  reject = false; await f.flow.submit({ ...payload, phone: '2410987654' }); assert.equal(f.calls.create, 1);
});
test('website uses real brand assets and shared route without App requirement or proxy consent', () => {
  const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  const html = read('business/index.html'), auth = read('business/firebase-auth.mjs'), main = read('index.html');
  assert.match(html, /\.\.\/logo_white1\.png/); assert.match(main, /href="business\/"/); assert.match(html, /autocomplete="new-password"/);
  assert.doesNotMatch(html, /authorityDeclaration|checked|acceptConsent|apps\.apple|play\.google/);
  assert.match(auth, /browserSessionPersistence/); assert.doesNotMatch(auth, /sendPasswordResetEmail/);
  assert.doesNotMatch(read('business/registration.mjs') + read('business/registration-client.mjs'), /sendEmailVerification|sendPasswordResetEmail|verifyEmail\s*\(/);
});
