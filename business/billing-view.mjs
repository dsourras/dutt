import { WebsiteBillingFlow, billingCopy, money } from './billing-client.mjs';
export function attachBillingView({ access, language }) {
  const section = document.querySelector('#incoming-billing'), $ = selector => section.querySelector(selector);
  const flow = new WebsiteBillingFlow({ call: (...args) => access.call(...args), currentUid: async () => (await access.auth?.current())?.uid });
  const tr = key => billingCopy[language()][key];
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const row = (list, label, value) => { list.append(el('dt', tr(label)), el('dd', value)); };
  function render() {
    flow.bindOwner(access.user?.uid || null); section.hidden = !flow.ownerUid;
    section.querySelectorAll('[data-billing]').forEach(node => {
      const label = tr(node.dataset.billing); if (node.tagName === 'BUTTON') { node.title = label; node.setAttribute('aria-label', label); } else node.textContent = label;
    });
    $('#billing-period').value = `${flow.period.slice(2)}-${flow.period.slice(0, 2)}`;
    $('#billing-period').disabled = flow.busy; $('#billing-refresh').disabled = flow.busy;
    $('#billing-state').textContent = flow.busy ? tr('billingLoading') : flow.error ? tr(flow.error === 'billing_session_required' ? 'billingSession' : 'billingUnavailable') : '';
    $('#billing-state').hidden = !flow.busy && !flow.error;
    const details = $('#billing-invoice'), list = $('#billing-charges'); details.replaceChildren(); list.replaceChildren();
    $('#billing-pages').hidden = !flow.data || flow.data.totalCharges <= 25;
    if (!flow.data) return;
    const data = flow.data;
    if (!data.invoice) details.append(el('p', tr('billingNoInvoice')));
    else {
      details.append(el('h3', `${tr('billingInvoice')} ${data.invoice.number}`), el('p', data.invoice.issueDate), el('h3', tr('billingWholeInvoice')));
      const dl = el('dl'); row(dl, 'billingPaid', money(data.balance.actualPaidCents));
      if (data.balance.creditedCents) row(dl, 'billingCredit', money(data.balance.creditedCents.gross));
      if (Object.hasOwn(data.balance, 'unallocatedCreditCents')) row(dl, 'billingRemainingCredit', money(data.balance.unallocatedCreditCents));
      row(dl, 'billingOutstanding', money(data.balance.outstandingCents)); row(dl, 'billingRecorded', new Date(data.balance.balanceRecordedAt).toLocaleString(language() === 'el' ? 'el-GR' : 'en-GB'));
      details.append(dl); if (data.balance.correctionPending) details.append(el('p', tr('billingPending'), 'billing-pending'));
    }
    if (!data.charges.length) list.append(el('p', tr('billingEmpty')));
    for (const charge of data.charges) {
      const article = el('article', undefined, 'billing-charge'); article.append(el('h3', `#${charge.orderNumber}`), el('p', tr(charge.billingStatus === 'billed' ? 'billingBilled' : 'billingUnbilled'), 'billing-stage'));
      const dl = el('dl', undefined, 'billing-amounts');
      row(dl, 'billingNet', money(charge.currentCents.net)); row(dl, 'billingVat', money(charge.currentCents.vat)); row(dl, 'billingGross', money(charge.currentCents.gross));
      if (charge.currentCents.gross !== charge.originalCents.gross) row(dl, 'billingOriginal', money(charge.originalCents.gross));
      article.append(dl); list.append(article);
    }
    $('#billing-page-label').textContent = `${data.page + 1}/${Math.ceil(data.totalCharges / 25)} · ${data.totalCharges}`;
    $('#billing-previous').disabled = flow.busy || data.page === 0; $('#billing-next').disabled = flow.busy || (data.page + 1) * 25 >= data.totalCharges;
  }
  async function load(period = flow.period, page = 0) { const promise = flow.load(period, page); render(); await promise; render(); }
  $('#billing-refresh').addEventListener('click', () => void load(flow.period, flow.page));
  document.querySelector('#open-billing').addEventListener('click', () => void load());
  $('#billing-period').addEventListener('change', event => { const value = event.target.value; if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) void load(value.slice(5) + value.slice(0, 4)); });
  $('#billing-previous').addEventListener('click', () => void load(flow.period, flow.page - 1));
  $('#billing-next').addEventListener('click', () => void load(flow.period, flow.page + 1));
  return { render, clear: () => { flow.clear(); render(); } };
}
