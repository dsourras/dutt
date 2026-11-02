export class RegistrationError extends Error {
  constructor(code, { ambiguous = false, status = '' } = {}) { super(code); this.code = code; this.ambiguous = ambiguous; this.status = status; }
}
const text = (value, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new RegistrationError('invalid_input');
  return value.trim();
};
export function registrationPayload(input) {
  const afm = text(input.afm, 9), email = text(input.email, 254).toLowerCase();
  if (!/^\d{9}$/.test(afm) || afm === '000000000' || [...afm.slice(0, 8)].reduce((sum, n, i) => sum + Number(n) * 2 ** (8 - i), 0) % 11 % 10 !== Number(afm[8])) throw new RegistrationError('invalid_afm');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RegistrationError('invalid_email');
  const phone = text(input.phone, 80);
  if (!/^\+?[0-9 () .-]{8,80}$/.test(phone)) throw new RegistrationError('invalid_phone');
  const postalCode = text(input.address?.postalCode, 10).replace(/ /g, '');
  if (!/^\d{5}$/.test(postalCode)) throw new RegistrationError('invalid_postal_code');
  return { legalName: text(input.legalName), contactName: text(input.contactName), afm, email, phone, phoneCountry: 'GR',
    address: { street: text(input.address?.street), number: text(input.address?.number, 30), city: text(input.address?.city, 100), postalCode },
    taxOffice: input.taxOffice ? text(input.taxOffice) : '' };
}
export class RegistrationApi {
  constructor({ endpoint, fetcher = globalThis.fetch.bind(globalThis) }) { this.endpoint = endpoint; this.fetcher = fetcher; }
  async post(body, token) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await this.fetcher(this.endpoint, { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: controller.signal });
      const raw = await response.text();
      if (raw.length > 32768) throw new Error('oversized_response');
      const result = JSON.parse(raw);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('invalid_response');
      if (!response.ok || result.success !== true) {
        const code = result.code || result.reason || 'temporarily_unavailable';
        throw new RegistrationError(code, { status: result.status || '', ambiguous: !['invalid_input', 'review_required', 'account_access_required', 'unauthorized', 'forbidden'].includes(result.status) });
      }
      return result;
    } catch (error) {
      if (error instanceof RegistrationError) throw error;
      throw new RegistrationError('temporarily_unavailable', { ambiguous: true });
    } finally { clearTimeout(timer); }
  }
  async available() {
    const result = await this.post({ action: 'website_business_registration_availability' });
    if (typeof result.available !== 'boolean') throw new RegistrationError('temporarily_unavailable');
    return result.available;
  }
  register(pending, token) { return this.post({ action: 'register_website_business_customer', idempotencyKey: pending.key, payload: pending.payload }, token); }
}
const STORAGE_KEY = 'dutt-business-registration-v1';
export class RegistrationFlow {
  constructor({ api, authFactory, storage, newKey = () => crypto.randomUUID() }) {
    this.api = api; this.authFactory = authFactory; this.storage = storage; this.newKey = newKey; this.pending = null; this.busy = false;
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw && raw.length <= 16384) {
        const stored = JSON.parse(raw);
        if (stored.version === 1 && typeof stored.key === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(stored.key) &&
            (stored.uid === null || typeof stored.uid === 'string' && stored.uid.length <= 128)) {
          this.pending = { version: 1, key: stored.key, uid: stored.uid, payload: registrationPayload(stored.payload) };
        }
      }
    } catch { this.pending = null; }
    this.ownerUid = this.pending?.uid || null;
    this.ownerEmail = this.ownerUid ? this.pending.payload.email : null;
  }
  persist() {
    // A request and business details only. Passwords/tokens never enter application storage.
    try { if (this.pending) this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.pending)); else this.storage?.removeItem(STORAGE_KEY); }
    catch { throw new RegistrationError('storage_unavailable'); }
  }
  async submit(input, password) {
    if (this.busy) throw new RegistrationError('in_progress');
    this.busy = true;
    try {
      const payload = this.pending?.payload ?? registrationPayload(input);
      if (this.ownerEmail && payload.email !== this.ownerEmail) throw new RegistrationError('account_mismatch');
      if (!await this.api.available()) throw new RegistrationError('business_registration_not_enabled');
      const auth = await this.authFactory();
      const current = await auth.current();
      if (current && (current.email?.toLowerCase() !== payload.email || this.ownerUid && this.ownerUid !== current.uid)) throw new RegistrationError('account_mismatch');
      if (!current && (typeof password !== 'string' || password.length < 8 || password.length > 4096)) throw new RegistrationError('invalid_password');
      if (!this.pending) { this.pending = { version: 1, key: this.newKey(), uid: null, payload }; this.persist(); }
      this.persist();
      let owner = current;
      if (!owner) {
        if (this.pending.uid || this.ownerUid) throw new RegistrationError('account_access_required');
        try { owner = await auth.create(payload.email, password); }
        catch (error) {
          if (['auth/email-already-in-use', 'auth/invalid-credential'].includes(error.code)) throw new RegistrationError('account_access_required');
          if (['auth/weak-password', 'auth/password-does-not-meet-requirements'].includes(error.code)) throw new RegistrationError('invalid_password');
          if (error.code === 'auth/invalid-email') throw new RegistrationError('invalid_email');
          throw new RegistrationError('temporarily_unavailable', { ambiguous: true });
        }
      }
      if (!owner || !owner.uid || owner.email?.toLowerCase() !== payload.email) throw new RegistrationError('account_mismatch');
      if (this.pending.uid && owner.uid !== this.pending.uid) throw new RegistrationError('account_mismatch');
      this.ownerUid = owner.uid; this.ownerEmail = payload.email;
      this.pending.uid = owner.uid; this.persist();
      const token = await auth.token(owner);
      if (typeof token !== 'string' || !token) throw new RegistrationError('account_access_required');
      const result = await this.api.register(this.pending, token);
      if (result.status !== 'registered' || result.customerUid !== owner.uid || !['pending_verification', 'ready'].includes(result.registrationState)) throw new RegistrationError('temporarily_unavailable', { ambiguous: true });
      this.pending = null; this.persist(); return result;
    } finally { this.busy = false; }
  }
  correct() { if (this.busy) return; this.pending = null; this.persist(); }
}
