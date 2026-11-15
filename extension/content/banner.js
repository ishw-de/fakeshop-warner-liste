// Wird per chrome.scripting.executeScript injiziert, sobald eine Uebereinstimmung
// mit der Fakeshop-Liste gefunden wurde. Zeigt einen Hinweis-Banner oben auf der Seite.

(function () {
  function renderBanner(match) {
    if (document.getElementById("fakeshop-warner-banner")) return;

    if (!document.getElementById("fakeshop-warner-banner-css")) {
      const link = document.createElement("link");
      link.id = "fakeshop-warner-banner-css";
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("content/banner.css");
      document.documentElement.appendChild(link);
    }

    const banner = document.createElement("div");
    banner.id = "fakeshop-warner-banner";

    const sourcesLabel = {
      "watchlist-internet.at": "Watchlist Internet",
      "trustedshops.de": "Trusted Shops",
      "verbraucherzentrale.de": "Verbraucherzentrale",
    };
    const sourcesText = (match.sources || [])
      .map((s) => sourcesLabel[s] || s)
      .join(", ");

    banner.innerHTML = `
      <div class="fw-text">
        <div><strong>⚠️ Achtung:</strong> ${match.domain} steht auf einer Fakeshop-Warnliste.</div>
        <div class="fw-sources">Quelle(n): ${sourcesText}${match.listedSince ? " · gelistet seit " + match.listedSince : ""}</div>
      </div>
      <button type="button" id="fakeshop-warner-dismiss">Ausblenden</button>
    `;

    document.documentElement.appendChild(banner);
    document.getElementById("fakeshop-warner-dismiss").addEventListener("click", () => {
      banner.remove();
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "FAKESHOP_WARNING" && message.match) {
      renderBanner(message.match);
    }
  });
})();
