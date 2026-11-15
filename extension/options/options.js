async function load() {
  const { remoteListUrl, listMeta } = await chrome.storage.local.get(["remoteListUrl", "listMeta"]);
  document.getElementById("remote-url").value = remoteListUrl || "";

  const info = document.getElementById("list-info");
  if (listMeta) {
    const updated = listMeta.updatedAt ? new Date(listMeta.updatedAt).toLocaleString("de-DE") : "unbekannt";
    info.innerHTML = `
      <strong>Aktuelle Liste:</strong><br>
      ${listMeta.count ?? "?"} Einträge<br>
      Quelle: ${listMeta.origin === "remote" ? "gehostete URL" : "mitgelieferte Datei im Paket"}<br>
      Zuletzt aktualisiert: ${updated}
    `;
  } else {
    info.textContent = "Noch keine Liste geladen.";
  }
}

document.getElementById("save-btn").addEventListener("click", async () => {
  const url = document.getElementById("remote-url").value.trim();
  await chrome.storage.local.set({ remoteListUrl: url });
  await chrome.runtime.sendMessage({ type: "MANUAL_REFRESH" });
  const status = document.getElementById("save-status");
  status.textContent = "Gespeichert und Liste aktualisiert.";
  setTimeout(() => (status.textContent = ""), 3000);
  load();
});

load();
