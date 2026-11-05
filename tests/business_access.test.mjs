import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { WebsiteAccessApi, WebsiteAccessFlow, AccessError, validatePolicy } from '../business/access-client.mjs';
const text = 'SYNTHETIC TEST TERMS ONLY.\nNot a real legal agreement.', policy = { version: 'synthetic-v1', hash: createHash('sha256').update(text).digest('hex'), text };
const termsPolicy = { ...policy, version: 'synthetic-terms-only-v1', acceptanceMode: 'terms_only' };
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

test('HTTP declares the terms-only protocol only for agreement reads/acceptance without changing any frozen body', async () => {
  const pending = { action: 'accept_website_business_consent', idempotencyKey: 'synthetic-old-request', acceptedPolicy: true,
    authorityDeclaration: true, scope: { mode: 'approved_sender_uids', senderUids: ['only-sender'] }, policyVersion: 'synthetic-legacy', policyHash: 'a'.repeat(64) };
  const frozen = JSON.stringify(pending), seen = [];
  const api = new WebsiteAccessApi({ endpoint: 'https://example.invalid/synthetic', fetcher: async (url, options) => {
    seen.push(options); return new Response('{"success":true}', { status: 200 });
  } });
  for (const body of [{ action: 'website_business_access_availability' }, { action: 'request_website_business_access', email: own.email },
    { action: 'read_website_business_account' }, pending, pending]) await api.post(body, 'synthetic-token', 'synthetic-protection');
  assert.deepEqual(seen.map(call => call.headers['X-DUTT-Consent-Protocol']), [undefined, undefined, 'terms-only-v1', 'terms-only-v1', 'terms-only-v1']);
  assert.equal(seen[3].body, frozen); assert.equal(seen[4].body, frozen); assert.equal(JSON.stringify(pending), frozen);
  for (const call of seen) { assert.equal(call.headers.Authorization, 'Bearer synthetic-token'); assert.equal(call.headers['X-Firebase-AppCheck'], 'synthetic-protection'); }
});
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
test('actual page has only one unchecked terms choice and preserves pinned lazy SDK protection', () => {
  const html = readFileSync(new URL('../business-access.html', import.meta.url), 'utf8'), sdk = readFileSync(new URL('../business/firebase-auth.mjs', import.meta.url), 'utf8');
  assert.equal((html.match(/type="checkbox"/g) || []).length, 1); assert.ok(html.includes('id="accepted-policy"')); assert.ok(!/\schecked(?:\s|=|>)/.test(html));
  assert.ok(!html.includes('id="authority"')); assert.ok(!html.includes('name="scope"')); assert.ok(!html.includes('sender-uids'));
  assert.ok(sdk.includes('ReCaptchaV3Provider')); assert.ok(sdk.includes('signInWithEmailAndPassword')); assert.ok(sdk.includes('sendEmailVerification'));
  assert.ok(sdk.includes('https://dutt.gr/business-access.html')); assert.ok(html.includes('business/access.mjs'));
});

test('trusted terms-only policy mode is validated and unknown or null modes fail closed', async () => {
  assert.deepEqual(await validatePolicy(termsPolicy), termsPolicy);
  for (const acceptanceMode of [null, '', 'legacy', 'future', true]) await assert.rejects(validatePolicy({ ...policy, acceptanceMode }), /policy_invalid/);
});

test('one-checkbox acceptance sends no invented authority declaration or sender scope', async () => {
  const f = fixture({ policy: termsPolicy }); await f.flow.initialize();
  assert.equal(f.flow.termsOnlyPolicy, true); assert.equal(acceptance(f).length, 0);
  await f.flow.acceptTerms({ acceptedPolicy: true });
  const body = acceptance(f)[0].body;
  assert.deepEqual(Object.keys(body).sort(), ['action', 'idempotencyKey', 'expectedIdentityRevision', 'expectedControlRevision', 'policyVersion', 'policyHash', 'acceptedPolicy', 'ownerProofId'].sort());
  assert.equal(body.acceptedPolicy, true); assert.equal(body.policyVersion, termsPolicy.version); assert.equal(body.policyHash, termsPolicy.hash);
  assert.equal(body.ownerProofId, requestId); assert.equal(body.authorityDeclaration, undefined); assert.equal(body.scope, undefined);
  assert.equal(f.account.creditState, 'unapproved'); assert.equal(f.flow.pending, null);
});

test('one-checkbox requests require explicit acceptance and never reinterpret a legacy policy', async () => {
  for (const options of [{ policy: termsPolicy }, { policy }]) {
    const f = fixture(options); await f.flow.initialize();
    await assert.rejects(f.flow.acceptTerms(), /consent_required/);
    await assert.rejects(f.flow.acceptTerms({ acceptedPolicy: false }), /consent_required/);
    if (options.policy === policy) await assert.rejects(f.flow.acceptTerms({ acceptedPolicy: true }), /consent_required/);
    else await assert.rejects(f.flow.accept(declaration), /consent_required/);
    assert.equal(acceptance(f).length, 0);
  }
});

test('terms-only still requires own verified email and owner proof with separate unapproved credit', async () => {
  for (const account of [{ emailVerified: false }, { ownerProofId: null }, { creditState: 'active' }, { creditState: 'suspended' }, { consentRecorded: true }]) {
    const f = fixture({ policy: termsPolicy, account }); await f.flow.initialize();
    await assert.rejects(f.flow.acceptTerms({ acceptedPolicy: true }), /consent_required/); assert.equal(acceptance(f).length, 0);
  }
  const f = fixture({ policy: termsPolicy }); await f.flow.initialize(); f.setCurrent({ uid: 'foreign' });
  await assert.rejects(f.flow.acceptTerms({ acceptedPolicy: true }), /unauthorized/); assert.equal(acceptance(f).length, 0);
});

test('a lost terms-only acknowledgement restores and retries the exact original body without legacy fields', async () => {
  let first = true;
  const f = fixture({ policy: termsPolicy, post: body => { if (body.action === 'accept_website_business_consent' && first) { first = false; throw new AccessError('website_access_unavailable', true); } } });
  await f.flow.initialize(); await assert.rejects(f.flow.acceptTerms({ acceptedPolicy: true }));
  const frozen = structuredClone(f.flow.pending), restored = new WebsiteAccessFlow(f.args);
  assert.deepEqual(restored.pending, frozen); await restored.initialize(); await restored.accept({});
  assert.deepEqual(acceptance(f)[0], acceptance(f)[1]); assert.equal(acceptance(f)[1].body.scope, undefined); assert.equal(restored.pending, null);
});

test('legacy limited-sender pending replay remains exact after web UI no longer offers sender controls', async () => {
  let first = true;
  const f = fixture({ post: body => { if (body.action === 'accept_website_business_consent' && first) { first = false; throw new AccessError('website_access_unavailable', true); } } });
  await f.flow.initialize(); await assert.rejects(f.flow.accept({ ...declaration, scope: { mode: 'approved_sender_uids', senderUids: ['sender-only'] } }));
  const restored = new WebsiteAccessFlow(f.args); await restored.initialize(); await restored.accept({});
  assert.deepEqual(acceptance(f)[0], acceptance(f)[1]); assert.deepEqual(acceptance(f)[1].body.scope, { mode: 'approved_sender_uids', senderUids: ['sender-only'] });
});

test('half-legacy or altered pending shapes are discarded rather than receiving fabricated missing fields', async () => {
  const f = fixture({ policy: termsPolicy, post: body => { if (body.action === 'accept_website_business_consent') throw new AccessError('website_access_unavailable', true); } });
  await f.flow.initialize(); await assert.rejects(f.flow.acceptTerms({ acceptedPolicy: true }));
  const original = structuredClone(f.flow.pending);
  for (const extra of [{ authorityDeclaration: true }, { scope: { mode: 'verified_business_senders' } }, { authorityDeclaration: false, scope: { mode: 'verified_business_senders' } }, { acceptedPolicy: false }, { acceptanceMode: 'terms_only' }]) {
    f.data.set(CONSENT, JSON.stringify({ ...original, body: { ...original.body, ...extra } }));
    assert.equal(new WebsiteAccessFlow(f.args).pending, null);
  }
});

test('minimal web terms are linked exact text in a dialog without main-page technical identifiers', () => {
  const html = readFileSync(new URL('../business-access.html', import.meta.url), 'utf8'), view = readFileSync(new URL('../business/access.mjs', import.meta.url), 'utf8');
  assert.ok(html.includes('id="open-terms"')); assert.ok(html.includes('<dialog id="collaboration-terms"'));
  assert.ok(html.indexOf('id="policy-text"') > html.indexOf('<dialog id="collaboration-terms"'));
  assert.ok(!html.includes('id="policy-version"')); assert.ok(!view.includes("['uid', account.customerUid]"));
  assert.ok(view.includes("$('#policy-text').textContent = flow.policy.text")); assert.ok(!view.includes('innerHTML'));
  assert.ok(view.includes('flow.acceptTerms({ acceptedPolicy })')); assert.ok(view.includes("$('#consent-form').hidden = account.consentRecorded || Boolean(flow.pending) || !flow.termsOnlyPolicy"));
  assert.ok(html.includes('<details id="recovery-section">')); assert.ok(view.includes('account.ownerProofId'));
  assert.ok(html.indexOf('id="access-result"') < html.indexOf('id="account-section"'));
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
