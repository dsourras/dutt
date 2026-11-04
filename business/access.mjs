import { WebsiteAccessApi, WebsiteAccessFlow, AccessError } from './access-client.mjs';
import { registrationAuth } from './firebase-auth.mjs';
import { attachBillingView } from './billing-view.mjs';
const messages = {
  el: { incomingCharges: 'Εισερχόμενες χρεώσεις', title: 'Εταιρικός λογαριασμός', registration: 'Εγγραφή επιχείρησης', checking: 'Έλεγχος διαθεσιμότητας…', unavailable: 'Η πρόσβαση εταιρικών λογαριασμών δεν είναι διαθέσιμη αυτή τη στιγμή.',
    nativeOnly: 'Συνέχισε στην εφαρμογή DUTT Customer.', nativeHandoff: 'Επίστρεψε στην εφαρμογή, άνοιξε τον Εταιρικό λογαριασμό και πάτησε Ανανέωση.',
    available: 'Πρόσβαση εταιρικού λογαριασμού', signin: 'Σύνδεση', signout: 'Αποσύνδεση', email: 'Email', password: 'Κωδικός', account: 'Στοιχεία λογαριασμού',
    refresh: 'Ανανέωση στοιχείων', verifyEmail: 'Επαλήθευση email', completeAccess: 'Επιβεβαίωση πρόσβασης', collaboration: 'Συνεργασία',
    authority: 'Έχω εξουσιοδότηση να δεσμεύσω αυτή την επιχείρηση.', acceptedPolicy: 'Έχω διαβάσει και αποδέχομαι το εμφανιζόμενο κείμενο συνεργασίας.',
    scope: 'Αποστολείς που επιτρέπεται να χρεώνουν την επιχείρηση', allSenders: 'Όλοι οι επαληθευμένοι εταιρικοί αποστολείς', selectedSenders: 'Μόνο συγκεκριμένοι αποστολείς', senderUids: 'UID αποστολέων',
    accept: 'Αποδοχή συνεργασίας', retryConsent: 'Επανάληψη ίδιας αποδοχής', review: 'Νέα ανάγνωση πολιτικής', recovery: 'Απόκτηση ή ανάκτηση πρόσβασης', accessEmail: 'Email λογαριασμού',
    requestAccess: 'Αίτημα πρόσβασης', resend: 'Νέο αίτημα αποστολής', recheck: 'Νέος έλεγχος διαθεσιμότητας', privacy: 'Πολιτική απορρήτου', terms: 'Όροι χρήσης',
    pending: 'Σε αναμονή επαλήθευσης', ready: 'Επαληθευμένη εγγραφή', unapproved: 'Μη εγκεκριμένη πίστωση', active: 'Ενεργή πίστωση', suspended: 'Πίστωση σε αναστολή', revoked: 'Ανακλημένη πίστωση',
    legalName: 'Επωνυμία', afm: 'ΑΦΜ', uid: 'UID πελάτη', registrationState: 'Εγγραφή', creditState: 'Πίστωση', version: 'Έκδοση',
    emailPending: 'Εκκρεμεί επαλήθευση email.', proofPending: 'Εκκρεμεί επιβεβαίωση πρόσβασης ιδιοκτήτη.', policyMissing: 'Δεν είναι διαθέσιμο επαληθευμένο κείμενο συνεργασίας.',
    policyChanged: 'Η πολιτική συνεργασίας άλλαξε. Απαιτείται νέος έλεγχος.', consentRecorded: 'Η συγκατάθεση συνεργασίας έχει καταγραφεί.', consentPending: 'Εκκρεμεί αποδοχή συνεργασίας.',
    requested: 'Το αίτημα καταχωρίστηκε. Εφόσον ο λογαριασμός είναι επιλέξιμος, θα λάβετε οδηγίες στο email του. Η παράδοση μηνύματος δεν επιβεβαιώνεται εδώ.',
    verificationRequested: 'Το αίτημα επαλήθευσης email υποβλήθηκε. Ελέγξτε το email σας και ανανεώστε τα στοιχεία μετά την επαλήθευση.',
    signedIn: 'Η σύνδεση ολοκληρώθηκε.', signedOut: 'Έγινε αποσύνδεση.', ownerVerified: 'Η πρόσβαση ιδιοκτήτη επιβεβαιώθηκε.',
    invalidEmail: 'Το email δεν είναι έγκυρο.', invalidLogin: 'Δεν επιβεβαιώθηκε η σύνδεση. Ελέγξτε email και κωδικό.',
    freshLogin: 'Απαιτείται νέα σύνδεση στον ίδιο λογαριασμό.', protection: 'Δεν επιβεβαιώθηκε ο έλεγχος προστασίας. Δοκιμάστε νέο έλεγχο διαθεσιμότητας.',
    unavailableError: 'Η ενέργεια δεν επιβεβαιώθηκε. Απαιτείται έλεγχος ή επανάληψη της ίδιας αίτησης.',
    consentRequired: 'Επιβεβαιώστε εξουσιοδότηση, αποδοχή κειμένου και επιτρεπόμενους αποστολείς.', ownerRequired: 'Η πρόσβαση δεν επιβεβαιώθηκε. Συνδεθείτε μετά την ολοκλήρωση των οδηγιών πρόσβασης.',
    accountUnavailable: 'Δεν είναι διαθέσιμος επιβεβαιωμένος εταιρικός λογαριασμός για αυτή τη σύνδεση.', storage: 'Δεν είναι διαθέσιμη η αποθήκευση της συνεδρίας.', wait: 'Περιμένετε πριν υποβάλετε νέο αίτημα αποστολής.' },
  en: { incomingCharges: 'Incoming charges', title: 'Business account', registration: 'Business registration', checking: 'Checking availability…', unavailable: 'Business account access is currently unavailable.',
    nativeOnly: 'Continue in the DUTT Customer app.', nativeHandoff: 'Return to the app, open Business account and select Refresh.',
    available: 'Business account access', signin: 'Sign in', signout: 'Sign out', email: 'Email', password: 'Password', account: 'Account details',
    refresh: 'Refresh details', verifyEmail: 'Verify email', completeAccess: 'Confirm owner access', collaboration: 'Collaboration',
    authority: 'I am authorized to bind this business.', acceptedPolicy: 'I have read and accept the displayed collaboration terms.',
    scope: 'Senders permitted to bill this business', allSenders: 'All verified business senders', selectedSenders: 'Specific senders only', senderUids: 'Sender UIDs',
    accept: 'Accept collaboration', retryConsent: 'Retry the same acceptance', review: 'Review current policy', recovery: 'Set up or recover access', accessEmail: 'Account email',
    requestAccess: 'Request access', resend: 'New delivery request', recheck: 'Check availability again', privacy: 'Privacy policy', terms: 'Terms of use',
    pending: 'Pending verification', ready: 'Verified registration', unapproved: 'Credit not approved', active: 'Credit active', suspended: 'Credit suspended', revoked: 'Credit revoked',
    legalName: 'Legal name', afm: 'VAT number', uid: 'Customer UID', registrationState: 'Registration', creditState: 'Credit', version: 'Version',
    emailPending: 'Email verification is pending.', proofPending: 'Owner access confirmation is pending.', policyMissing: 'Verified collaboration terms are unavailable.',
    policyChanged: 'The collaboration policy changed. A new review is required.', consentRecorded: 'Collaboration consent is recorded.', consentPending: 'Collaboration acceptance is pending.',
    requested: 'Request recorded. If the account is eligible, instructions will be delivered to its email. Message delivery is not confirmed here.',
    verificationRequested: 'Email verification was requested. Check your email and refresh details after verification.',
    signedIn: 'Signed in.', signedOut: 'Signed out.', ownerVerified: 'Owner access confirmed.', invalidEmail: 'The email is invalid.', invalidLogin: 'Sign-in was not confirmed. Check your email and password.',
    freshLogin: 'Sign in again to the same account.', protection: 'Protection verification failed. Check availability again.',
    unavailableError: 'The action was not confirmed. Check or retry the same request.', consentRequired: 'Confirm authority, acceptance of the terms and permitted senders.',
    ownerRequired: 'Access was not confirmed. Sign in after completing the access instructions.', accountUnavailable: 'No confirmed business account is available for this session.',
    storage: 'Session storage is unavailable.', wait: 'Wait before submitting a new delivery request.' },
};
const $ = selector => document.querySelector(selector);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const api = new WebsiteAccessApi({ endpoint: local ? new URL('/__business_api', location.origin).href : 'https://us-central1-sendygo-cd034.cloudfunctions.net/duttCustomerDatabaseCommand' });
let storage; try { storage = sessionStorage; } catch { storage = { getItem() {}, setItem() { throw new Error('storage_unavailable'); } }; }
const flow = new WebsiteAccessFlow({ api, authFactory: registrationAuth, storage });
let language = 'el', busy = false, checking = true, status = '', success = false, reviewAllowed = false, verificationAt = 0;
const billing = attachBillingView({ access: flow, language: () => language });
let unsubscribeAuth;
try { language = localStorage.getItem('dutt_lang') === 'en' ? 'en' : 'el'; } catch { /* Language works without storage. */ }
const incoming = new URL(location.href).searchParams.get('requestId');
if (location.search || location.hash) history.replaceState(null, '', location.pathname);
try { if (incoming) flow.captureRequestId(incoming); } catch { status = 'storage'; }
const tr = key => messages[language][key] || messages[language].unavailableError;
function errorMessage(error) {
  const code = error.code || '';
  if (code === 'invalid_email') return 'invalidEmail';
  if (code.startsWith('auth/')) return 'invalidLogin';
  if (['website_access_unauthorized', 'credit_owner_verification_required', 'credit_unauthorized'].includes(code)) return 'freshLogin';
  if (code === 'website_access_protection_required') return 'protection';
  if (['policy_invalid', 'website_access_policy_unavailable'].includes(code)) return 'policyMissing';
  if (['website_access_source_changed', 'credit_revision_changed', 'credit_explicit_consent_required'].includes(code)) return 'policyChanged';
  if (code === 'website_access_account_unavailable') return 'accountUnavailable';
  if (code.startsWith('access_confirmation')) return 'ownerRequired';
  if (code === 'consent_required') return 'consentRequired';
  if (code === 'storage_unavailable') return 'storage';
  if (code === 'access_wait') return 'wait';
  return 'unavailableError';
}
function policyChanged() { return Boolean(flow.pending && flow.policy && (flow.pending.body.policyHash !== flow.policy.hash || flow.pending.body.policyVersion !== flow.policy.version)); }
function render() {
  billing.render();
  document.documentElement.lang = language; document.title = `DUTT | ${tr('title')}`;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = tr(node.dataset.i18n); });
  document.querySelectorAll('[data-lang]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === language)));
  const nativeOnly = !checking && flow.config?.available === false;
  $('#availability').textContent = tr(nativeOnly ? 'nativeOnly' : checking ? 'checking' : flow.config?.available ? 'available' : 'unavailable');
  $('#native-handoff').hidden = !nativeOnly;
  $('.back').hidden = nativeOnly;
  const enabled = !busy && !checking && flow.config?.available, account = flow.account;
  $('#signin-section').hidden = Boolean(account) || nativeOnly; $('#signin-fields').disabled = !enabled;
  $('#recovery-section').hidden = nativeOnly;
  $('#recovery-fields').disabled = !enabled; $('#account-section').hidden = !account;
  $('#recheck-access').hidden = checking || busy || Boolean(flow.config?.available);
  $('#account-details').replaceChildren();
  if (account) {
    for (const [name, value] of [['legalName', account.legalName], ['afm', account.afm], ['uid', account.customerUid], ['email', account.email], ['registrationState', tr(account.registrationState === 'ready' ? 'ready' : 'pending')], ['creditState', tr(account.creditState)]]) {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = tr(name); dd.textContent = value; $('#account-details').append(dt, dd);
    }
    $('#verify-email').hidden = account.emailVerified; $('#verify-email').disabled = !enabled || Date.now() - verificationAt < 60000;
    $('#complete-access').hidden = !flow.request?.requestId || !account.emailVerified; $('#complete-access').disabled = !enabled;
    $('#refresh').disabled = !enabled; $('#signout').disabled = busy;
    $('#policy-text').textContent = flow.policy?.text || ''; $('#policy-text').hidden = !flow.policy;
    $('#policy-text').setAttribute('aria-label', tr('collaboration'));
    $('#policy-version').textContent = flow.policy ? `${tr('version')}: ${flow.policy.version} | SHA256: ${flow.policy.hash}` : ''; $('#policy-version').style.overflowWrap = 'anywhere';
    const state = !flow.policy ? 'policyMissing' : policyChanged() || account.consentRecorded && !account.policyMatches ? 'policyChanged' : account.consentRecorded ? 'consentRecorded' :
      !account.emailVerified ? 'emailPending' : account.ownerProofRequired && !account.ownerProofId ? 'proofPending' : 'consentPending';
    $('#consent-status').textContent = tr(state);
    $('#consent-fields').disabled = !enabled || !flow.policy || !account.emailVerified || account.ownerProofRequired && !account.ownerProofId || Boolean(flow.pending) || account.consentRecorded || account.creditState !== 'unapproved';
    $('#retry-consent').hidden = !flow.pending || policyChanged(); $('#retry-consent').disabled = !enabled;
    $('#review-policy').hidden = !(reviewAllowed || policyChanged()); $('#review-policy').disabled = !enabled;
  }
  $('#resend-access').hidden = !flow.request?.key; $('#resend-access').disabled = !enabled || Date.now() - (flow.request?.at || 0) < 60000;
  $('#access-result').hidden = !status; $('#access-result').textContent = status ? tr(status) : ''; $('#access-result').classList.toggle('success', success);
  $('#sender-list').hidden = !document.querySelector('[name=scope][value=approved_sender_uids]').checked;
}
function resetConsentInputs() {
  $('#authority').checked = false; $('#accepted-policy').checked = false; $('#sender-uids').value = '';
  document.querySelectorAll('[name=scope]').forEach(input => { input.checked = false; });
  if (flow.pending && !policyChanged()) {
    $('#authority').checked = flow.pending.body.authorityDeclaration === true; $('#accepted-policy').checked = flow.pending.body.acceptedPolicy === true;
    const selected = document.querySelector(`[name=scope][value="${flow.pending.body.scope?.mode === 'approved_sender_uids' ? 'approved_sender_uids' : 'verified_business_senders'}"]`);
    selected.checked = true; $('#sender-uids').value = flow.pending.body.scope?.senderUids?.join('\n') || '';
  }
}
async function perform(run, message = '') {
  if (busy) return; busy = true; status = ''; success = false; render();
  try { await run(); status = message; success = true; }
  catch (error) { status = errorMessage(error); success = false; if (['credit_revision_changed', 'credit_explicit_consent_required', 'website_access_source_changed'].includes(error.code)) reviewAllowed = true; }
  finally { busy = false; resetConsentInputs(); render(); if (status) $('#access-result').focus(); }
}
async function initialize() {
  checking = true; render();
  await perform(async () => { await flow.initialize(); if (flow.account && !$('#access-email').value) $('#access-email').value = flow.account.email; });
  checking = false; render();
  unsubscribeAuth?.();
  unsubscribeAuth = flow.auth?.subscribe?.(user => {
    if ((user?.uid || null) !== (flow.user?.uid || null)) {
      flow.user = user; flow.account = null; flow.policy = null; billing.clear(); render();
    }
  });
}
$('#signin-form').addEventListener('submit', event => {
  event.preventDefault(); const email = $('#login-email').value, password = $('#login-password').value;
  void perform(async () => { try { await flow.signIn(email, password); $('#access-email').value = email; } finally { $('#login-password').value = ''; } }, 'signedIn');
});
$('#recovery-form').addEventListener('submit', event => { event.preventDefault(); void perform(() => flow.requestAccess($('#access-email').value), 'requested'); });
$('#resend-access').addEventListener('click', () => void perform(() => flow.requestAccess($('#access-email').value, true), 'requested'));
$('#complete-access').addEventListener('click', () => void perform(() => flow.completeAccess(), 'ownerVerified'));
$('#refresh').addEventListener('click', () => void perform(() => flow.refresh()));
$('#signout').addEventListener('click', () => void perform(async () => {
  billing.clear();
  try { await flow.signOut(); }
  finally { $('#login-email').value = ''; $('#login-password').value = ''; $('#access-email').value = ''; $('#policy-text').textContent = ''; $('#policy-version').textContent = ''; }
}, 'signedOut'));
window.addEventListener('pagehide', () => { unsubscribeAuth?.(); billing.clear(); }, { once: true });
$('#verify-email').addEventListener('click', () => void perform(async () => { await flow.verifyEmail(); verificationAt = Date.now(); }, 'verificationRequested'));
$('#recheck-access').addEventListener('click', () => void initialize());
$('#consent-form').addEventListener('submit', event => {
  event.preventDefault(); const mode = document.querySelector('[name=scope]:checked')?.value;
  const scope = mode === 'approved_sender_uids' ? { mode, senderUids: $('#sender-uids').value.split(/[\s,]+/).filter(Boolean) } : mode ? { mode } : null;
  void perform(() => flow.accept({ authority: $('#authority').checked, acceptedPolicy: $('#accepted-policy').checked, scope }), 'consentRecorded');
});
$('#retry-consent').addEventListener('click', () => void perform(() => flow.accept({}), 'consentRecorded'));
$('#review-policy').addEventListener('click', () => void perform(async () => { flow.reviewAgain(); reviewAllowed = false; await flow.load(); }));
document.querySelectorAll('[name=scope]').forEach(input => input.addEventListener('change', render));
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => { language = button.dataset.lang; try { localStorage.setItem('dutt_lang', language); } catch { /* Not required for language changes. */ } render(); }));
const timer = setInterval(() => {
  if (busy || checking || !flow.config?.available) return;
  $('#resend-access').disabled = Date.now() - (flow.request?.at || 0) < 60000;
  $('#verify-email').disabled = Date.now() - verificationAt < 60000;
}, 1000); window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
if (flow.request?.email) $('#access-email').value = flow.request.email;
render(); void initialize();
