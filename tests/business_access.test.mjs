import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { WebsiteAccessApi, WebsiteAccessFlow, AccessError, validatePolicy } from '../business/access-client.mjs';
const text = 'SYNTHETIC TEST TERMS ONLY.\nNot a real legal agreement.', policy = { version: 'synthetic-v1', hash: createHash('sha256').update(text).digest('hex'), text };
const own = { uid: 'synthetic-owner', email: 'owner@example.invalid' }, requestId = 'a'.repeat(64);
const REQUEST = 'dutt-business-owner-request-v1', CONSENT = 'dutt-business-consent-v1';
function fixture(options = {}) {
  let current = options.current === undefined ? own : options.current, clock = 100000, sequence = 0;
  const data = new Map(), calls = { auth: 0, protection: 0, signIn: 0, verify: 0, complete: 0, posted: [] };
  const account = { customerUid: own.uid, legalName: 'Synthetic Workshop', afm: '123456783', email: own.email, emailVerified: true, registrationState: 'pending_verification',
    creditState: 'unapproved', identityRevision: 1, controlRevision: 0, consentRecorded: false, policyMatches: false, ownerProofRequired: true, ownerProofId: requestId, ...options.account };
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const auth = { current: async () => current, token: async () => 'synthetic-bearer', protectionToken: async () => 'synthetic-appcheck',
    protect: async () => { calls.protection++; }, signIn: async (email, password) => { calls.signIn++; assert.equal(password, 'synthetic-password'); current = { ...own, email }; return current; },
    signOut: async () => { current = null; }, refresh: async () => current, verifyEmail: async () => { calls.verify++; } };
  const api = { post: async (body, token, protection) => {
    calls.posted.push(structuredClone({ body, token, protection }));
    if (options.post) { const result = await options.post(body, account); if (result !== undefined) return result; }
    if (body.action === 'website_business_access_availability') return { success: true, available: options.available !== false, appCheckSiteKey: 'synthetic_public_test_key_123456' };
    if (body.action === 'read_website_business_account') return { success: true, account: structuredClone(account), policy: options.policy === undefined ? policy : options.policy };
    if (body.action === 'request_website_business_access') return { accepted: true, requestId, expiresAt: 1900000 };
    if (body.action === 'complete_website_business_access') { calls.complete++; return { success: true, status: 'owner_verified', customerUid: own.uid }; }
    if (body.action === 'accept_website_business_consent') { account.consentRecorded = true; account.policyMatches = true; return { success: true, status: 'consent_recorded', customerUid: own.uid }; }
    throw new Error('unexpected-action');
  } };
  const args = { api, authFactory: async () => { calls.auth++; return auth; }, storage, newKey: () => `synthetic-key-${++sequence}`, now: () => clock };
  return { flow: new WebsiteAccessFlow(args), args, calls, data, auth, account, setCurrent: value => { current = value; }, advance: value => { clock += value; } };
}
const declaration = { authority: true, acceptedPolicy: true, scope: { mode: 'verified_business_senders' } };
const acceptance = f => f.calls.posted.filter(call => call.body.action === 'accept_website_business_consent');
test('policy is displayed only with the exact raw UTF8 SHA256 binding', async () => { assert.deepEqual(await validatePolicy(policy), policy); assert.equal(await validatePolicy(null), null); });
test('missing corrupt oversized or mismatched policy is never accepted as verified text', async () => {
  for (const value of [{}, { ...policy, text: '' }, { ...policy, hash: 'b'.repeat(64) }, { ...policy, text: 'x'.repeat(131073) }]) await assert.rejects(validatePolicy(value), /policy_invalid/);
});
test('closed availability never initializes Auth or App Check and cannot sign in', async () => {
  const f = fixture({ available: false }); await f.flow.initialize(); assert.equal(f.calls.auth, 0); await assert.rejects(f.flow.signIn(own.email, 'synthetic-password'), /not_enabled/);
});
test('positive availability requires protection initialization before reading the account', async () => {
  const f = fixture(); await f.flow.initialize(); assert.equal(f.calls.protection, 1); assert.equal(f.flow.account.customerUid, own.uid); assert.equal(acceptance(f).length, 0);
});
test('existing-account sign in uses the SDK owner session and never creates Auth', async () => {
  const f = fixture({ current: null }); await f.flow.initialize(); await f.flow.signIn(' OWNER@EXAMPLE.INVALID ', 'synthetic-password');
  assert.equal(f.calls.signIn, 1); assert.equal(f.flow.account.customerUid, own.uid); assert.equal(f.auth.create, undefined);
});
test('foreign UID or malformed credit details cannot be exposed as the current account', async () => {
  for (const account of [{ customerUid: 'foreign' }, { creditState: 'unknown' }, { identityRevision: 0 }, { ownerProofId: 'bad' }]) {
    const f = fixture({ account }); await assert.rejects(f.flow.initialize(), /account_unavailable/); assert.equal(f.flow.account, null);
  }
});
test('unverified email or missing required owner proof disables acceptance', async () => {
  for (const account of [{ emailVerified: false }, { ownerProofId: null }]) {
    const f = fixture({ account }); await f.flow.initialize(); await assert.rejects(f.flow.accept(declaration), /consent_required/); assert.equal(acceptance(f).length, 0);
  }
});
test('both declarations and an explicit sender scope are required with no automatic acceptance', async () => {
  for (const extra of [{ authority: false }, { acceptedPolicy: false }, { scope: null }]) {
    const f = fixture(); await f.flow.initialize(); await assert.rejects(f.flow.accept({ ...declaration, ...extra }), /consent_required/); assert.equal(acceptance(f).length, 0);
  }
});
test('specific sender scope rejects empty duplicate unsafe or over-limit UID lists', async () => {
  for (const senderUids of [[], ['same', 'same'], ['bad/path'], Array.from({ length: 101 }, (_, n) => `synthetic-${n}`)]) {
    const f = fixture(); await f.flow.initialize(); await assert.rejects(f.flow.accept({ ...declaration, scope: { mode: 'approved_sender_uids', senderUids } }), /consent_required/);
  }
});
test('explicit acceptance sends frozen same-UID revisions proof and exact policy without granting credit', async () => {
  const f = fixture(); await f.flow.initialize(); await f.flow.accept({ ...declaration, scope: { mode: 'approved_sender_uids', senderUids: ['sender-A'] } });
  const body = acceptance(f)[0].body; assert.equal(body.ownerProofId, requestId); assert.equal(body.expectedIdentityRevision, 1); assert.equal(body.expectedControlRevision, 0);
  assert.equal(body.policyHash, policy.hash); assert.deepEqual(body.scope.senderUids, ['sender-A']); assert.equal(body.customerUid, undefined); assert.equal(body.idToken, undefined);
  assert.equal(f.flow.account.creditState, 'unapproved'); assert.equal(f.flow.account.consentRecorded, true); assert.equal(f.data.has(CONSENT), false);
});
test('lost acceptance acknowledgement freezes and retries the identical key and body', async () => {
  let first = true; const f = fixture({ post: body => { if (body.action === 'accept_website_business_consent' && first) { first = false; throw new AccessError('website_access_unavailable', true); } } });
  await f.flow.initialize(); await assert.rejects(f.flow.accept(declaration)); const saved = f.data.get(CONSENT);
  assert.ok(!saved.includes('synthetic-bearer')); assert.ok(!saved.includes('synthetic-password')); await f.flow.accept({});
  assert.deepEqual(acceptance(f)[0], acceptance(f)[1]); assert.equal(f.flow.pending, null);
});
test('same-tab reload restores the identical consent but a different UID clears it before display', async () => {
  const f = fixture({ post: body => { if (body.action === 'accept_website_business_consent') throw new AccessError('website_access_unavailable', true); } });
  await f.flow.initialize(); await assert.rejects(f.flow.accept(declaration)); const restored = new WebsiteAccessFlow(f.args); assert.deepEqual(restored.pending, f.flow.pending);
  f.setCurrent({ uid: 'foreign' }); await assert.rejects(restored.initialize(), /account_unavailable/); assert.equal(restored.pending, null); assert.equal(f.data.has(CONSENT), false);
});
test('malformed and injected session storage is discarded without authority or action injection', () => {
  const f = fixture();
  for (const value of [[], 'primitive', { customerUid: own.uid, body: { action: 'foreign', idempotencyKey: 'fake-key' } }, { customerUid: own.uid, body: null }]) {
    f.data.set(CONSENT, JSON.stringify(value)); assert.equal(new WebsiteAccessFlow(f.args).pending, null);
  }
  for (const value of [[], 'primitive', { key: 'secret', password: 'not-allowed' }, { requestId: 'invalid' }]) {
    f.data.set(REQUEST, JSON.stringify(value)); assert.equal(new WebsiteAccessFlow(f.args).request, null);
  }
});
test('new policy after an ambiguous request cannot replace the frozen acceptance until explicit rereview', async () => {
  const f = fixture({ post: body => { if (body.action === 'accept_website_business_consent') throw new AccessError('credit_explicit_consent_required'); } });
  await f.flow.initialize(); await assert.rejects(f.flow.accept(declaration)); const pending = structuredClone(f.flow.pending);
  f.flow.policy = { ...policy, version: 'changed' }; await assert.rejects(f.flow.accept({})); assert.deepEqual(f.flow.pending, pending);
  f.flow.reviewAgain(); assert.equal(f.flow.pending, null); assert.equal(f.data.has(CONSENT), false);
});
test('simultaneous acceptance cannot send duplicate commands', async () => {
  let release; const wait = new Promise(resolve => { release = resolve; }); const f = fixture({ post: async body => { if (body.action === 'accept_website_business_consent') await wait; } });
  await f.flow.initialize(); const first = f.flow.accept(declaration); await assert.rejects(f.flow.accept(declaration), /in_progress/); release(); await first; assert.equal(acceptance(f).length, 1);
});
test('unavailable storage prevents acceptance from being sent and preserves the frozen request in memory', async () => {
  const f = fixture(); await f.flow.initialize(); f.args.storage.setItem = () => { throw new Error('blocked'); };
  await assert.rejects(f.flow.accept(declaration), /storage_unavailable/); assert.equal(acceptance(f).length, 0);
});
test('access request uses one stable key for retries and exposes only the generic accepted envelope', async () => {
  const f = fixture({ current: null }); await f.flow.initialize(); const first = await f.flow.requestAccess(' OWNER@example.invalid '); await f.flow.requestAccess(own.email);
  assert.equal(first.accepted, true); const requests = f.calls.posted.filter(call => call.body.action === 'request_website_business_access');
  assert.deepEqual(requests[0], requests[1]); assert.equal(requests[0].token, null); assert.equal(requests[0].protection, 'synthetic-appcheck');
});
test('new delivery requires an explicit resend and local cooldown before changing the key', async () => {
  const f = fixture(); await f.flow.initialize(); await f.flow.requestAccess(own.email); const key = f.flow.request.key;
  await assert.rejects(f.flow.requestAccess(own.email, true), /access_wait/); f.advance(60000); await f.flow.requestAccess(own.email, true); assert.notEqual(f.flow.request.key, key);
});
test('only a valid request ID may be captured and actual owner confirmation still requires a session', async () => {
  const f = fixture(); f.flow.captureRequestId('invalid'); assert.equal(f.flow.request, null); f.flow.captureRequestId(requestId); await f.flow.initialize();
  await f.flow.completeAccess(); assert.equal(f.calls.complete, 1); f.setCurrent(null); await assert.rejects(f.flow.completeAccess(), /unauthorized/);
});
test('email verification is explicit and never happens on initialization or acceptance', async () => {
  const f = fixture({ account: { ownerProofRequired: false, ownerProofId: null } }); await f.flow.initialize(); assert.equal(f.calls.verify, 0);
  await f.flow.verifyEmail(); assert.equal(f.calls.verify, 1);
});
test('sign out clears owned details pending acceptance and access request from app storage', async () => {
  const f = fixture(); await f.flow.initialize(); await f.flow.requestAccess(own.email); await f.flow.signOut();
  assert.equal(f.flow.account, null); assert.equal(f.flow.user, null); assert.equal(f.flow.policy, null); assert.equal(f.data.size, 0);
});
test('sign out failure still clears the displayed company and locally owned requests', async () => {
  const f = fixture(); await f.flow.initialize(); await f.flow.requestAccess(own.email); f.auth.signOut = async () => { throw new Error('offline'); };
  await assert.rejects(f.flow.signOut()); assert.equal(f.flow.account, null); assert.equal(f.flow.policy, null); assert.equal(f.data.size, 0);
});
test('Auth changes while a read response is pending cannot expose the previous account', async () => {
  let release; const wait = new Promise(resolve => { release = resolve; }); const f = fixture({ post: async body => { if (body.action === 'read_website_business_account') await wait; } });
  const reading = f.flow.initialize(); await new Promise(resolve => setImmediate(resolve)); f.setCurrent({ uid: 'foreign' }); release(); await assert.rejects(reading, /unauthorized/); assert.equal(f.flow.account, null);
});
test('rechecking availability after a failure discards previously enabled configuration', async () => {
  const f = fixture(); await f.flow.initialize(); f.args.api.post = async () => { throw new Error('offline'); };
  await assert.rejects(f.flow.initialize()); assert.equal(f.flow.config, null); assert.equal(f.flow.account, null);
});
test('HTTP uses Bearer and App Check headers no cookies and no redirects', async () => {
  let options; const api = new WebsiteAccessApi({ endpoint: 'http://127.0.0.1/local', fetcher: async (_url, value) => { options = value; return new Response('{"success":true}'); } });
  await api.post({ action: 'read_website_business_account' }, 'synthetic-bearer', 'synthetic-appcheck'); assert.equal(options.headers.Authorization, 'Bearer synthetic-bearer');
  assert.equal(options.headers['X-Firebase-AppCheck'], 'synthetic-appcheck'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
});
test('HTTP malformed oversized failed and network responses cannot confirm acceptance', async () => {
  for (const raw of ['not json', '{}', 'x'.repeat(262145)]) {
    const api = new WebsiteAccessApi({ endpoint: 'http://127.0.0.1/local', fetcher: async () => new Response(raw) }); await assert.rejects(api.post({ action: 'read_website_business_account' }));
  }
  const api = new WebsiteAccessApi({ endpoint: 'http://127.0.0.1/local', fetcher: async () => { throw new Error('network'); } }); await assert.rejects(api.post({}), error => error.ambiguous === true);
});
test('native fetch default stays bound to its global receiver', async () => {
  const original = globalThis.fetch;
  try { globalThis.fetch = function () { assert.equal(this, globalThis); return Promise.resolve(new Response('{"success":true}')); };
    await new WebsiteAccessApi({ endpoint: 'http://127.0.0.1/local' }).post({ action: 'website_business_access_availability' });
  } finally { globalThis.fetch = original; }
});
test('actual page has unchecked explicit declarations separate credit state and pinned lazy SDK protection', () => {
  const html = readFileSync(new URL('../business-access.html', import.meta.url), 'utf8'), sdk = readFileSync(new URL('../business/firebase-auth.mjs', import.meta.url), 'utf8');
  assert.ok(html.includes('id="authority"')); assert.ok(html.includes('id="accepted-policy"')); assert.ok(!/\schecked(?:\s|=|>)/.test(html));
  assert.ok(sdk.includes('ReCaptchaV3Provider')); assert.ok(sdk.includes('signInWithEmailAndPassword')); assert.ok(sdk.includes('sendEmailVerification'));
  assert.ok(sdk.includes('https://dutt.gr/business-access.html')); assert.ok(html.includes('business/access.mjs'));
});

test('explicitly closed website presents native handoff without claiming verification or enabling Auth', async () => {
  const f = fixture({ available: false }); await f.flow.initialize();
  assert.equal(f.flow.config.available, false); assert.equal(f.calls.auth, 0); assert.equal(f.calls.verify, 0); assert.equal(f.flow.account, null);
  const html = readFileSync(new URL('../business-access.html', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../business/access.mjs', import.meta.url), 'utf8');
  assert.match(html, /id="native-handoff" hidden data-i18n="nativeHandoff"/);
  assert.ok(view.includes('const nativeOnly = !checking && flow.config?.available === false;'));
  assert.ok(view.includes("$('#signin-section').hidden = Boolean(account) || nativeOnly"));
  assert.ok(view.includes("$('#recovery-section').hidden = nativeOnly"));
  assert.ok(view.includes("$('.back').hidden = nativeOnly"));
  assert.ok(view.includes('Continue in the DUTT Customer app.'));
  assert.ok(view.includes('Συνέχισε στην εφαρμογή DUTT Customer.'));
  assert.equal(f.calls.posted.length, 1); assert.equal(f.calls.posted[0].body.action, 'website_business_access_availability');
});
