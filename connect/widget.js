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
  const renderMode = script.dataset.duttRender === "shipping-method"
    ? "shipping-method"
    : "floating";
  const shippingContainerSelector = String(script.dataset.duttShippingContainer || "").trim();
  const checkoutFormSelector = String(script.dataset.duttCheckoutForm || "").trim();
  const shippingInputName = String(script.dataset.duttShippingInputName || "shipping_method").trim();
  const shippingInputValue = String(script.dataset.duttShippingInputValue || "dutt_hosted").trim();
  const requestTimeoutMs = 90000;
  let suppliedSubtotal = parseMoney(script.dataset.duttCartSubtotal);
  let connectorElement = null;
  let shippingControl = null;

  function parseMoney(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
    }
    const compact = String(value || "").replace(/[^0-9,.-]/g, "").trim();
    if (!compact || compact.startsWith("-") || (compact.match(/-/g) || []).length) return null;
    const comma = compact.lastIndexOf(",");
    const dot = compact.lastIndexOf(".");
    let normalized = compact;
    if (comma >= 0 && dot >= 0) {
      const decimal = comma > dot ? "," : ".";
      const thousands = decimal === "," ? "." : ",";
      const escapedThousands = thousands === "." ? "\\." : thousands;
      const escapedDecimal = decimal === "." ? "\\." : decimal;
      const grouped = new RegExp(`^\\d{1,3}(?:${escapedThousands}\\d{3})*${escapedDecimal}\\d{1,2}$`);
      if (!grouped.test(compact)) return null;
      normalized = compact.replaceAll(thousands, "").replace(decimal, ".");
    } else if (comma >= 0 || dot >= 0) {
      const separator = comma >= 0 ? "," : ".";
      const parts = compact.split(separator);
      if (parts.some((part) => !part)) return null;
      const decimals = parts.at(-1)?.length || 0;
      if (parts.length === 2 && decimals <= 2) {
        normalized = `${parts[0]}.${parts[1]}`;
      } else if (parts.length >= 2 && parts.slice(1).every((part) => part.length === 3)) {
        normalized = parts.join("");
      } else {
        return null;
      }
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
  }

  function requiredNonNegativeNumber(value) {
    if (
      (typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !value.trim())
    ) return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return null;
    const cents = Math.round(amount * 100);
    return Math.abs((amount * 100) - cents) <= 1e-7 ? cents / 100 : null;
  }

  function validQuoteResponse(value) {
    const quote = value?.quote;
    const amounts = [quote?.quote_price, quote?.customer_charge, quote?.store_contribution]
      .map(requiredNonNegativeNumber);
    return (
      /^hs_[A-Za-z0-9_-]+$/.test(String(value?.session_id || "")) &&
      String(value?.session_token || "").startsWith("dutt_session_") &&
      ["quoted", "merchant_review"].includes(String(value?.status || "")) &&
      quote && typeof quote === "object" && !Array.isArray(quote) &&
      String(quote.quote_id || "").trim() !== "" &&
      String(quote.currency || "").toUpperCase() === "EUR" &&
      amounts.every((amount) => amount !== null) &&
      Math.round((amounts[1] + amounts[2]) * 100) === Math.round(amounts[0] * 100)
    );
  }

  function validDraftResponse(value, quoteResponse) {
    const draftCustomerCharge = requiredNonNegativeNumber(value?.quote?.customer_charge);
    const quotedCustomerCharge = requiredNonNegativeNumber(quoteResponse?.quote?.customer_charge);
    return (
      String(value?.session_id || "") === String(quoteResponse?.session_id || "") &&
      ["merchant_review", "confirming", "dispatched"].includes(String(value?.status || "")) &&
      draftCustomerCharge !== null &&
      quotedCustomerCharge !== null &&
      Math.round(draftCustomerCharge * 100) === Math.round(quotedCustomerCharge * 100)
    );
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

  function querySelector(selector) {
    if (!selector) return null;
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  function ensureStyle() {
    if (document.getElementById("dutt-hosted-shipping-method-style")) return;
    const style = document.createElement("style");
    style.id = "dutt-hosted-shipping-method-style";
    style.textContent = `
      .dutt-hosted-shipping-method { display: block; width: 100%; margin: 0; color: inherit; font: inherit; letter-spacing: 0; }
      .dutt-hosted-shipping-method[hidden] { display: none !important; }
      .dutt-hosted-shipping-method__label { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 12px; width: 100%; min-height: 64px; margin: 0; padding: 12px 14px; border: 1px solid #d7d7d7; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; box-sizing: border-box; }
      .dutt-hosted-shipping-method__label:hover { border-color: #949494; }
      .dutt-hosted-shipping-method[data-selected="true"] .dutt-hosted-shipping-method__label { border-color: #171717; box-shadow: 0 0 0 1px #171717; }
      .dutt-hosted-shipping-method[data-state="ready"] .dutt-hosted-shipping-method__label { border-color: #207a45; }
      .dutt-hosted-shipping-method__radio { width: 19px; height: 19px; margin: 0; accent-color: #171717; cursor: pointer; }
      .dutt-hosted-shipping-method__copy { display: grid; min-width: 0; gap: 3px; }
      .dutt-hosted-shipping-method__title { font-size: 15px; font-weight: 750; line-height: 1.25; }
      .dutt-hosted-shipping-method__status { color: #666; font-size: 12px; line-height: 1.35; }
      .dutt-hosted-shipping-method__price { white-space: nowrap; font-size: 14px; font-weight: 750; }
      @media (max-width: 520px) {
        .dutt-hosted-shipping-method__label { grid-template-columns: 22px minmax(0, 1fr); }
        .dutt-hosted-shipping-method__price { grid-column: 2; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function mountShippingMethod() {
    ensureStyle();
    const mount = document.createElement("div");
    mount.className = "dutt-hosted-shipping-method";
    mount.dataset.state = "idle";
    mount.dataset.selected = "false";

    const label = document.createElement("label");
    label.className = "dutt-hosted-shipping-method__label";

    const radio = document.createElement("input");
    radio.className = "dutt-hosted-shipping-method__radio";
    radio.type = "radio";
    radio.name = shippingInputName || "shipping_method";
    radio.value = shippingInputValue || "dutt_hosted";
    radio.required = true;

    const copy = document.createElement("span");
    copy.className = "dutt-hosted-shipping-method__copy";
    const title = document.createElement("span");
    title.className = "dutt-hosted-shipping-method__title";
    title.textContent = "DUTT Same Hour Delivery";
    const status = document.createElement("span");
    status.className = "dutt-hosted-shipping-method__status";
    status.textContent = "Υπολογισμός τιμής με τη διεύθυνση παράδοσης";
    copy.append(title, status);

    const price = document.createElement("span");
    price.className = "dutt-hosted-shipping-method__price";
    label.append(radio, copy, price);
    mount.appendChild(label);

    const configuredTarget = querySelector(shippingContainerSelector);
    if (configuredTarget) {
      configuredTarget.appendChild(mount);
    } else if (script.parentNode && script.parentNode !== document.head) {
      script.parentNode.insertBefore(mount, script);
    } else {
      (document.body || document.documentElement).appendChild(mount);
    }

    const configuredForm = querySelector(checkoutFormSelector);
    const checkoutForm = configuredForm instanceof HTMLFormElement
      ? configuredForm
      : mount.closest("form");
    const hiddenFields = {};
    let draft = null;
    let quote = null;
    let restoringFallback = false;
    let abandonmentPending = false;
    let abandonmentFailed = false;
    let fallbackRadio = Array.from(document.getElementsByName(radio.name)).find(
      (input) => input instanceof HTMLInputElement && input !== radio && input.type === "radio" && input.checked,
    ) || null;

    function hiddenField(name) {
      if (!checkoutForm) return null;
      if (!hiddenFields[name]) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.disabled = true;
        checkoutForm.appendChild(input);
        hiddenFields[name] = input;
      }
      return hiddenFields[name];
    }

    function syncFields() {
      const selected = radio.checked;
      const values = {
        dutt_hosted_session_id: draft?.session_id || "",
        dutt_hosted_reference: draft?.reference || "",
        dutt_hosted_customer_charge: quote?.quote?.customer_charge ?? "",
      };
      Object.entries(values).forEach(([name, value]) => {
        const input = hiddenField(name);
        if (!input) return;
        input.value = String(value);
        input.disabled = !selected || !draft;
      });
    }

    function emit(name, detail = {}) {
      connectorElement?.dispatchEvent(new CustomEvent(name, {
        bubbles: true,
        detail: { installation_id: installationId, ...detail },
      }));
    }

    function syncSelected() {
      mount.dataset.selected = radio.checked ? "true" : "false";
      syncFields();
    }

    function restoreFallback() {
      radio.checked = false;
      if (fallbackRadio?.isConnected && !fallbackRadio.disabled) {
        fallbackRadio.checked = true;
        restoringFallback = true;
        fallbackRadio.dispatchEvent(new Event("change", { bubbles: true }));
        restoringFallback = false;
      }
      syncSelected();
    }

    function startAbandonment(staleQuote) {
      if (!staleQuote?.session_id || !connectorElement) return;
      abandonmentPending = true;
      abandonmentFailed = false;
      connectorElement.abandonStaleQuote().then(() => {
        abandonmentPending = false;
        abandonmentFailed = false;
      }).catch((error) => {
        abandonmentPending = false;
        abandonmentFailed = true;
        mount.dataset.state = "attention";
        status.textContent = "Η προηγούμενη επιλογή DUTT δεν ακυρώθηκε. Δοκιμάστε ξανά.";
        console.error("DUTT Hosted Connector:", error.message);
      });
    }

    radio.addEventListener("change", () => {
      syncSelected();
      if (!radio.checked) return;
      emit("dutt:shipping-selected", { status: draft ? "ready" : "details_required" });
      if (!draft) connectorElement?.open();
    });
    radio.addEventListener("click", () => {
      if (radio.checked && !draft && connectorElement) connectorElement.open();
    });
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        target !== radio &&
        target.type === "radio" &&
        target.name === radio.name &&
        target.checked
      ) {
        fallbackRadio = target;
        syncSelected();
        if (!restoringFallback) {
          const staleQuote = quote;
          quote = null;
          draft = null;
          mount.dataset.state = "idle";
          price.textContent = "";
          status.textContent = "Υπολογισμός τιμής με τη διεύθυνση παράδοσης";
          syncFields();
          if (staleQuote?.session_id && connectorElement) {
            connectorElement.cartSubtotalChanged(currentSubtotal(), staleQuote);
            startAbandonment(staleQuote);
          }
          emit("dutt:shipping-cleared", { reason: "another_method_selected" });
        }
      }
    });

    if (checkoutForm) {
      checkoutForm.addEventListener("submit", (event) => {
        if (abandonmentPending || abandonmentFailed) {
          event.preventDefault();
          event.stopImmediatePropagation();
          mount.dataset.state = "attention";
          status.textContent = abandonmentPending
            ? "Περιμένετε να ολοκληρωθεί η αλλαγή τρόπου αποστολής"
            : "Η προηγούμενη επιλογή DUTT δεν ακυρώθηκε. Δοκιμάστε ξανά.";
          emit("dutt:checkout-blocked", {
            reason: abandonmentPending
              ? "hosted_abandonment_in_progress"
              : "hosted_abandonment_failed",
          });
          return;
        }
        if (!radio.checked || draft) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        mount.dataset.state = "attention";
        status.textContent = "Ολοκληρώστε πρώτα τα στοιχεία παράδοσης";
        emit("dutt:checkout-blocked", { reason: "hosted_draft_required" });
        connectorElement?.open();
      }, true);
    }

    return {
      element: mount,
      radio,
      hasDraft: () => Boolean(draft),
      setUnavailable() {
        mount.hidden = true;
        radio.disabled = true;
        restoreFallback();
      },
      setQuote(value) {
        abandonmentPending = false;
        abandonmentFailed = false;
        quote = value;
        draft = null;
        mount.dataset.state = "quoted";
        const charge = Number(value?.quote?.customer_charge || 0);
        price.textContent = `${charge.toFixed(2)} €`;
        status.textContent = value?.quote?.estimated_time || "Η προσφορά υπολογίστηκε";
        syncFields();
      },
      setDraft(value) {
        abandonmentPending = false;
        abandonmentFailed = false;
        draft = value;
        mount.dataset.state = "ready";
        status.textContent = `Έτοιμη για checkout${value?.reference ? ` · ${value.reference}` : ""}`;
        syncFields();
      },
      cancelPending() {
        if (draft || !radio.checked) return;
        quote = null;
        mount.dataset.state = "idle";
        price.textContent = "";
        status.textContent = "Υπολογισμός τιμής με τη διεύθυνση παράδοσης";
        restoreFallback();
        emit("dutt:shipping-cleared", { reason: "details_cancelled" });
      },
      beginEdit() {
        const staleQuote = quote;
        quote = null;
        draft = null;
        mount.dataset.state = "idle";
        price.textContent = "";
        status.textContent = "Ενημερώστε τα στοιχεία και ζητήστε νέα τιμή";
        syncFields();
        return staleQuote;
      },
      startAbandonment,
      abandonmentResolved() {
        abandonmentPending = false;
        abandonmentFailed = false;
      },
      resetForCartChange() {
        if (!quote && !draft) return null;
        const staleQuote = quote;
        quote = null;
        draft = null;
        mount.dataset.state = "idle";
        price.textContent = "";
        status.textContent = "Το καλάθι άλλαξε · ζητήστε νέα τιμή";
        restoreFallback();
        emit("dutt:shipping-cleared", { reason: "cart_changed" });
        return staleQuote;
      },
    };
  }

  async function api(body, sessionToken = "", retry = 0) {
    const headers = { "Content-Type": "application/json" };
    if (sessionToken) headers["X-DUTT-Session-Token"] = sessionToken;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        headers,
        body: JSON.stringify({ ...body, installation_id: installationId }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("hosted_request_timeout");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const payload = await response.json().catch(() => null);
    const validPayload = payload && typeof payload === "object" && !Array.isArray(payload);
    if (
      !response.ok &&
      validPayload &&
      payload.reason === "hosted_quote_in_progress" &&
      body.action === "quote" &&
      retry < 6
    ) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      return api(body, sessionToken, retry + 1);
    }
    if (!response.ok || !validPayload || payload.success !== true) {
      const reason = validPayload
        ? payload.reason || (response.ok ? "hosted_invalid_response" : "hosted_request_failed")
        : response.ok ? "hosted_invalid_response" : "hosted_request_failed";
      const error = new Error(reason);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function messageFor(error) {
    const reason = String(error?.message || "");
    const messages = {
      hosted_request_timeout: "Η σύνδεση καθυστέρησε. Ελέγξτε το δίκτυο και δοκιμάστε ξανά.",
      hosted_invalid_response: "Η DUTT επέστρεψε μη έγκυρη απάντηση. Δοκιμάστε ξανά.",
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
      this.staleQuote = null;
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
        <button class="launch" type="button"${renderMode === "shipping-method" ? " hidden" : ""}>Παράδοση με DUTT</button>
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
      root.querySelector(".back").addEventListener("click", () => {
        const staleQuote = shippingControl?.beginEdit() || this.quote;
        this.cartSubtotalChanged(currentSubtotal(), staleQuote);
        if (staleQuote?.session_id) {
          if (shippingControl) shippingControl.startAbandonment(staleQuote);
          else this.abandonStaleQuote().catch((error) => {
            this.shadowRoot.querySelector(".details-step .notice").textContent = messageFor(error);
          });
        }
      });
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
        if (
          this.config.installation_id !== installationId ||
          this.config.currency !== "EUR" ||
          !this.config.location ||
          typeof this.config.location !== "object"
        ) throw new Error("hosted_invalid_response");
      } catch (error) {
        this.shadowRoot.querySelector(".launch").hidden = true;
        shippingControl?.setUnavailable();
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
      if (renderMode === "shipping-method" && !shippingControl?.hasDraft()) {
        shippingControl?.cancelPending();
      }
      if (reset && renderMode !== "shipping-method") {
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

    cartSubtotalChanged(subtotal, staleQuote) {
      const previousQuote = staleQuote?.session_id ? staleQuote : this.quote;
      if (previousQuote?.session_id) this.staleQuote = previousQuote;
      this.quote = null;
      const field = this.shadowRoot.querySelector('[name="subtotal"]');
      const wrapper = this.shadowRoot.querySelector(".subtotal-field");
      if (subtotal !== null) {
        field.value = subtotal.toFixed(2);
        wrapper.hidden = true;
      } else {
        field.value = "";
        wrapper.hidden = false;
      }
      this.show("details");
    }

    async abandonStaleQuote() {
      if (!this.staleQuote?.session_id) return;
      const sessionId = this.staleQuote.session_id;
      const token = sessionStorage.getItem(sessionKey(sessionId)) || this.staleQuote.session_token;
      if (!token) throw new Error("hosted_session_token_required");
      try {
        await api({ action: "abandon_draft", session_id: sessionId }, token);
      } catch (error) {
        if (!["hosted_session_expired", "hosted_session_not_found"].includes(error?.message)) {
          throw error;
        }
      }
      sessionStorage.removeItem(sessionKey(sessionId));
      if (this.staleQuote?.session_id === sessionId) this.staleQuote = null;
      shippingControl?.abandonmentResolved();
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
        await this.abandonStaleQuote();
        const quote = await api({
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
        if (!validQuoteResponse(quote)) throw new Error("hosted_invalid_response");
        this.quote = quote;
        sessionStorage.setItem(sessionKey(this.quote.session_id), this.quote.session_token);
        const charge = Number(this.quote.quote?.customer_charge || 0);
        this.shadowRoot.querySelector(".charge").textContent = `${charge.toFixed(2)} €`;
        this.shadowRoot.querySelector(".estimate").textContent = this.quote.quote?.estimated_time || "-";
        shippingControl?.setQuote(this.quote);
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
        if (!validDraftResponse(result, this.quote)) throw new Error("hosted_invalid_response");
        renewClientReference();
        this.shadowRoot.querySelector(".reference").textContent = result.reference || "";
        shippingControl?.setDraft(result);
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
  connectorElement = element;
  if (renderMode === "shipping-method") shippingControl = mountShippingMethod();
  (document.body || document.documentElement).appendChild(element);

  function applyCartSubtotal(value) {
    const nextSubtotal = parseMoney(value);
    const staleQuote = shippingControl?.resetForCartChange() || null;
    connectorElement?.cartSubtotalChanged(nextSubtotal, staleQuote);
    if (staleQuote?.session_id) shippingControl?.startAbandonment(staleQuote);
    return nextSubtotal;
  }

  if (subtotalSelector && suppliedSubtotal === null && globalThis.MutationObserver) {
    let lastSubtotal = currentSubtotal();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        const nextSubtotal = currentSubtotal();
        if (nextSubtotal === lastSubtotal) return;
        lastSubtotal = nextSubtotal;
        applyCartSubtotal(nextSubtotal);
      }, 0);
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  globalThis.DUTTHostedConnector = {
    open: (options = {}) => element.open(options),
    setCartSubtotal: (value) => {
      const previousSubtotal = currentSubtotal();
      const nextSubtotal = parseMoney(value);
      suppliedSubtotal = nextSubtotal;
      if (nextSubtotal !== previousSubtotal) applyCartSubtotal(nextSubtotal);
    },
  };
})();
