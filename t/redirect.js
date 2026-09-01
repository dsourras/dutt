"use strict";

(() => {
  const token = window.location.hash.slice(1).trim().toLowerCase();
  if (!/^[a-f0-9]{32,64}$/u.test(token)) {
    document.getElementById("progress").hidden = true;
    document.getElementById("error").style.display = "block";
    return;
  }

  const endpoint = new URL(
    "https://us-central1-sendygo-cd034.cloudfunctions.net/duttMerchantTracking",
  );
  endpoint.searchParams.set("t", token);
  window.location.replace(endpoint.toString());
})();
