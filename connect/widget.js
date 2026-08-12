(function () {
  "use strict";

  const script = document.currentScript;
  if (!script || script.dataset.duttLoaded === "true") return;
  script.dataset.duttLoaded = "true";

  const installationId = String(script.dataset.duttInstallation || "").trim();
  if (!/^dutt_inst_[A-Za-z0-9_-]+$/.test(installationId)) {
    console.error("DUTT Hosted Connector: invalid installation ID.");
    return;
  }

  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  const endpoint = isLocal && script.dataset.duttEndpoint
    ? script.dataset.duttEndpoint
    : "https://us-central1-sendygo-cd034.cloudfunctions.net/duttHostedConnectorPublic";
  const subtotalSelector = String(script.dataset.duttCartSubtotalSelector || "").trim();
  let suppliedSubtotal = parseMoney(script.dataset.duttCartSubtotal);

  function parseMoney(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const compact = String(value || "").replace(/[^0-9,.-]/g, "").trim();
    if (!compact) return null;
    const normalized = compact.includes(",")
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact;
    const number = Number(normalized);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
  }

  function currentSubtotal() {
    if (suppliedSubtotal !== null) return suppliedSubtotal;
    if (subtotalSelector) {
      try {
        return parseMoney(document.querySelector(subtotalSelector)?.textContent);
      } catch {
        return null;
      }
    }
    return null;
  }

  function clientReference() {
    const key = `dutt-hosted-client:${installationId}`;
    let value = sessionStorage.getItem(key);
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `browser-${Date.now()}-${Math.random()}`;
      sessionStorage.setItem(key, value);
    }
    return value;
  }

  function renewClientReference() {
    sessionStorage.removeItem(`dutt-hosted-client:${installationId}`);
  }

  function sessionKey(sessionId) {
    return `dutt-hosted-session:${installationId}:${sessionId}`;
  }

  async function api(body, sessionToken = "", retry = 0) {
    const headers = { "Content-Type": "application/json" };
    if (sessionToken) headers["X-DUTT-Session-Token"] = sessionToken;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, installation_id: installationId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (
      !response.ok &&
      payload.reason === "hosted_quote_in_progress" &&
      body.action === "quote" &&
      retry < 6
    ) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      return api(body, sessionToken, retry + 1);
    }
    if (!response.ok || payload.success === false) {
      const error = new Error(payload.reason || "hosted_request_failed");
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function messageFor(error) {
    const reason = String(error?.message || "");
    const messages = {
      hosted_rate_limited: "Έγιναν πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγο.",
      hosted_quote_in_progress: "Ο υπολογισμός είναι ήδη σε εξέλιξη. Δοκιμάστε ξανά σε λίγο.",
      hosted_origin_not_allowed: "Η σύνδεση του καταστήματος δεν είναι ενεργή.",
      hosted_session_expired: "Η προσφορά έληξε. Ζητήστε νέα τιμή.",
      delivery_address_required: "Συμπληρώστε τη διεύθυνση παράδοσης.",
      recipient_phone_invalid: "Ελέγξτε το τηλέφωνο παραλήπτη.",
      cart_subtotal_invalid: "Ελέγξτε την αξία της παραγγελίας.",
    };
    return messages[reason] || "Δεν ήταν δυνατή η σύνδεση με τη DUTT. Δοκιμάστε ξανά.";
  }

  class DuttHostedConnector extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.config = null;
      this.quote = null;
      this.busy = false;
    }

    connectedCallback() {
      this.render();
      this.bind();
      this.loadConfig();
    }

    render() {
      this.shadowRoot.innerHTML = `
        <style>
          :host { all: initial; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0; }
          * { box-sizing: border-box; }
          [hidden] { display: none !important; }
          button, input, textarea { font: inherit; letter-spacing: 0; }
          .launch { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000; min-height: 50px; padding: 0 18px; border: 0; border-radius: 7px; background: #f7c900; color: #090909; font-weight: 800; box-shadow: 0 8px 24px rgba(0,0,0,.25); cursor: pointer; }
          .launch[hidden], .overlay[hidden], .step[hidden] { display: none; }
          .overlay { position: fixed; inset: 0; z-index: 2147483001; display: grid; align-items: end; justify-items: center; padding: 18px; background: rgba(0,0,0,.62); }
          .sheet { width: min(100%, 560px); max-height: min(88vh, 760px); overflow: auto; border: 1px solid #303030; border-radius: 8px 8px 0 0; background: #111; color: #fff; box-shadow: 0 18px 48px rgba(0,0,0,.4); }
          .head { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid #303030; background: #111; }
          h2 { margin: 0; font-size: 20px; line-height: 1.2; }
          .close { width: 38px; height: 38px; border: 1px solid #444; border-radius: 6px; background: transparent; color: #fff; cursor: pointer; }
          form, .step { padding: 20px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
          label { display: grid; gap: 7px; color: #cfcfcf; font-size: 13px; }
          label.wide { grid-column: 1 / -1; }
          input, textarea { width: 100%; min-height: 46px; border: 1px solid #494949; border-radius: 6px; padding: 10px 12px; background: #181818; color: #fff; outline: none; }
          textarea { min-height: 76px; resize: vertical; }
          input:focus, textarea:focus { border-color: #f7c900; }
          .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
          .primary, .secondary { min-height: 46px; padding: 0 17px; border-radius: 6px; font-weight: 800; cursor: pointer; }
          .primary { border: 1px solid #f7c900; background: #f7c900; color: #090909; }
          .secondary { border: 1px solid #494949; background: transparent; color: #fff; }
          button:disabled { cursor: wait; opacity: .55; }
          .notice { min-height: 20px; margin: 14px 0 0; color: #ffcfcc; font-size: 13px; }
          .quote { display: grid; gap: 12px; padding: 18px; border: 1px solid #3d3d3d; border-radius: 7px; background: #181818; }
          .quote-row { display: flex; justify-content: space-between; gap: 18px; }
          .quote-row strong { color: #f7c900; font-size: 21px; }
          .muted { margin: 0; color: #b8b8b8; font-size: 14px; line-height: 1.5; }
          .consent { grid-template-columns: 20px 1fr; align-items: start; gap: 10px; color: #d2d2d2; font-size: 13px; line-height: 1.45; }
          .consent input { width: 19px; min-height: 19px; margin: 1px 0 0; padding: 0; accent-color: #f7c900; }
          .consent a { color: #fff; }
          .success { display: grid; gap: 12px; text-align: center; padding: 34px 20px 30px; }
          .success-mark { width: 46px; height: 46px; margin: 0 auto; border-radius: 50%; display: grid; place-items: center; background: #207a45; font-weight: 900; }
          .reference { color: #f7c900; font-weight: 800; }
          @media (min-width: 620px) { .overlay { align-items: center; } .sheet { border-radius: 8px; } }
          @media (max-width: 520px) { .overlay { padding: 0; } .sheet { max-height: 92vh; } .grid { grid-template-columns: 1fr; } label.wide { grid-column: auto; } .launch { right: 12px; bottom: 12px; } }
        </style>
        <button class="launch" type="button">Παράδοση με DUTT</button>
        <div class="overlay" hidden role="dialog" aria-modal="true" aria-labelledby="dutt-title">
          <section class="sheet">
            <header class="head">
              <h2 id="dutt-title">Παράδοση με DUTT</h2>
              <button class="close" type="button" aria-label="Κλείσιμο">×</button>
            </header>
            <form class="details-step">
              <div class="grid">
                <label class="wide">Ονοματεπώνυμο παραλήπτη<input name="name" autocomplete="name" maxlength="120" required></label>
                <label>Τηλέφωνο<input name="phone" type="tel" autocomplete="tel" maxlength="40" required></label>
                <label>Email<input name="email" type="email" autocomplete="email" maxlength="200"></label>
                <label class="wide">Διεύθυνση<input name="address" autocomplete="street-address" maxlength="240" required></label>
                <label>Πόλη<input name="city" autocomplete="address-level2" maxlength="120" required value="Λάρισα"></label>
                <label>Τ.Κ.<input name="postcode" autocomplete="postal-code" maxlength="20"></label>
                <label class="wide subtotal-field">Αξία παραγγελίας (€)<input name="subtotal" inputmode="decimal" required></label>
                <label class="wide">Σημειώσεις<textarea name="notes" maxlength="500"></textarea></label>
                <label class="wide consent"><input name="privacy" type="checkbox" required><span>Έχω διαβάσει την <a href="https://dutt.gr/privacy.html" target="_blank" rel="noopener">Πολιτική Απορρήτου</a> και συμφωνώ να διαβιβαστούν τα στοιχεία παράδοσης στη DUTT.</span></label>
              </div>
              <p class="notice" role="alert"></p>
              <div class="actions"><button class="primary" type="submit">Υπολογισμός παράδοσης</button></div>
            </form>
            <div class="step quote-step" hidden>
              <div class="quote">
                <div class="quote-row"><span>Χρέωση παράδοσης</span><strong class="charge"></strong></div>
                <div class="quote-row"><span>Εκτίμηση</span><span class="estimate"></span></div>
              </div>
              <p class="muted">Η μεταφορά ξεκινά μόνο όταν το κατάστημα επιβεβαιώσει την πληρωμή και την προετοιμασία της παραγγελίας.</p>
              <p class="notice" role="alert"></p>
              <div class="actions"><button class="secondary back" type="button">Αλλαγή στοιχείων</button><button class="primary submit-draft" type="button">Υποβολή</button></div>
            </div>
            <div class="step success" hidden>
              <div class="success-mark">✓</div>
              <h2>Το αίτημα στάλθηκε</h2>
              <p class="muted">Θα ενεργοποιηθεί μόλις το κατάστημα επιβεβαιώσει ότι η παραγγελία πληρώθηκε και είναι έτοιμη.</p>
              <span class="reference"></span>
              <div class="actions"><button class="primary done" type="button">Κλείσιμο</button></div>
            </div>
          </section>
        </div>`;
    }

    bind() {
      const root = this.shadowRoot;
      root.querySelector(".launch").addEventListener("click", () => this.open());
      root.querySelector(".close").addEventListener("click", () => this.close());
      root.querySelector(".done").addEventListener("click", () => this.close(true));
      root.querySelector(".overlay").addEventListener("click", (event) => {
        if (event.target.classList.contains("overlay")) this.close();
      });
      root.querySelector("form").addEventListener("submit", (event) => this.requestQuote(event));
      root.querySelector(".back").addEventListener("click", () => this.show("details"));
      root.querySelector(".submit-draft").addEventListener("click", () => this.saveDraft());
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") this.close();
      });
      const subtotal = currentSubtotal();
      if (subtotal !== null) {
        root.querySelector('[name="subtotal"]').value = subtotal.toFixed(2);
        root.querySelector(".subtotal-field").hidden = true;
      }
    }

    async loadConfig() {
      try {
        this.config = await api({ action: "config" });
      } catch (error) {
        this.shadowRoot.querySelector(".launch").hidden = true;
        console.error("DUTT Hosted Connector:", error.message);
      }
    }

    open(options = {}) {
      if (options.cartSubtotal !== undefined) {
        suppliedSubtotal = parseMoney(options.cartSubtotal);
      }
      const subtotal = currentSubtotal();
      const field = this.shadowRoot.querySelector('[name="subtotal"]');
      const wrapper = this.shadowRoot.querySelector(".subtotal-field");
      if (subtotal !== null) {
        field.value = subtotal.toFixed(2);
        wrapper.hidden = true;
      } else {
        wrapper.hidden = false;
      }
      this.shadowRoot.querySelector(".overlay").hidden = false;
      this.show("details");
      setTimeout(() => this.shadowRoot.querySelector('[name="name"]').focus(), 0);
    }

    close(reset = false) {
      this.shadowRoot.querySelector(".overlay").hidden = true;
      if (reset) {
        this.quote = null;
        this.shadowRoot.querySelector("form").reset();
        const subtotal = currentSubtotal();
        if (subtotal !== null) this.shadowRoot.querySelector('[name="subtotal"]').value = subtotal.toFixed(2);
        this.show("details");
      }
    }

    show(name) {
      this.shadowRoot.querySelector(".details-step").hidden = name !== "details";
      this.shadowRoot.querySelector(".quote-step").hidden = name !== "quote";
      this.shadowRoot.querySelector(".success").hidden = name !== "success";
      this.shadowRoot.querySelectorAll(".notice").forEach((node) => { node.textContent = ""; });
    }

    setBusy(value) {
      this.busy = value;
      this.shadowRoot.querySelectorAll("button").forEach((button) => { button.disabled = value; });
    }

    async requestQuote(event) {
      event.preventDefault();
      if (this.busy) return;
      const form = new FormData(event.currentTarget);
      const subtotal = parseMoney(form.get("subtotal"));
      if (subtotal === null) {
        this.shadowRoot.querySelector(".details-step .notice").textContent = "Ελέγξτε την αξία της παραγγελίας.";
        return;
      }
      this.setBusy(true);
      try {
        this.quote = await api({
          action: "quote",
          customer_privacy_notice_accepted: form.get("privacy") === "on",
          client_reference: clientReference(),
          cart_subtotal: subtotal,
          customer: {
            name: form.get("name"),
            phone: form.get("phone"),
            email: form.get("email"),
          },
          delivery: {
            name: form.get("name"),
            phone: form.get("phone"),
            email: form.get("email"),
            address: form.get("address"),
            city: form.get("city"),
            postcode: form.get("postcode"),
            notes: form.get("notes"),
          },
        });
        sessionStorage.setItem(sessionKey(this.quote.session_id), this.quote.session_token);
        const charge = Number(this.quote.quote?.customer_charge || 0);
        this.shadowRoot.querySelector(".charge").textContent = `${charge.toFixed(2)} €`;
        this.shadowRoot.querySelector(".estimate").textContent = this.quote.quote?.estimated_time || "-";
        this.show("quote");
        this.dispatchEvent(new CustomEvent("dutt:quote", { bubbles: true, detail: this.quote }));
      } catch (error) {
        this.shadowRoot.querySelector(".details-step .notice").textContent = messageFor(error);
      } finally {
        this.setBusy(false);
      }
    }

    async saveDraft() {
      if (this.busy || !this.quote) return;
      this.setBusy(true);
      try {
        const token = sessionStorage.getItem(sessionKey(this.quote.session_id)) || this.quote.session_token;
        const result = await api({
          action: "save_draft",
          session_id: this.quote.session_id,
        }, token);
        renewClientReference();
        this.shadowRoot.querySelector(".reference").textContent = result.reference || "";
        this.show("success");
        this.dispatchEvent(new CustomEvent("dutt:draft", { bubbles: true, detail: result }));
      } catch (error) {
        this.shadowRoot.querySelector(".quote-step .notice").textContent = messageFor(error);
      } finally {
        this.setBusy(false);
      }
    }
  }

  if (!customElements.get("dutt-hosted-connector")) {
    customElements.define("dutt-hosted-connector", DuttHostedConnector);
  }
  const element = document.createElement("dutt-hosted-connector");
  document.body.appendChild(element);
  globalThis.DUTTHostedConnector = {
    open: (options = {}) => element.open(options),
    setCartSubtotal: (value) => { suppliedSubtotal = parseMoney(value); },
  };
})();
