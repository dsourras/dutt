import { WebsiteAccessApi, WebsiteAccessFlow, AccessError } from './access-client.mjs';
import { registrationAuth } from './firebase-auth.mjs';
import { attachBillingView } from './billing-view.mjs';
const messages = {
  el: { incomingCharges: 'Εισερχόμενες χρεώσεις', title: 'Εταιρικός λογαριασμός', registration: 'Εγγραφή επιχείρησης', checking: 'Έλεγχος διαθεσιμότητας…', unavailable: 'Η πρόσβαση εταιρικών λογαριασμών δεν είναι διαθέσιμη αυτή τη στιγμή.',
    nativeOnly: 'Συνέχισε στην εφαρμογή DUTT Customer.', nativeHandoff: 'Επίστρεψε στην εφαρμογή, άνοιξε τον Εταιρικό λογαριασμό και πάτησε Ανανέωση.',
    available: 'Πρόσβαση εταιρικού λογαριασμού', signin: 'Σύνδεση', signout: 'Αποσύνδεση', email: 'Email', password: 'Κωδικός', account: 'Στοιχεία λογαριασμού',
    refresh: 'Ανανέωση στοιχείων', verifyEmail: 'Επαλήθευση email', completeAccess: 'Επιβεβαίωση πρόσβασης', collaboration: 'Συνεργασία',
    acceptedPolicy: 'Αποδέχομαι τους όρους συνεργασίας.', collaborationTerms: 'Όροι συνεργασίας', closeTerms: 'Κλείσιμο',
    providerIdentity: 'DUTT · ΑΦΜ 103922076',
    collaborationSummary: 'Χρέωση εταιρικών παραλαβών, μετά την έγκριση της πίστωσης.',
    accept: 'Αποδοχή συνεργασίας', retryConsent: 'Επανάληψη αποδοχής', review: 'Έλεγχος συνεργασίας', recovery: 'Βοήθεια σύνδεσης', accessEmail: 'Email λογαριασμού',
    requestAccess: 'Αίτημα πρόσβασης', resend: 'Νέο αίτημα αποστολής', recheck: 'Νέος έλεγχος διαθεσιμότητας', privacy: 'Πολιτική απορρήτου', terms: 'Όροι χρήσης',
    pending: 'Σε αναμονή επαλήθευσης', ready: 'Επαληθευμένη εγγραφή', unapproved: 'Μη εγκεκριμένη πίστωση', active: 'Ενεργή πίστωση', suspended: 'Πίστωση σε αναστολή', revoked: 'Ανακλημένη πίστωση',
    legalName: 'Επωνυμία', afm: 'ΑΦΜ', registrationState: 'Εγγραφή', creditState: 'Πίστωση',
    emailPending: 'Εκκρεμεί επαλήθευση email.', proofPending: 'Εκκρεμεί επιβεβαίωση πρόσβασης ιδιοκτήτη.', policyMissing: 'Δεν είναι διαθέσιμο επαληθευμένο κείμενο συνεργασίας.',
    policyChanged: 'Απαιτείται έλεγχος της συνεργασίας.', consentRecorded: 'Η συνεργασία έγινε αποδεκτή.', consentPending: 'Εκκρεμεί αποδοχή συνεργασίας.',
    acceptanceUnavailable: 'Η αποδοχή συνεργασίας δεν είναι διαθέσιμη αυτή τη στιγμή.',
    clientUpdate: 'Ανανέωσε τη σελίδα για την αποδοχή των όρων συνεργασίας.',
    requested: 'Το αίτημα καταχωρίστηκε. Εφόσον ο λογαριασμός είναι επιλέξιμος, θα λάβετε οδηγίες στο email του. Η παράδοση μηνύματος δεν επιβεβαιώνεται εδώ.',
    verificationRequested: 'Το αίτημα επαλήθευσης email υποβλήθηκε. Ελέγξτε το email σας και ανανεώστε τα στοιχεία μετά την επαλήθευση.',
    signedIn: 'Η σύνδεση ολοκληρώθηκε.', signedOut: 'Έγινε αποσύνδεση.', ownerVerified: 'Η πρόσβαση ιδιοκτήτη επιβεβαιώθηκε.',
    invalidEmail: 'Το email δεν είναι έγκυρο.', invalidLogin: 'Δεν επιβεβαιώθηκε η σύνδεση. Ελέγξτε email και κωδικό.',
    freshLogin: 'Απαιτείται νέα σύνδεση στον ίδιο λογαριασμό.', protection: 'Δεν επιβεβαιώθηκε ο έλεγχος προστασίας. Δοκιμάστε νέο έλεγχο διαθεσιμότητας.',
    unavailableError: 'Η ενέργεια δεν επιβεβαιώθηκε. Απαιτείται έλεγχος ή επανάληψη της ίδιας αίτησης.',
    consentRequired: 'Αποδεχθείτε τους όρους συνεργασίας.', ownerRequired: 'Η πρόσβαση δεν επιβεβαιώθηκε. Συνδεθείτε μετά την ολοκλήρωση των οδηγιών πρόσβασης.',
    accountUnavailable: 'Δεν είναι διαθέσιμος επιβεβαιωμένος εταιρικός λογαριασμός για αυτή τη σύνδεση.', storage: 'Δεν είναι διαθέσιμη η αποθήκευση της συνεδρίας.', wait: 'Περιμένετε πριν υποβάλετε νέο αίτημα αποστολής.' },
  en: { incomingCharges: 'Incoming charges', title: 'Business account', registration: 'Business registration', checking: 'Checking availability…', unavailable: 'Business account access is currently unavailable.',
    nativeOnly: 'Continue in the DUTT Customer app.', nativeHandoff: 'Return to the app, open Business account and select Refresh.',
    available: 'Business account access', signin: 'Sign in', signout: 'Sign out', email: 'Email', password: 'Password', account: 'Account details',
    refresh: 'Refresh details', verifyEmail: 'Verify email', completeAccess: 'Confirm owner access', collaboration: 'Collaboration',
    acceptedPolicy: 'I accept the collaboration terms.', collaborationTerms: 'Collaboration terms', closeTerms: 'Close',
    providerIdentity: 'DUTT · VAT 103922076',
    collaborationSummary: 'Business incoming-shipment billing, after credit approval.',
    accept: 'Accept collaboration', retryConsent: 'Retry acceptance', review: 'Check collaboration', recovery: 'Sign-in help', accessEmail: 'Account email',
    requestAccess: 'Request access', resend: 'New delivery request', recheck: 'Check availability again', privacy: 'Privacy policy', terms: 'Terms of use',
    pending: 'Pending verification', ready: 'Verified registration', unapproved: 'Credit not approved', active: 'Credit active', suspended: 'Credit suspended', revoked: 'Credit revoked',
    legalName: 'Legal name', afm: 'VAT number', registrationState: 'Registration', creditState: 'Credit',
    emailPending: 'Email verification is pending.', proofPending: 'Owner access confirmation is pending.', policyMissing: 'Verified collaboration terms are unavailable.',
    policyChanged: 'The collaboration needs to be checked.', consentRecorded: 'Collaboration accepted.', consentPending: 'Collaboration acceptance is pending.',
    acceptanceUnavailable: 'Collaboration acceptance is currently unavailable.',
    clientUpdate: 'Reload the page to accept the collaboration terms.',
    requested: 'Request recorded. If the account is eligible, instructions will be delivered to its email. Message delivery is not confirmed here.',
    verificationRequested: 'Email verification was requested. Check your email and refresh details after verification.',
    signedIn: 'Signed in.', signedOut: 'Signed out.', ownerVerified: 'Owner access confirmed.', invalidEmail: 'The email is invalid.', invalidLogin: 'Sign-in was not confirmed. Check your email and password.',
    freshLogin: 'Sign in again to the same account.', protection: 'Protection verification failed. Check availability again.',
    unavailableError: 'The action was not confirmed. Check or retry the same request.', consentRequired: 'Accept the collaboration terms.',
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
let unsubscribeAuth, displayedPolicy;
try { language = localStorage.getItem('dutt_lang') === 'en' ? 'en' : 'el'; } catch { /* Language works without storage. */ }
const incoming = new URL(location.href).searchParams.get('requestId');
if (location.search || location.hash) history.replaceState(null, '', location.pathname);
try { if (incoming) flow.captureRequestId(incoming); } catch { status = 'storage'; }
const tr = key => messages[language][key] || messages[language].unavailableError;
function errorMessage(error) {
  const code = error.code || '';
  if (code === 'credit_client_update_required') return 'clientUpdate';
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
function closeTerms() { $('#collaboration-terms').close(); $('#policy-text').textContent = ''; displayedPolicy = null; }
function render() {
  billing.render();
  document.documentElement.lang = language; document.title = `DUTT | ${tr('title')}`;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = tr(node.dataset.i18n); });
  document.querySelectorAll('[data-lang]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === language)));
  const nativeOnly = !checking && flow.config?.available === false;
  $('#availability').textContent = tr(nativeOnly ? 'nativeOnly' : checking ? 'checking' : flow.config?.available ? 'available' : 'unavailable');
  $('#native-handoff').hidden = !nativeOnly;
  $('.back').hidden = nativeOnly || Boolean(flow.account) || Boolean(flow.request?.requestId);
  const enabled = !busy && !checking && flow.config?.available, account = flow.account;
  $('#signin-section').hidden = Boolean(account) || nativeOnly; $('#signin-fields').disabled = !enabled;
  $('#recovery-section').hidden = nativeOnly || Boolean(account && (!account.ownerProofRequired || account.ownerProofId));
  $('#recovery-fields').disabled = !enabled; $('#account-section').hidden = !account;
  $('#recheck-access').hidden = checking || busy || Boolean(flow.config?.available);
  $('#account-details').replaceChildren();
  if (displayedPolicy && (displayedPolicy.uid !== account?.customerUid || displayedPolicy.hash !== flow.policy?.hash || displayedPolicy.version !== flow.policy?.version)) closeTerms();
  $('#open-terms').hidden = !flow.policy;
  const registeredBusiness = account?.billingBasis === 'business_registration';
  $('#consent-section').hidden = registeredBusiness;
  $('#refresh').hidden = registeredBusiness;
  $('#signout').hidden = registeredBusiness;
  if (account) {
    for (const [name, value] of [['legalName', account.legalName], ['afm', account.afm], ['email', account.email], ['creditState', tr(account.creditState)]]) {
      if (registeredBusiness && name === 'creditState') continue;
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = tr(name); dd.textContent = value; $('#account-details').append(dt, dd);
    }
    if (registeredBusiness) {
      const dd = document.createElement('dd'); dd.textContent = language === 'el' ? 'Μηνιαίο τιμολόγιο' : 'Monthly invoice'; $('#account-details').append(dd);
    }
    $('#verify-email').hidden = account.emailVerified; $('#verify-email').disabled = !enabled || Date.now() - verificationAt < 60000;
    $('#complete-access').hidden = !flow.request?.requestId || !account.emailVerified || !account.ownerProofRequired || Boolean(account.ownerProofId); $('#complete-access').disabled = !enabled;
    $('#refresh').disabled = !enabled; $('#signout').disabled = busy;
    $('#policy-text').setAttribute('aria-label', tr('collaboration'));
    const state = !flow.policy ? 'policyMissing' : policyChanged() || account.consentRecorded && !account.policyMatches ? 'policyChanged' : account.consentRecorded ? 'consentRecorded' :
      !account.emailVerified ? 'emailPending' : account.ownerProofRequired && !account.ownerProofId ? 'proofPending' : !flow.termsOnlyPolicy ? 'acceptanceUnavailable' : 'consentPending';
    $('#consent-status').textContent = tr(state);
    $('#consent-form').hidden = account.consentRecorded || Boolean(flow.pending) || !flow.termsOnlyPolicy;
    $('#collaboration-summary').hidden = account.consentRecorded;
    $('#consent-fields').disabled = !enabled || !flow.termsOnlyPolicy || !account.emailVerified || account.ownerProofRequired && !account.ownerProofId || Boolean(flow.pending) || account.consentRecorded || account.creditState !== 'unapproved';
    $('#retry-consent').hidden = !flow.pending || policyChanged(); $('#retry-consent').disabled = !enabled;
    $('#review-policy').hidden = !(reviewAllowed || policyChanged()); $('#review-policy').disabled = !enabled;
  }
  $('#resend-access').hidden = !flow.request?.key; $('#resend-access').disabled = !enabled || Date.now() - (flow.request?.at || 0) < 60000;
  $('#access-result').hidden = !status; $('#access-result').textContent = status ? tr(status) : ''; $('#access-result').classList.toggle('success', success);
}
function resetConsentInputs() {
  $('#accepted-policy').checked = false;
}
async function perform(run, message = '') {
  if (busy) return; busy = true; status = ''; success = false; render();
  try { await run(); status = message === 'consentRecorded' ? '' : message; success = true; }
  catch (error) { status = errorMessage(error); success = false; if (['credit_revision_changed', 'credit_explicit_consent_required', 'website_access_source_changed'].includes(error.code)) reviewAllowed = true; }
  finally { busy = false; resetConsentInputs(); render(); if (success && message === 'consentRecorded') $('#consent-status').focus(); else if (status) $('#access-result').focus(); }
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
  finally { $('#login-email').value = ''; $('#login-password').value = ''; $('#access-email').value = ''; closeTerms(); }
}, 'signedOut'));
window.addEventListener('pagehide', () => { unsubscribeAuth?.(); billing.clear(); closeTerms(); }, { once: true });
$('#verify-email').addEventListener('click', () => void perform(async () => { await flow.verifyEmail(); verificationAt = Date.now(); }, 'verificationRequested'));
$('#recheck-access').addEventListener('click', () => void initialize());
$('#consent-form').addEventListener('submit', event => {
  event.preventDefault(); const acceptedPolicy = $('#accepted-policy').checked;
  void perform(() => flow.acceptTerms({ acceptedPolicy }), 'consentRecorded');
});
$('#open-terms').addEventListener('click', event => {
  event.preventDefault(); if (!flow.policy || !flow.account) return;
  $('#policy-text').textContent = flow.policy.text;
  displayedPolicy = { uid: flow.account.customerUid, version: flow.policy.version, hash: flow.policy.hash };
  $('#collaboration-terms').showModal();
});
$('#close-terms').addEventListener('click', closeTerms);
$('#collaboration-terms').addEventListener('close', () => { $('#policy-text').textContent = ''; displayedPolicy = null; });
$('#retry-consent').addEventListener('click', () => void perform(() => flow.accept({}), 'consentRecorded'));
$('#review-policy').addEventListener('click', () => void perform(async () => { flow.reviewAgain(); reviewAllowed = false; await flow.load(); }));
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => { language = button.dataset.lang; try { localStorage.setItem('dutt_lang', language); } catch { /* Not required for language changes. */ } render(); }));
const timer = setInterval(() => {
  if (busy || checking || !flow.config?.available) return;
  $('#resend-access').disabled = Date.now() - (flow.request?.at || 0) < 60000;
  $('#verify-email').disabled = Date.now() - verificationAt < 60000;
}, 1000); window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
if (flow.request?.email) $('#access-email').value = flow.request.email;
render(); void initialize();
