export class AccessError extends Error {
  constructor(code, ambiguous = false) { super(code); this.code = code; this.ambiguous = ambiguous; }
}
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uid = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value && !/[.#$\[\]/\x00-\x1f\x7f]/.test(value);
const emailOf = value => { if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new AccessError('invalid_email'); return value.trim().toLowerCase(); };
export async function validatePolicy(policy) {
  if (policy === null) return null;
  if (!policy || typeof policy.version !== 'string' || !policy.version.trim() || policy.version.length > 100 || !hex(policy.hash) ||
      typeof policy.text !== 'string' || !policy.text.trim() || new TextEncoder().encode(policy.text).length > 128 * 1024) throw new AccessError('policy_invalid');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(policy.text)))].map(n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== policy.hash) throw new AccessError('policy_invalid'); return policy;
}
export class WebsiteAccessApi {
  constructor({ endpoint, fetcher = globalThis.fetch.bind(globalThis) }) { this.endpoint = endpoint; this.fetcher = fetcher; }
  async post(body, token, protectionToken) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await this.fetcher(this.endpoint, { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(protectionToken ? { 'X-Firebase-AppCheck': protectionToken } : {}) }, body: JSON.stringify(body) });
      const text = await response.text(); if (text.length > 256 * 1024) throw new Error('oversized');
      const data = JSON.parse(text);
      const accepted = body.action === 'request_website_business_access' && data?.accepted === true;
      if (!response.ok || (!accepted && data?.success !== true)) {
        const code = data?.code || data?.reason || 'website_access_unavailable';
        throw new AccessError(code, ['website_access_unavailable', 'credit_dependency_unavailable'].includes(code));
      }
      return data;
    } catch (error) { if (error instanceof AccessError) throw error; throw new AccessError('website_access_unavailable', true); }
    finally { clearTimeout(timer); }
  }
}
const REQUEST = 'dutt-business-owner-request-v1', CONSENT = 'dutt-business-consent-v1';
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const closed = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));
const keyValid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
const validScope = scope => closed(scope, ['mode', 'senderUids']) && (scope.mode === 'verified_business_senders' && !Object.hasOwn(scope, 'senderUids') ||
  scope.mode === 'approved_sender_uids' && Array.isArray(scope.senderUids) && scope.senderUids.length > 0 && scope.senderUids.length <= 100 && scope.senderUids.every(uid) && new Set(scope.senderUids).size === scope.senderUids.length);
function validPending(value) {
  const body = value?.body;
  return closed(value, ['customerUid', 'body']) && uid(value.customerUid) && closed(body, ['idempotencyKey', 'expectedIdentityRevision', 'expectedControlRevision', 'policyVersion', 'policyHash', 'authorityDeclaration', 'acceptedPolicy', 'scope', 'ownerProofId']) &&
    keyValid(body.idempotencyKey) && Number.isSafeInteger(body.expectedIdentityRevision) && body.expectedIdentityRevision > 0 && Number.isSafeInteger(body.expectedControlRevision) && body.expectedControlRevision >= 0 &&
    typeof body.policyVersion === 'string' && body.policyVersion.trim().length > 0 && body.policyVersion.length <= 100 && hex(body.policyHash) && body.authorityDeclaration === true && body.acceptedPolicy === true && validScope(body.scope) &&
    (!Object.hasOwn(body, 'ownerProofId') || hex(body.ownerProofId));
}
function validRequest(value) {
  if (!closed(value, ['email', 'key', 'at', 'requestId'])) return false;
  if (Object.hasOwn(value, 'requestId') && !hex(value.requestId)) return false;
  if (!Object.hasOwn(value, 'key')) return Object.keys(value).length === 1 && hex(value.requestId);
  try { return keyValid(value.key) && emailOf(value.email) === value.email && Number.isSafeInteger(value.at) && value.at >= 0; } catch { return false; }
}
export class WebsiteAccessFlow {
  constructor({ api, authFactory, storage, newKey = () => crypto.randomUUID(), now = Date.now }) {
    Object.assign(this, { api, authFactory, storage, newKey, now }); this.auth = null; this.account = null; this.policy = null; this.config = null; this.user = null; this.busy = false;
    this.request = this.restore(REQUEST); this.pending = this.restore(CONSENT);
    if (!validPending(this.pending)) this.pending = null;
    if (!validRequest(this.request)) this.request = null;
  }
  restore(key) { try { const raw = this.storage?.getItem(key); return raw && raw.length <= 16384 ? JSON.parse(raw) : null; } catch { return null; } }
  save(key, data) { try { if (data) this.storage?.setItem(key, JSON.stringify(data)); else this.storage?.removeItem(key); } catch { throw new AccessError('storage_unavailable'); } }
  captureRequestId(requestId) { if (!hex(requestId)) return; this.request = { ...(this.request || {}), requestId }; this.save(REQUEST, this.request); }
  async initialize() {
    this.account = null; this.policy = null; this.config = null; this.user = null;
    const config = await this.api.post({ action: 'website_business_access_availability' });
    if (typeof config.available !== 'boolean' || config.available && (typeof config.appCheckSiteKey !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(config.appCheckSiteKey))) throw new AccessError('website_access_unavailable');
    this.config = config; if (!config.available) return;
    this.auth = await this.authFactory(); await this.auth.protect(config.appCheckSiteKey); this.user = await this.auth.current();
    if (this.user) await this.load();
  }
  async call(action, values = {}, authenticated = true) {
    if (!this.config?.available || !this.auth) throw new AccessError('website_access_not_enabled');
    const user = authenticated ? await this.auth.current() : null;
    if (authenticated && !user) throw new AccessError('website_access_unauthorized');
    return this.api.post({ ...values, action }, user ? await this.auth.token(user) : null, await this.auth.protectionToken());
  }
  async signIn(email, password) {
    if (!this.auth || !this.config?.available) throw new AccessError('website_access_not_enabled');
    this.account = null; this.policy = null;
    this.user = await this.auth.signIn(emailOf(email), password);
    if (this.pending && this.pending.customerUid !== this.user.uid) { this.pending = null; this.save(CONSENT, null); }
    await this.load();
  }
  async load() {
    this.account = null; this.policy = null;
    const user = await this.auth.current(); if (!user) { this.user = null; return; }
    this.user = user;
    if (this.pending && this.pending.customerUid !== user.uid) { this.pending = null; this.save(CONSENT, null); }
    const data = await this.call('read_website_business_account'), account = data.account;
    if (!account || account.customerUid !== user.uid || !uid(account.customerUid) || typeof account.legalName !== 'string' || typeof account.afm !== 'string' ||
        !Number.isInteger(account.identityRevision) || account.identityRevision < 1 || !Number.isInteger(account.controlRevision) || account.controlRevision < 0 ||
        !['unapproved', 'active', 'suspended', 'revoked'].includes(account.creditState) ||
        ['emailVerified', 'consentRecorded', 'policyMatches', 'ownerProofRequired'].some(key => typeof account[key] !== 'boolean') || account.ownerProofId !== null && !hex(account.ownerProofId)) throw new AccessError('website_access_account_unavailable');
    const policy = await validatePolicy(data.policy);
    if ((await this.auth.current())?.uid !== user.uid) throw new AccessError('website_access_unauthorized');
    this.account = account; this.policy = policy;
  }
  async refresh() { await this.auth.refresh(); await this.load(); }
  async signOut() {
    try { await this.auth.signOut(); }
    finally { this.user = null; this.account = null; this.policy = null; this.pending = null; this.request = null; this.save(CONSENT, null); this.save(REQUEST, null); }
  }
  async requestAccess(email, resend = false) {
    const normalized = emailOf(email);
    if (resend && this.request?.at && this.now() - this.request.at < 60000) throw new AccessError('access_wait');
    if (resend || this.request?.email !== normalized || !this.request.key) {
      this.request = { email: normalized, key: this.newKey(), at: this.now() }; this.save(REQUEST, this.request);
    }
    const data = await this.call('request_website_business_access', { email: normalized, idempotencyKey: this.request.key }, false);
    if (data.accepted !== true || !hex(data.requestId) || !Number.isSafeInteger(data.expiresAt)) throw new AccessError('website_access_unavailable', true);
    this.request.requestId = data.requestId; this.save(REQUEST, this.request); return data;
  }
  async completeAccess() {
    if (!hex(this.request?.requestId)) throw new AccessError('access_confirmation_required');
    const user = await this.auth.current(), data = await this.call('complete_website_business_access', { requestId: this.request.requestId });
    if (data.status !== 'owner_verified' || data.customerUid !== user?.uid) throw new AccessError('access_confirmation_required'); await this.load();
  }
  async verifyEmail() { const user = await this.auth.current(); if (!user) throw new AccessError('website_access_unauthorized'); await this.auth.protectionToken(); await this.auth.verifyEmail(user); }
  async accept({ authority, acceptedPolicy, scope }) {
    if (this.busy) throw new AccessError('in_progress');
    this.busy = true;
    try {
      const user = await this.auth.current();
      if (!user || !this.account || user.uid !== this.account.customerUid) throw new AccessError('website_access_unauthorized');
      if (!this.pending) {
        if (!this.policy || !this.account.emailVerified || this.account.ownerProofRequired && !this.account.ownerProofId || authority !== true || acceptedPolicy !== true ||
            !scope || !['verified_business_senders', 'approved_sender_uids'].includes(scope.mode) || scope.mode === 'approved_sender_uids' &&
            (!Array.isArray(scope.senderUids) || !scope.senderUids.length || scope.senderUids.length > 100 || scope.senderUids.some(value => !uid(value)) || new Set(scope.senderUids).size !== scope.senderUids.length)) throw new AccessError('consent_required');
        this.pending = { customerUid: user.uid, body: { idempotencyKey: this.newKey(), expectedIdentityRevision: this.account.identityRevision, expectedControlRevision: this.account.controlRevision,
          policyVersion: this.policy.version, policyHash: this.policy.hash, authorityDeclaration: true, acceptedPolicy: true,
          scope: scope.mode === 'verified_business_senders' ? { mode: scope.mode } : { mode: scope.mode, senderUids: [...scope.senderUids] },
          ...(this.account.ownerProofRequired ? { ownerProofId: this.account.ownerProofId } : {}) } }; this.save(CONSENT, this.pending);
      }
      if (this.pending.customerUid !== user.uid) throw new AccessError('website_access_unauthorized');
      const data = await this.call('accept_website_business_consent', this.pending.body);
      if (data.status !== 'consent_recorded' || data.customerUid !== user.uid) throw new AccessError('website_access_unavailable', true);
      await this.load(); if (!this.account.consentRecorded || !this.account.policyMatches) throw new AccessError('website_access_source_changed');
      this.pending = null; this.save(CONSENT, null);
    } finally { this.busy = false; }
  }
  reviewAgain() { if (this.busy) return; this.pending = null; this.save(CONSENT, null); }
}
