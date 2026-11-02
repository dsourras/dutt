import { RegistrationApi, RegistrationFlow, RegistrationError, registrationPayload } from './registration-client.mjs';
import { registrationAuth } from './firebase-auth.mjs';
const strings = {
  el: { home: 'DUTT / Αρχική', accessAccount: 'Πρόσβαση λογαριασμού', title: 'Εγγραφή επιχείρησης', checking: 'Έλεγχος διαθεσιμότητας…', available: 'Νέα εταιρική εγγραφή',
    unavailable: 'Η εταιρική εγγραφή δεν είναι διαθέσιμη αυτή τη στιγμή.', business: 'Στοιχεία επιχείρησης', legalName: 'Επωνυμία', afm: 'ΑΦΜ', taxOffice: 'ΔΟΥ (προαιρετικό)',
    contactName: 'Ονοματεπώνυμο εκπροσώπου', email: 'Email', phone: 'Τηλέφωνο', address: 'Φορολογική διεύθυνση', street: 'Οδός', number: 'Αριθμός', city: 'Πόλη', postalCode: 'Ταχυδρομικός κώδικας',
    credentials: 'Στοιχεία νέου λογαριασμού', password: 'Κωδικός', confirm: 'Επιβεβαίωση κωδικού', submit: 'Δημιουργία εταιρικού λογαριασμού', retry: 'Επανάληψη ίδιας αίτησης',
    correct: 'Διόρθωση στοιχείων', recheck: 'Νέος έλεγχος διαθεσιμότητας', privacy: 'Πολιτική απορρήτου', terms: 'Όροι χρήσης', busy: 'Καταχώριση…',
    invalid_input: 'Ελέγξτε τα υποχρεωτικά στοιχεία.', invalid_afm: 'Το ΑΦΜ δεν είναι έγκυρο.', invalid_email: 'Το email δεν είναι έγκυρο.', invalid_phone: 'Το τηλέφωνο δεν είναι έγκυρο.',
    invalid_postal_code: 'Ο ταχυδρομικός κώδικας πρέπει να έχει 5 ψηφία.', invalid_password: 'Ο κωδικός δεν πληροί τις απαιτήσεις ασφαλείας. Χρησιμοποιήστε τουλάχιστον 8 χαρακτήρες.',
    password_mismatch: 'Οι κωδικοί δεν ταιριάζουν.', account_access_required: 'Υπάρχει ήδη λογαριασμός. Απαιτείται πρόσβαση στον υπάρχοντα λογαριασμό, όχι νέα εγγραφή.',
    account_mismatch: 'Η συνδεδεμένη ταυτότητα δεν αντιστοιχεί στην αίτηση.', review_required: 'Η εγγραφή χρειάζεται έλεγχο. Επικοινωνήστε με το info@dutt.gr.',
    temporarily_unavailable: 'Η καταχώριση δεν επιβεβαιώθηκε. Επαναλάβετε την ίδια αίτηση.', storage_unavailable: 'Δεν είναι διαθέσιμη η ασφαλής αποθήκευση της συνεδρίας.',
    registered: 'Η εταιρική εγγραφή καταχωρίστηκε.', pending_verification: 'Σε αναμονή επαλήθευσης', ready: 'Επαληθευμένη εγγραφή', customerUid: 'UID πελάτη', state: 'Κατάσταση',
    session: 'Η συνεδρία δεν είναι διαθέσιμη. Απαιτείται πρόσβαση στον ίδιο λογαριασμό.' },
  en: { home: 'DUTT / Home', accessAccount: 'Account access', title: 'Business registration', checking: 'Checking availability…', available: 'New business registration',
    unavailable: 'Business registration is currently unavailable.', business: 'Business details', legalName: 'Legal business name', afm: 'Greek VAT number', taxOffice: 'Tax office (optional)',
    contactName: 'Representative full name', email: 'Email', phone: 'Phone', address: 'Billing address', street: 'Street', number: 'Number', city: 'City', postalCode: 'Postal code',
    credentials: 'New account credentials', password: 'Password', confirm: 'Confirm password', submit: 'Create business account', retry: 'Retry the same request',
    correct: 'Correct details', recheck: 'Check availability again', privacy: 'Privacy policy', terms: 'Terms of use', busy: 'Submitting…',
    invalid_input: 'Check the required details.', invalid_afm: 'The VAT number is invalid.', invalid_email: 'The email is invalid.', invalid_phone: 'The phone number is invalid.',
    invalid_postal_code: 'The postal code must contain 5 digits.', invalid_password: 'The password does not meet security requirements. Use at least 8 characters.',
    password_mismatch: 'The passwords do not match.', account_access_required: 'An account already exists. Access to that account is required, not a new registration.',
    account_mismatch: 'The signed-in identity does not match this request.', review_required: 'This registration requires review. Contact info@dutt.gr.',
    temporarily_unavailable: 'Registration was not confirmed. Retry the same request.', storage_unavailable: 'Secure session storage is unavailable.',
    registered: 'Business registration recorded.', pending_verification: 'Pending verification', ready: 'Verified registration', customerUid: 'Customer UID', state: 'Status',
    session: 'Your session is unavailable. Access to the same account is required.' },
};
const form = document.querySelector('#registration-form'), fields = document.querySelector('#fields'), notice = document.querySelector('#availability'), resultBox = document.querySelector('#result');
const submit = document.querySelector('#submit'), retry = document.querySelector('#retry'), correct = document.querySelector('#correct'), recheck = document.querySelector('#recheck');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const api = new RegistrationApi({ endpoint: local ? new URL('/__business_api', location.origin).href : 'https://us-central1-sendygo-cd034.cloudfunctions.net/duttCustomerDatabaseCommand' });
let storage; try { storage = sessionStorage; } catch { storage = { getItem() {}, setItem() { throw new Error('storage_unavailable'); } }; }
const flow = new RegistrationFlow({ api, authFactory: registrationAuth, storage });
let language = 'el', available = false, checking = false, busy = false, outcome = null, errorKey = '', manualReview = false, allowCorrection = false;
try { language = localStorage.getItem('dutt_lang') === 'en' ? 'en' : 'el'; } catch { /* Storage may be disabled by the browser. */ }
function tr(key) { return strings[language][key] || strings[language].temporarily_unavailable; }
function render() {
  document.documentElement.lang = language; document.title = `DUTT | ${tr('title')}`;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = tr(node.dataset.i18n); });
  document.querySelectorAll('[data-lang]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === language)));
  notice.textContent = tr(checking ? 'checking' : available ? 'available' : 'unavailable');
  fields.disabled = busy || checking || !available || Boolean(outcome);
  const owned = Boolean(flow.ownerUid);
  form.querySelectorAll('input').forEach(input => {
    const credential = ['password', 'confirmPassword'].includes(input.name);
    input.readOnly = Boolean(flow.pending) && !(credential && !owned) || input.name === 'email' && owned;
    if (credential) input.required = !owned;
  });
  document.querySelector('#credentials-title').hidden = owned;
  document.querySelector('#credentials-fields').hidden = owned;
  submit.disabled = busy || checking || !available || Boolean(flow.pending) || Boolean(outcome);
  submit.textContent = tr(busy ? 'busy' : 'submit'); submit.hidden = Boolean(flow.pending) || Boolean(outcome);
  retry.hidden = !flow.pending || manualReview || Boolean(outcome); retry.disabled = busy || checking;
  correct.hidden = !allowCorrection || busy; recheck.hidden = available || busy || checking;
  resultBox.hidden = !errorKey && !outcome; resultBox.classList.toggle('success', Boolean(outcome));
  if (outcome) resultBox.textContent = `${tr('registered')} ${tr('state')}: ${tr(outcome.registrationState)}. ${tr('customerUid')}: ${outcome.customerUid}`;
  else resultBox.textContent = errorKey ? tr(errorKey) : '';
  form.setAttribute('aria-busy', String(busy));
}
function values() {
  const data = Object.fromEntries(new FormData(form));
  return { ...data, address: { street: data.street, number: data.number, city: data.city, postalCode: data.postalCode } };
}
if (flow.pending) {
  for (const [key, value] of Object.entries({ ...flow.pending.payload, ...flow.pending.payload.address })) {
    const input = form.elements.namedItem(key); if (input instanceof HTMLInputElement) input.value = value;
  }
  errorKey = 'temporarily_unavailable';
}
async function checkAvailability() {
  if (checking || busy) return; checking = true; render();
  try { available = await api.available(); } catch { available = false; }
  finally { checking = false; render(); }
}
async function send() {
  if (busy || outcome || manualReview) return;
  errorKey = ''; allowCorrection = false;
  if (!flow.pending) {
    if (!form.reportValidity()) return;
    if (form.elements.password.value !== form.elements.confirmPassword.value) { errorKey = 'password_mismatch'; render(); resultBox.focus(); return; }
    try { registrationPayload(values()); } catch (error) { errorKey = error.code || 'invalid_input'; render(); resultBox.focus(); return; }
  }
  const input = flow.pending?.payload || values(), password = form.elements.password.value;
  busy = true; render();
  try { outcome = await flow.submit(input, password); }
  catch (error) {
    const code = error instanceof RegistrationError ? error.code : 'temporarily_unavailable';
    if (code === 'business_registration_not_enabled') { available = false; errorKey = 'unavailable'; }
    else if (['account_access_required', 'account_mismatch', 'storage_unavailable', 'invalid_password', 'invalid_email'].includes(code)) errorKey = code;
    else if (error.status === 'review_required' || error.status === 'account_access_required') errorKey = error.status;
    else if (error.status === 'unauthorized' || error.status === 'forbidden') errorKey = 'session';
    else errorKey = 'temporarily_unavailable';
    manualReview = ['account_access_required', 'account_mismatch', 'review_required', 'session'].includes(errorKey);
    allowCorrection = error.status === 'invalid_input' || ['invalid_password', 'invalid_email'].includes(code);
    if (error.status === 'invalid_input') errorKey = 'invalid_input';
  } finally {
    form.elements.password.value = ''; form.elements.confirmPassword.value = ''; busy = false; render(); resultBox.focus();
  }
}
form.addEventListener('submit', event => { event.preventDefault(); void send(); });
retry.addEventListener('click', () => void send());
correct.addEventListener('click', () => { flow.correct(); errorKey = ''; allowCorrection = false; render(); });
recheck.addEventListener('click', () => void checkAvailability());
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => {
  language = button.dataset.lang; try { localStorage.setItem('dutt_lang', language); } catch { /* Language still changes without persistence. */ } render();
}));
render(); void checkAvailability();
