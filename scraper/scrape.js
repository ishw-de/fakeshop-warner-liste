#!/usr/bin/env node
/**
 * Scrapt bekannte Fakeshop-Listen und erzeugt data/fakeshops.json
 * fuer die Browser-Extension.
 *
 * Quellen:
 *  - Watchlist Internet (AT):  https://www.watchlist-internet.at/liste-betruegerischer-shops/
 *  - Trusted Shops (DE):       https://www.trustedshops.de/fake-shops/
 *  - Verbraucherzentrale (DE): https://warnung.fakeshop-finder.de/
 *
 * Nutzung:
 *   node scrape.js [--max-pages=100] [--delay=400] [--out=../data/fakeshops.json]
 */

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const USER_AGENT = "FakeShopChecker/1.0 (+Browser-Extension Scraper)";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const MAX_PAGES = args["max-pages"] === "all" ? Infinity : Number(args["max-pages"] ?? 100);
const DELAY_MS = Number(args["delay"] ?? 400);
const OUT_PATH = path.resolve(__dirname, args["out"] ?? "../data/fakeshops.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fuer ${url}`);
  return res.text();
}

function normalizeDomain(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function parseGermanDate(str) {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(str || "");
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

// --- Watchlist Internet (AT) --------------------------------------------
//
// HINWEIS: watchlist-internet.at blockt automatisierte HTTP-Clients (Cloudflare
// Bot-Schutz antwortet mit 403 auf Node/undici-Requests). Diese Funktion bleibt
// im Code, wird aber in main() aktuell NICHT aufgerufen, da ein Umgehen dieser
// Bot-Erkennung (z.B. durch einen anderen Client/Fingerprint) nicht gemacht wird.
// Falls die Seite spaeter eine offizielle API/Feed anbietet, hier einhaengen.

async function scrapeWatchlistInternet() {
  const shops = [];
  const base = "https://www.watchlist-internet.at/liste-betruegerischer-shops/";
  let page = 1;

  while (page <= MAX_PAGES) {
    const url = page === 1 ? base : `${base}?tx_solr%5Bpage%5D=${page}`;
    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.warn(`[watchlist-internet] Abbruch bei Seite ${page}: ${err.message}`);
      break;
    }

    const $ = cheerio.load(html);
    const items = $(".site-item");
    if (items.length === 0) break;

    items.each((_, el) => {
      const domain = normalizeDomain($(el).find(".site-item__link").first().text());
      const dateText = $(el).find(".site-item__listed-date").first().text();
      if (domain) {
        shops.push({
          domain,
          source: "watchlist-internet.at",
          listedSince: parseGermanDate(dateText),
        });
      }
    });

    console.log(`[watchlist-internet] Seite ${page}: ${items.length} Eintraege (gesamt ${shops.length})`);

    // Keine naechste Seite mehr vorhanden?
    const hasNext = $(`a.page-link[href*="tx_solr%5Bpage%5D=${page + 1}"]`).length > 0;
    if (!hasNext) break;

    page += 1;
    await sleep(DELAY_MS);
  }

  return shops;
}

// --- Trusted Shops (DE) ---------------------------------------------------

async function scrapeTrustedShops() {
  const shops = [];
  const url = "https://www.trustedshops.de/fake-shops/";
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  $(".result-item").each((_, el) => {
    const domain = normalizeDomain($(el).find("h4").first().text());
    const dateText = $(el).find("span").filter((__, s) => /\d{2}\.\d{2}\.\d{4}/.test($(s).text())).first().text();
    const type = $(el).text().includes("Fake Shop") && !$(el).text().includes("Trustmark")
      ? "fake_shop"
      : "fake_trustmark";
    if (domain) {
      shops.push({
        domain,
        source: "trustedshops.de",
        listedSince: parseGermanDate(dateText),
        type,
      });
    }
  });

  console.log(`[trustedshops] ${shops.length} Eintraege`);
  return shops;
}

// --- Verbraucherzentrale Fakeshop-Finder (DE) ------------------------------

async function scrapeFakeshopFinderWarnungen() {
  const shops = [];
  const url = "https://warnung.fakeshop-finder.de/";
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  $(".content-wrapper.views-row").each((_, el) => {
    const domain = normalizeDomain($(el).find(".title a").first().text());
    const dateText = $(el).find(".date time").first().text();
    const note = $(el).find(".teaser_text").first().text().trim();
    if (domain) {
      shops.push({
        domain,
        source: "verbraucherzentrale.de",
        listedSince: parseGermanDate(dateText),
        note: note || undefined,
      });
    }
  });

  console.log(`[verbraucherzentrale] ${shops.length} Eintraege`);
  return shops;
}

// --- Merge & Write ----------------------------------------------------------

async function main() {
  const results = await Promise.allSettled([
    // scrapeWatchlistInternet(), // siehe Hinweis oben: Cloudflare blockt automatisierte Clients
    scrapeTrustedShops(),
    scrapeFakeshopFinderWarnungen(),
  ]);

  const merged = new Map();
  for (const r of results) {
    if (r.status !== "fulfilled") {
      console.error("Quelle fehlgeschlagen:", r.reason?.message || r.reason);
      continue;
    }
    for (const shop of r.value) {
      const existing = merged.get(shop.domain);
      if (existing) {
        if (!existing.sources.includes(shop.source)) existing.sources.push(shop.source);
        if (shop.listedSince && (!existing.listedSince || shop.listedSince < existing.listedSince)) {
          existing.listedSince = shop.listedSince;
        }
        if (shop.note && !existing.note) existing.note = shop.note;
      } else {
        merged.set(shop.domain, {
          domain: shop.domain,
          sources: [shop.source],
          listedSince: shop.listedSince || null,
          note: shop.note,
        });
      }
    }
  }

  const list = Array.from(merged.values()).sort((a, b) => a.domain.localeCompare(b.domain));

  const output = {
    generatedAt: new Date().toISOString(),
    sourceUrls: {
      "watchlist-internet.at": "https://www.watchlist-internet.at/liste-betruegerischer-shops/",
      "trustedshops.de": "https://www.trustedshops.de/fake-shops/",
      "verbraucherzentrale.de": "https://warnung.fakeshop-finder.de/",
    },
    count: list.length,
    shops: list,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\nFertig: ${list.length} Shops gespeichert in ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
