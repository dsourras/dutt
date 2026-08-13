(function () {
  "use strict";

  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  const query = new URLSearchParams(location.search);
  const endpoint = isLocal && query.get("api")
    ? query.get("api")
    : "https://us-central1-sendygo-cd034.cloudfunctions.net/duttHostedConnectorManage";
  const elements = {
    access: document.querySelector("#access"),
    accessForm: document.querySelector("#access-form"),
    installation: document.querySelector("#installation"),
    token: document.querySelector("#token"),
    accessError: document.querySelector("#access .error"),
    orders: document.querySelector("#orders"),
    list: document.querySelector("#list"),
    status: document.querySelector("#status"),
    storeName: document.querySelector("#store-name"),
    refresh: document.querySelector("#refresh"),
    disconnect: document.querySelector("#disconnect"),
    dialog: document.querySelector("#confirm-dialog"),
    confirmForm: document.querySelector("#confirm-form"),
    confirmReference: document.querySelector("#confirm-reference"),
    confirmTotalHint: document.querySelector("#confirm-total-hint"),
    externalOrderId: document.querySelector("#external-order-id"),
    orderTotal: document.querySelector("#order-total"),
    paidReady: document.querySelector("#paid-ready"),
    confirmError: document.querySelector("#confirm-error"),
    confirmSubmit: document.querySelector("#confirm-submit"),
    cancelDialog: document.querySelector("#cancel-dialog"),
    cancelForm: document.querySelector("#cancel-form"),
    cancelReference: document.querySelector("#cancel-reference"),
    cancelReason: document.querySelector("#cancel-reason"),
    cancelConfirmed: document.querySelector("#cancel-confirmed"),
    cancelError: document.querySelector("#cancel-error"),
    cancelSubmit: document.querySelector("#cancel-submit"),
  };
  let installationId = "";
  let managementToken = "";
  let sessions = [];
  let filter = "pending";
  let selected = null;
  let selectedCancellation = null;
  let loading = false;

  function safeInstallation(value) {
    const result = String(value || "").trim();
    return /^dutt_inst_[A-Za-z0-9_-]+$/.test(result) ? result : "";
  }

  function credentialsFromFragment() {
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ""));
    const id = safeInstallation(fragment.get("installation"));
    const token = String(fragment.get("token") || "").trim();
    if (location.hash) history.replaceState(null, "", `${location.pathname}${location.search}`);
    if (id && token.startsWith("dutt_manage_")) {
      sessionStorage.setItem("dutt-hosted-installation", id);
      sessionStorage.setItem(`dutt-hosted-management:${id}`, token);
      return { id, token };
    }
    const storedId = safeInstallation(sessionStorage.getItem("dutt-hosted-installation"));
    return {
      id: storedId,
      token: storedId ? String(sessionStorage.getItem(`dutt-hosted-management:${storedId}`) || "") : "",
    };
  }

  function setCredentials(id, token) {
    installationId = safeInstallation(id);
    managementToken = String(token || "").trim();
    if (installationId && managementToken) {
      sessionStorage.setItem("dutt-hosted-installation", installationId);
      sessionStorage.setItem(`dutt-hosted-management:${installationId}`, managementToken);
    }
  }

  async function api(body) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DUTT-Management-Token": managementToken,
      },
      body: JSON.stringify({ ...body, installation_id: installationId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      const error = new Error(payload.reason || "hosted_management_failed");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function expectedCheckoutTotal(item) {
    const subtotalCents = Math.round(Number(item?.cartSubtotal || 0) * 100);
    const customerChargeCents = Math.round(Number(item?.customerCharge || 0) * 100);
    return (subtotalCents + customerChargeCents) / 100;
  }

  function formatDate(value) {
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function statusLabel(status) {
    return {
      merchant_review: "Σε αναμονή",
      confirmation_failed: "Χρειάζεται επανάληψη",
      confirming: "Αποστολή",
      dispatched: "Απεστάλη",
      cancelling: "Ακύρωση σε εξέλιξη",
      cancellation_failed: "Επανάληψη ακύρωσης",
      cancelled: "Ακυρώθηκε",
    }[status] || status;
  }

  function visibleSessions() {
    if (filter === "pending") return sessions.filter((item) => ["merchant_review", "confirmation_failed", "confirming", "cancelling", "cancellation_failed"].includes(item.status));
    if (filter === "completed") return sessions.filter((item) => ["dispatched", "cancelled"].includes(item.status));
    return sessions;
  }

  function addText(parent, tag, text, className = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }

  function render() {
    elements.list.replaceChildren();
    const rows = visibleSessions();
    if (!rows.length) {
      addText(elements.list, "p", "Δεν υπάρχουν παραγγελίες σε αυτή την κατάσταση.", "empty");
      return;
    }
    for (const item of rows) {
      const article = document.createElement("article");
      article.className = "order";
      const customer = document.createElement("div");
      addText(customer, "h2", item.recipientName || "Παραλήπτης");
      addText(customer, "p", `${item.deliveryAddress || ""}, ${item.deliveryCity || ""}`);
      addText(customer, "p", item.recipientPhone || "");
      article.appendChild(customer);

      const meta = document.createElement("div");
      meta.className = "meta";
      addText(meta, "span", `Σύνολο checkout ${formatMoney(expectedCheckoutTotal(item))}`, "amount");
      addText(meta, "span", `Προϊόντα ${formatMoney(item.cartSubtotal)} + DUTT ${formatMoney(item.customerCharge)}`, "breakdown");
      addText(meta, "span", item.reference || "", "reference");
      addText(meta, "span", statusLabel(item.status), `badge${item.status === "dispatched" ? " ready" : ""}`);
      addText(meta, "span", formatDate(item.createdAt));
      article.appendChild(meta);

      if (["merchant_review", "confirmation_failed"].includes(item.status)) {
        const action = document.createElement("button");
        action.type = "button";
        action.className = "primary";
        action.textContent = item.status === "confirmation_failed" ? "Επανάληψη" : "Επιβεβαίωση";
        action.addEventListener("click", () => openConfirmation(item));
        article.appendChild(action);
      } else {
        const actions = document.createElement("div");
        actions.className = "order-actions";
        addText(actions, "span", item.deliveryId ? `Delivery ${item.deliveryId}` : statusLabel(item.status));
        if (["dispatched", "cancellation_failed"].includes(item.status)) {
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.className = "secondary";
          cancel.textContent = item.status === "cancellation_failed" ? "Επανάληψη ακύρωσης" : "Ακύρωση";
          cancel.addEventListener("click", () => openCancellation(item));
          actions.appendChild(cancel);
        }
        article.appendChild(actions);
      }
      elements.list.appendChild(article);
    }
  }

  async function load() {
    if (loading || !installationId || !managementToken) return;
    loading = true;
    elements.refresh.disabled = true;
    elements.status.textContent = "Ανανέωση...";
    try {
      const result = await api({ action: "list" });
      sessions = Array.isArray(result.sessions) ? result.sessions : [];
      elements.storeName.textContent = result.display_name || "Παραγγελίες";
      elements.access.hidden = true;
      elements.orders.hidden = false;
      elements.status.textContent = `Τελευταία ενημέρωση ${new Intl.DateTimeFormat("el-GR", { timeStyle: "short" }).format(new Date())}`;
      render();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        disconnect();
        elements.accessError.textContent = "Η σύνδεση έληξε ή ανακλήθηκε.";
      } else {
        elements.status.textContent = "Δεν ήταν δυνατή η ανανέωση. Δοκιμάστε ξανά.";
      }
    } finally {
      loading = false;
      elements.refresh.disabled = false;
    }
  }

  function openConfirmation(item) {
    selected = item;
    elements.confirmReference.textContent = item.reference || "";
    const expectedTotal = expectedCheckoutTotal(item);
    elements.confirmTotalHint.textContent = `Αναμενόμενο σύνολο: ${formatMoney(expectedTotal)} (${formatMoney(item.cartSubtotal)} προϊόντα + ${formatMoney(item.customerCharge)} μεταφορικά DUTT)`;
    elements.externalOrderId.value = item.externalOrderId || "";
    elements.orderTotal.value = "";
    elements.orderTotal.placeholder = expectedTotal.toFixed(2).replace(".", ",");
    elements.paidReady.checked = false;
    elements.confirmError.textContent = "";
    elements.dialog.showModal();
    elements.externalOrderId.focus();
  }

  async function confirm(event) {
    const submitter = event.submitter;
    if (!submitter || submitter.value === "cancel") return;
    event.preventDefault();
    if (!selected || !elements.confirmForm.reportValidity()) return;
    elements.confirmSubmit.disabled = true;
    elements.confirmError.textContent = "";
    try {
      await api({
        action: "confirm_paid_ready",
        session_id: selected.sessionId,
        external_order_id: elements.externalOrderId.value.trim(),
        order_total: elements.orderTotal.value.replace(",", "."),
        payment_confirmed: true,
        confirmation: "PAID_AND_READY",
      });
      elements.dialog.close();
      selected = null;
      await load();
    } catch (error) {
      const messages = {
        hosted_order_total_mismatch: "Η αξία δεν συμφωνεί με το αίτημα του πελάτη. Ελέγξτε την παραγγελία πριν συνεχίσετε.",
        hosted_external_order_already_claimed: "Αυτός ο αριθμός παραγγελίας έχει ήδη χρησιμοποιηθεί.",
        hosted_confirmation_in_progress: "Η αποστολή βρίσκεται ήδη σε εξέλιξη. Περιμένετε λίγο και ανανεώστε.",
        hosted_session_expired: "Το αίτημα έχει λήξει.",
      };
      elements.confirmError.textContent = messages[error.message] || "Η επιβεβαίωση δεν ολοκληρώθηκε. Μπορείτε να δοκιμάσετε ξανά.";
    } finally {
      elements.confirmSubmit.disabled = false;
    }
  }

  function openCancellation(item) {
    selectedCancellation = item;
    elements.cancelReference.textContent = item.reference || "";
    elements.cancelReason.value = item.cancellationReason || "";
    elements.cancelConfirmed.checked = false;
    elements.cancelError.textContent = "";
    elements.cancelDialog.showModal();
    elements.cancelReason.focus();
  }

  async function cancelDelivery(event) {
    const submitter = event.submitter;
    if (!submitter || submitter.value === "cancel") return;
    event.preventDefault();
    if (!selectedCancellation || !elements.cancelForm.reportValidity()) return;
    elements.cancelSubmit.disabled = true;
    elements.cancelError.textContent = "";
    try {
      await api({
        action: "cancel_delivery",
        session_id: selectedCancellation.sessionId,
        reason: elements.cancelReason.value.trim(),
        confirmation: "CANCEL_DELIVERY",
      });
      elements.cancelDialog.close();
      selectedCancellation = null;
      await load();
    } catch (error) {
      const messages = {
        hosted_cancellation_in_progress: "Η ακύρωση βρίσκεται ήδη σε εξέλιξη. Περιμένετε λίγο και ανανεώστε.",
        cannot_cancel_terminal_status: "Η μεταφορά έχει ήδη ολοκληρωθεί και δεν μπορεί να ακυρωθεί.",
      };
      elements.cancelError.textContent = messages[error.message] || "Η ακύρωση δεν ολοκληρώθηκε. Ελέγξτε την κατάσταση και δοκιμάστε ξανά.";
    } finally {
      elements.cancelSubmit.disabled = false;
    }
  }

  function disconnect() {
    if (installationId) sessionStorage.removeItem(`dutt-hosted-management:${installationId}`);
    sessionStorage.removeItem("dutt-hosted-installation");
    installationId = "";
    managementToken = "";
    sessions = [];
    elements.orders.hidden = true;
    elements.access.hidden = false;
    elements.list.replaceChildren();
  }

  elements.accessForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const id = safeInstallation(elements.installation.value);
    const token = elements.token.value.trim();
    if (!id || !token.startsWith("dutt_manage_")) {
      elements.accessError.textContent = "Ελέγξτε τα στοιχεία σύνδεσης.";
      return;
    }
    elements.accessError.textContent = "";
    setCredentials(id, token);
    load();
  });
  elements.refresh.addEventListener("click", load);
  elements.disconnect.addEventListener("click", disconnect);
  elements.confirmForm.addEventListener("submit", confirm);
  elements.cancelForm.addEventListener("submit", cancelDelivery);
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
    filter = tab.dataset.filter;
    render();
  }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden && !elements.orders.hidden) load(); }, 30000);

  const credentials = credentialsFromFragment();
  setCredentials(credentials.id, credentials.token);
  if (installationId && managementToken) load();
  else elements.access.hidden = false;
})();
