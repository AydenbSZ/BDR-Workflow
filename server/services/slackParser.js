/**
 * Parses structured Slack messages from #sitezeus-scanner channel
 * to extract trigger event companies grouped by BDR owner.
 *
 * Expected format per entry:
 *   _Company Name_ (<hubspot_url|label>) — Event Type
 *   Description text
 *   :newspaper: Source: <url|label>
 *   :office: HubSpot BDR Owner: Owner Name
 *
 * Entries are grouped under headers like:
 *   :bust_in_silhouette: _Owner Name_
 *
 * Some entries have multiple HubSpot links separated by · for multi-brand companies.
 */

/**
 * Strip parenthetical suffixes and brand clarifiers from company names.
 * e.g. "CEC Entertainment (Chuck E. Cheese)" → "CEC Entertainment"
 *      "Dine Brands (Applebee's / IHOP)" → "Dine Brands"
 *      "Cold Stone Creamery / Wetzel's Pretzels" → split into two
 */
function cleanCompanyName(raw) {
  // Remove parenthetical suffixes
  let name = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return name;
}

/**
 * Parse a single Slack message text into an array of trigger event objects.
 * @param {string} text - Raw Slack message text
 * @param {string} [ownerFilter] - If set, only return entries for this BDR owner
 * @returns {{ companies: Array<{name, event, source, companyId, description}>, date: string }}
 */
export function parseSlackMessage(text, ownerFilter) {
  const companies = [];

  // Extract the date from the header line
  const dateMatch = text.match(/_Daily Franchise & Restaurant News Scan_\s*[—–-]\s*(.+)/);
  const scanDate = dateMatch ? dateMatch[1].trim() : new Date().toISOString().slice(0, 10);

  // Split into BDR owner sections
  const sections = text.split(/(?=:bust_in_silhouette:|:warning:)/);

  for (const section of sections) {
    // Identify the BDR owner for this section
    const ownerMatch = section.match(/:bust_in_silhouette:\s*_([^_]+)_/);
    const isNotInCRM = section.includes(":warning:") && section.includes("Not in CRM");

    // Skip "Not in CRM" sections entirely
    if (isNotInCRM) continue;

    const currentOwner = ownerMatch ? ownerMatch[1].trim() : null;

    // If owner filter is set, skip non-matching sections
    if (ownerFilter && currentOwner && !currentOwner.toLowerCase().includes(ownerFilter.toLowerCase())) {
      continue;
    }

    // Also skip sections labeled as unassigned/no owner unless they match filter
    if (ownerFilter && currentOwner && (
      currentOwner.toLowerCase().includes("no bdr owner") ||
      currentOwner.toLowerCase().includes("unassigned")
    )) {
      continue;
    }

    // Extract individual company entries
    // Matches: _Company Name_ (<url|label> · <url|label>) — Event Type
    // Or:      _Company Name_ (<url|label>) — Event Type
    const entryRegex = /_([^_]+)_\s*\((<https:\/\/app\.hubspot\.com[^)]+>(?:\s*[·]\s*<https:\/\/app\.hubspot\.com[^)]+>)*)\)\s*[—–-]\s*(.+?)(?=\n)/g;
    let match;

    while ((match = entryRegex.exec(section)) !== null) {
      const rawCompanyName = match[1].trim();
      const urlBlock = match[2];
      const eventType = match[3].trim();

      // Extract all HubSpot company IDs from the URL block
      const idRegex = /\/record\/0-2\/(\d+)/g;
      const companyIds = [];
      let idMatch;
      while ((idMatch = idRegex.exec(urlBlock)) !== null) {
        companyIds.push(idMatch[1]);
      }

      // Extract first URL (clean off |label)
      const firstUrlMatch = urlBlock.match(/<(https:\/\/app\.hubspot\.com\/contacts\/\d+\/record\/0-2\/\d+)[^>]*>/);
      const hubspotUrl = firstUrlMatch ? firstUrlMatch[1] : "";
      const primaryCompanyId = companyIds[0] || "";

      // Find the source URL that follows this entry
      const afterMatch = section.slice(match.index + match[0].length);
      const sourceMatch = afterMatch.match(/:newspaper:\s*Source:\s*<([^|>]+)/);
      const source = sourceMatch ? sourceMatch[1] : "";

      // Find description (text between the header line and :newspaper:)
      const descMatch = afterMatch.match(/\n(.+?)(?=\n:newspaper:)/s);
      const description = descMatch ? descMatch[1].trim() : "";

      // Verify BDR owner for this specific entry
      const ownerCheckMatch = afterMatch.match(/:office:\s*HubSpot BDR Owner:\s*(.+?)(?=\n|$)/);
      const entryOwner = ownerCheckMatch ? ownerCheckMatch[1].trim() : currentOwner || "";

      // Apply owner filter at the entry level too
      if (ownerFilter && !entryOwner.toLowerCase().includes(ownerFilter.toLowerCase())) {
        continue;
      }

      // Clean company name (remove parenthetical brand clarifiers)
      const companyName = cleanCompanyName(rawCompanyName);

      // Handle multi-brand entries (e.g. "Cold Stone Creamery / Wetzel's Pretzels")
      // If there are multiple company IDs AND a "/" separator, create separate entries
      if (companyIds.length > 1 && rawCompanyName.includes("/")) {
        const brandNames = rawCompanyName.split(/\s*\/\s*/);
        brandNames.forEach((brand, idx) => {
          companies.push({
            name: cleanCompanyName(brand),
            event: eventType,
            source,
            companyId: companyIds[idx] || companyIds[0],
            hubspotUrl,
            description,
            owner: entryOwner,
          });
        });
      } else {
        companies.push({
          name: companyName,
          event: eventType,
          source,
          companyId: primaryCompanyId,
          hubspotUrl,
          description,
          owner: entryOwner,
        });
      }
    }
  }

  return { companies, date: scanDate };
}

/**
 * Parse multiple Slack messages and merge the results.
 * @param {string[]} messages - Array of raw message texts
 * @param {string} [ownerFilter] - Filter by BDR owner name
 * @returns {{ companies: Array, dates: string[] }}
 */
export function parseSlackMessages(messages, ownerFilter) {
  const allCompanies = [];
  const dates = [];
  const seen = new Set();

  for (const text of messages) {
    const { companies, date } = parseSlackMessage(text, ownerFilter);
    dates.push(date);

    for (const co of companies) {
      const key = `${co.name}|${co.event}`;
      if (!seen.has(key)) {
        seen.add(key);
        allCompanies.push(co);
      }
    }
  }

  return { companies: allCompanies, dates };
}
