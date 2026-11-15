// Fakeshop-Warner: Service Worker
//
// Haelt eine Liste bekannter Fakeshop-Domains im chrome.storage.local vor,
// aktualisiert sie periodisch von einer konfigurierbaren URL (Fallback: im
// Paket mitgelieferte data/fakeshops.json) und prueft bei jeder Navigation,
// ob die aufgerufene Seite auf der Liste steht.

const ALARM_NAME = "fakeshop-list-refresh";
const REFRESH_INTERVAL_MINUTES = 12 * 60; // zweimal taeglich
const BUNDLED_LIST_URL = chrome.runtime.getURL("data/fakeshops.json");
const DEFAULT_REMOTE_URL = ""; // vom Nutzer in den Optionen zu setzen, sobald eine Liste gehostet wird

function normalizeHost(hostname) {
  return (hostname || "").toLowerCase().replace(/^www\./, "");
}

async function getSettings() {
  const { remoteListUrl } = await chrome.storage.local.get("remoteListUrl");
  return { remoteListUrl: remoteListUrl || DEFAULT_REMOTE_URL };
}

async function loadBundledList() {
  const res = await fetch(BUNDLED_LIST_URL);
  return res.json();
}

async function fetchRemoteList(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function toDomainMap(listJson) {
  const map = {};
  for (const shop of listJson.shops || []) {
    map[normalizeHost(shop.domain)] = {
      sources: shop.sources,
      listedSince: shop.listedSince,
      note: shop.note,
    };
  }
  return map;
}

async function refreshList() {
  const { remoteListUrl } = await getSettings();
  let listJson;
  let origin = "bundled";

  if (remoteListUrl) {
    try {
      listJson = await fetchRemoteList(remoteListUrl);
      origin = "remote";
    } catch (err) {
      console.warn("Fakeshop-Warner: Remote-Liste konnte nicht geladen werden, nutze Bundled-Fallback.", err);
    }
  }

  if (!listJson) {
    listJson = await loadBundledList();
  }

  const domainMap = toDomainMap(listJson);
  await chrome.storage.local.set({
    domainMap,
    listMeta: {
      origin,
      generatedAt: listJson.generatedAt,
      count: listJson.count ?? Object.keys(domainMap).length,
      updatedAt: new Date().toISOString(),
    },
  });

  console.log(`Fakeshop-Warner: Liste aktualisiert (${origin}), ${Object.keys(domainMap).length} Domains.`);
}

async function checkUrlAgainstList(hostname) {
  const { domainMap } = await chrome.storage.local.get("domainMap");
  if (!domainMap) return null;
  const host = normalizeHost(hostname);
  return domainMap[host] ? { domain: host, ...domainMap[host] } : null;
}

async function handleNavigation(tabId, url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return;
  }
  if (!hostname) return;

  const match = await checkUrlAgainstList(hostname);

  if (match) {
    await chrome.storage.local.set({ [`tabMatch:${tabId}`]: match });
    chrome.action.setBadgeText({ tabId, text: "!" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#d93025" });
    chrome.action.setTitle({ tabId, title: `Warnung: ${hostname} steht auf einer Fakeshop-Liste!` });

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/banner.js"],
      });
      await chrome.tabs.sendMessage(tabId, { type: "FAKESHOP_WARNING", match });
    } catch (err) {
      console.warn("Fakeshop-Warner: Banner konnte nicht injiziert werden.", err);
    }
  } else {
    await chrome.storage.local.remove(`tabMatch:${tabId}`);
    chrome.action.setBadgeText({ tabId, text: "" });
    chrome.action.setTitle({ tabId, title: "Fakeshop-Warner" });
  }
}

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return; // nur Top-Level-Navigation
  handleNavigation(details.tabId, details.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`tabMatch:${tabId}`);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: 1, periodInMinutes: REFRESH_INTERVAL_MINUTES });
  refreshList();
});

chrome.runtime.onStartup.addListener(() => {
  refreshList();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) refreshList();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "MANUAL_REFRESH") {
    refreshList().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "GET_TAB_MATCH") {
    chrome.storage.local.get(`tabMatch:${message.tabId}`).then((data) => {
      sendResponse(data[`tabMatch:${message.tabId}`] || null);
    });
    return true;
  }
});
