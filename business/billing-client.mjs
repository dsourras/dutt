export const billingCopy = {
  el: { billingTitle: 'Εισερχόμενες χρεώσεις', billingPeriod: 'Περίοδος χρέωσης', billingRefresh: 'Ανανέωση χρεώσεων', billingPrevious: 'Προηγούμενη σελίδα', billingNext: 'Επόμενη σελίδα',
    billingLoad: 'Εμφάνιση χρεώσεων', billingLoading: 'Ανάγνωση χρεώσεων…', billingUnavailable: 'Οι χρεώσεις δεν είναι διαθέσιμες. Δοκιμάστε ανανέωση.', billingSession: 'Απαιτείται σύνδεση στον ίδιο λογαριασμό.',
    billingEmpty: 'Δεν υπάρχουν εισερχόμενες χρεώσεις για αυτή την περίοδο.', billingNoInvoice: 'Δεν έχει εκδοθεί τιμολόγιο.', billingInvoice: 'Τιμολόγιο', billingWholeInvoice: 'Συνολικά ποσά τιμολογίου',
    billingPaid: 'Πραγματικές πληρωμές', billingCredit: 'Πιστωτικά', billingRemainingCredit: 'Πιστωτικό υπόλοιπο', billingOutstanding: 'Υπόλοιπο τιμολογίου', billingRecorded: 'Ενημέρωση υπολοίπου', billingPending: 'Εκκρεμεί ενημέρωση πιστωτικού.',
    billingNet: 'Καθαρή αξία', billingVat: 'ΦΠΑ', billingGross: 'Σύνολο', billingOriginal: 'Αρχική αξία με ΦΠΑ', billingBilled: 'Τιμολογημένη', billingUnbilled: 'Προς τιμολόγηση' },
  en: { billingTitle: 'Incoming charges', billingPeriod: 'Billing period', billingRefresh: 'Refresh charges', billingPrevious: 'Previous page', billingNext: 'Next page',
    billingLoad: 'Show charges', billingLoading: 'Loading charges…', billingUnavailable: 'Charges are unavailable. Try refreshing.', billingSession: 'Sign in to the same account.',
    billingEmpty: 'No incoming charges for this period.', billingNoInvoice: 'No invoice has been issued.', billingInvoice: 'Invoice', billingWholeInvoice: 'Whole-invoice amounts',
    billingPaid: 'Actual payments', billingCredit: 'Credit notes', billingRemainingCredit: 'Remaining credit', billingOutstanding: 'Invoice outstanding', billingRecorded: 'Balance updated', billingPending: 'Credit update pending.',
    billingNet: 'Net value', billingVat: 'VAT', billingGross: 'Total', billingOriginal: 'Original VAT-inclusive value', billingBilled: 'Invoiced', billingUnbilled: 'Awaiting invoice' },
};
const cents = (v, signed = false) => Number.isSafeInteger(v) && (signed || v >= 0);
function amounts(value) {
  if (!value || Object.keys(value).length !== 3 || !['net', 'vat', 'gross'].every(k => cents(value[k])) || value.net + value.vat !== value.gross) throw Error('billing_invalid');
  return { net: value.net, vat: value.vat, gross: value.gross };
}
export function money(value) {
  if (!cents(value)) throw Error('billing_invalid');
  const n = BigInt(value); return `${n / 100n}.${String(n % 100n).padStart(2, '0')} €`;
}
export function parseBillingPage(value, period, page) {
  if (!value || Object.keys(value).length !== 10 || value.success !== true || value.schemaVersion !== 'dutt-incoming-billing-v1' || value.periodKey !== period || value.currency !== 'EUR' ||
      value.page !== page || value.pageSize !== 25 || !cents(value.totalCharges) || value.totalCharges > 1000 || !Array.isArray(value.charges) ||
      value.charges.length !== Math.min(25, Math.max(0, value.totalCharges - page * 25)) || page > 0 && page * 25 >= value.totalCharges) throw Error('billing_invalid');
  const ids = new Set();
  for (const charge of value.charges) {
    if (!charge || Object.keys(charge).length !== 6 || charge.payerRole !== 'recipient' || !['billed', 'unbilled'].includes(charge.billingStatus) ||
        !['orderId', 'orderNumber'].every(k => typeof charge[k] === 'string' && charge[k].length > 0 && charge[k].length <= 200) || ids.has(charge.orderId)) throw Error('billing_invalid');
    ids.add(charge.orderId); amounts(charge.originalCents); amounts(charge.currentCents);
  }
  if ((value.invoice === null) !== (value.balance === null) || value.invoice === null && value.charges.some(c => c.billingStatus === 'billed')) throw Error('billing_invalid');
  if (value.invoice !== null) {
    const i = value.invoice, b = value.balance;
    if (!i || Object.keys(i).length !== 2 || typeof i.number !== 'string' || !i.number || i.number.length > 200 || typeof i.issueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(i.issueDate) ||
        !b || Object.keys(b).some(k => !['originalCents', 'creditedCents', 'appliedCreditCents', 'unallocatedCreditCents', 'actualPaidCents', 'outstandingCents', 'netPositionCents', 'balanceRecordedAt', 'correctionPending'].includes(k)) ||
        !cents(b.actualPaidCents) || !cents(b.outstandingCents) || !cents(b.balanceRecordedAt) || b.balanceRecordedAt <= 0 || b.balanceRecordedAt > 8640000000000000 || typeof b.correctionPending !== 'boolean') throw Error('billing_invalid');
    for (const key of ['originalCents', 'creditedCents']) if (Object.hasOwn(b, key)) amounts(b[key]);
    for (const key of ['appliedCreditCents', 'unallocatedCreditCents', 'netPositionCents']) if (Object.hasOwn(b, key) && !cents(b[key], key === 'netPositionCents')) throw Error('billing_invalid');
  }
  return structuredClone(value);
}
export class WebsiteBillingFlow {
  constructor({ call, currentUid, now = new Date() }) {
    Object.assign(this, { call, currentUid }); this.ownerUid = null; this.data = null; this.error = null; this.busy = false; this.generation = 0;
    this.period = `${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`; this.page = 0;
  }
  bindOwner(uid) {
    if (this.ownerUid === uid) return;
    this.ownerUid = uid; this.generation++; this.data = null; this.error = null; this.busy = false; this.page = 0;
  }
  clear() { this.generation++; this.data = null; this.error = null; this.busy = false; }
  async load(period = this.period, page = 0) {
    if (!/^(0[1-9]|1[0-2])\d{4}$/.test(period) || !Number.isInteger(page) || page < 0 || page >= 40) return;
    const generation = ++this.generation, owner = this.ownerUid;
    this.data = null; this.error = null; this.busy = true; this.period = period; this.page = page;
    try {
      if (!owner || await this.currentUid() !== owner) throw Error('billing_session_required');
      const result = await this.call('read_website_business_billing', { periodKey: period, page });
      if (generation !== this.generation) return;
      if (await this.currentUid() !== owner) { this.bindOwner(null); this.error = 'billing_session_required'; return; }
      this.data = parseBillingPage(result, period, page);
    } catch (error) { if (generation === this.generation) { this.data = null; this.error = error.message === 'billing_session_required' ? error.message : 'billing_read_unavailable'; } }
    finally { if (generation === this.generation) this.busy = false; }
  }
}
