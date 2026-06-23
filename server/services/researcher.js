const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const CUTOFF_MS = 240 * 24 * 60 * 60 * 1000;

export async function researchCompany(companyName, website = "") {
  if (!companyName) {
    return { development_signals: [], funding_signals: [], summary: "" };
  }

  const devSignals = await newsSearch(
    `"${companyName}" expansion OR "new location" OR "new store" OR "new unit" OR franchise OR development OR construction`
  );

  await sleep(300 + Math.random() * 500);

  const fundSignals = await newsSearch(
    `"${companyName}" funding OR investment OR raised OR acquisition OR growth OR "new market"`
  );

  const freshDev = devSignals.filter(s => isFresh(s.published_date));
  const freshFund = fundSignals.filter(s => isFresh(s.published_date));

  const seenTitles = new Set(freshDev.map(s => s.title.toLowerCase()));
  const dedupedFund = freshFund.filter(s => !seenTitles.has(s.title.toLowerCase()));

  const parts = [];
  if (freshDev.length) parts.push("Development signals: " + freshDev.slice(0, 2).map(s => s.title).join("; "));
  if (dedupedFund.length) parts.push("Funding/growth signals: " + dedupedFund.slice(0, 2).map(s => s.title).join("; "));

  return {
    development_signals: freshDev.slice(0, 5),
    funding_signals: dedupedFund.slice(0, 5),
    summary: parts.length ? parts.join(" | ") : "No recent intent signals found.",
  };
}

async function newsSearch(query) {
  try {
    const url = new URL("https://news.google.com/rss/search");
    url.searchParams.set("q", query);
    url.searchParams.set("hl", "en-US");
    url.searchParams.set("gl", "US");
    url.searchParams.set("ceid", "US:en");

    const resp = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(12000) });
    if (!resp.ok) return [];
    const xml = await resp.text();
    return parseRss(xml);
  } catch {
    return [];
  }
}

function parseRss(xml) {
  const results = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  let count = 0;

  while ((match = itemRegex.exec(xml)) !== null && count < 10) {
    const item = match[1];
    count++;

    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
    let rawTitle = titleMatch ? cleanXml(titleMatch[1]) : "";
    const title = rawTitle.replace(/\s*-\s*[^-]+$/, "").trim() || rawTitle;

    const dateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const published_date = dateMatch ? dateMatch[1].trim() : "";

    const descMatch = item.match(/<description>([\s\S]*?)<\/description>/);
    let snippet = "";
    let rawDesc = "";
    if (descMatch) {
      rawDesc = descMatch[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
      snippet = cleanXml(rawDesc).slice(0, 400);
    }

    const urlMatch = rawDesc.match(/href="(https?:\/\/(?!news\.google)[^"]+)"/);
    let url = "";
    if (urlMatch) {
      url = urlMatch[1];
    } else {
      const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
      url = linkMatch ? cleanXml(linkMatch[1]) : "";
    }

    if (title) {
      results.push({ title, url, snippet, published_date });
    }
  }
  return results;
}

function cleanXml(text) {
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function isFresh(dateStr) {
  if (!dateStr) return true;
  try {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return true;
    return parsed.getTime() >= Date.now() - CUTOFF_MS;
  } catch {
    return true;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
