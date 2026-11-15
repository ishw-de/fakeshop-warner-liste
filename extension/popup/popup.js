async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function render() {
  const tab = await currentTab();
  const statusEl = document.getElementById("status");
  const metaEl = document.getElementById("meta");

  if (!tab?.url || !/^https?:/.test(tab.url)) {
    statusEl.className = "status unknown";
    statusEl.textContent = "Keine Webseite geöffnet.";
  } else {
    const match = await chrome.runtime.sendMessage({ type: "GET_TAB_MATCH", tabId: tab.id });
    if (match) {
      statusEl.className = "status warn";
      statusEl.innerHTML = `⚠️ <strong>${match.domain}</strong> steht auf einer Fakeshop-Liste (${(match.sources || []).join(", ")}).`;
    } else {
      statusEl.className = "status ok";
      statusEl.textContent = "Diese Seite steht auf keiner der bekannten Fakeshop-Listen.";
    }
  }

  const { listMeta } = await chrome.storage.local.get("listMeta");
  if (listMeta) {
    const updated = listMeta.updatedAt ? new Date(listMeta.updatedAt).toLocaleString("de-DE") : "unbekannt";
    metaEl.textContent = `Liste: ${listMeta.count ?? "?"} Einträge · Quelle: ${listMeta.origin} · aktualisiert ${updated}`;
  }
}

document.getElementById("refresh-btn").addEventListener("click", async () => {
  const btn = document.getElementById("refresh-btn");
  btn.disabled = true;
  btn.textContent = "Aktualisiere…";
  await chrome.runtime.sendMessage({ type: "MANUAL_REFRESH" });
  btn.disabled = false;
  btn.textContent = "Liste jetzt aktualisieren";
  render();
});

document.getElementById("options-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
