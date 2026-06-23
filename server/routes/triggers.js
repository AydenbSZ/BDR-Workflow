import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  hsPost,
  getContactIdsForCompanies,
  batchReadContacts,
  getContactIdsWithOpenDeals,
  EXCLUDED_STATUSES,
  updateCompanyIntentSignal,
} from "../services/hubspot.js";
import { parseSlackMessages } from "../services/slackParser.js";
import { fetchTodaysScan, isSlackConfigured } from "../services/slackClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const TRIGGER_LOG = path.join(DATA_DIR, "trigger-events.json");
const SLACK_CACHE = path.join(DATA_DIR, "slack-scan.json");

function getUserId() { return process.env.HUBSPOT_USER_ID; }

function readTriggerLog() {
  try { return JSON.parse(fs.readFileSync(TRIGGER_LOG, "utf-8")); }
  catch { return []; }
}

function writeTriggerLog(data) {
  fs.mkdirSync(path.dirname(TRIGGER_LOG), { recursive: true });
  fs.writeFileSync(TRIGGER_LOG, JSON.stringify(data, null, 2));
}

const router = Router();

router.post("/", async (req, res) => {
  const { companies } = req.body;
  if (!Array.isArray(companies) || !companies.length) {
    return res.status(400).json({ error: "No companies provided" });
  }

  const today = new Date().toISOString().slice(0, 10);
  const allContacts = [];

  for (const co of companies) {
    try {
      const companyData = await hsPost("/crm/v3/objects/companies/search", {
        filterGroups: [{ filters: [
          { propertyName: "name", operator: "EQ", value: co.name },
          { propertyName: "bdr_company_owner", operator: "EQ", value: String(getUserId()) },
        ]}],
        properties: ["name", "unit_count", "state"],
        limit: 10,
      });

      const companyResults = companyData.results || [];
      const companyIds = companyResults.map(c => c.id);
      if (!companyIds.length) continue;

      const companyInfo = companyResults[0]?.properties || {};
      const unitCount = companyInfo.unit_count || "";
      const companyState = companyInfo.state || "";
      const hsCompanyId = companyResults[0].id;

      // Update intent signal on the COMPANY
      let intentSignal = null;
      try {
        intentSignal = await updateCompanyIntentSignal(hsCompanyId, co.event);
      } catch (err) {
        console.error(`[Intent update] Company "${co.name}":`, err.message);
      }

      const contactIds = await getContactIdsForCompanies(companyIds);
      if (!contactIds.length) continue;

      const raw = await batchReadContacts(contactIds);

      const eligible = raw.filter(c => {
        const status = (c.properties.hs_lead_status || "").toLowerCase();
        return !EXCLUDED_STATUSES.some(s => status.includes(s));
      });

      const eligibleIds = eligible.map(c => String(c.id));
      const openDealIds = await getContactIdsWithOpenDeals(eligibleIds);

      eligible
        .filter(c => !openDealIds.has(String(c.id)))
        .forEach(c => {
          allContacts.push({
            id: Number(c.id),
            name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(" ") || "Unknown",
            title: c.properties.jobtitle || "",
            email: c.properties.email || "",
            status: c.properties.hs_lead_status || "NEW",
            company: co.name,
            unitCount,
            state: companyState,
            event: co.event || "",
            source: co.source || "",
            date: today,
            intentSignal,
          });
        });
    } catch (err) {
      console.error(`Error processing company "${co.name}":`, err.message);
    }
  }

  const log = readTriggerLog().filter(e => e.date !== today);
  const existing = new Set();
  const merged = [...log];
  allContacts.forEach(c => {
    if (!existing.has(c.id)) {
      existing.add(c.id);
      merged.push(c);
    }
  });
  writeTriggerLog(merged);

  res.json({ contacts: allContacts, total: allContacts.length });
});

router.get("/", (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const log = readTriggerLog();
  res.json({ contacts: log.filter(e => e.date === today) });
});

/* ---------- Slack scanning ---------- */

function readSlackCache() {
  try { return JSON.parse(fs.readFileSync(SLACK_CACHE, "utf-8")); }
  catch { return { messages: [], lastScan: null, parsedCompanies: [] }; }
}

function writeSlackCache(data) {
  fs.mkdirSync(path.dirname(SLACK_CACHE), { recursive: true });
  fs.writeFileSync(SLACK_CACHE, JSON.stringify(data, null, 2));
}

/**
 * POST /api/triggers/scan-slack
 * Accepts raw Slack messages, parses them for trigger events,
 * and processes them through HubSpot to find contacts.
 *
 * Body: { messages: string[], ownerFilter?: string }
 */
router.post("/scan-slack", async (req, res) => {
  const { messages, ownerFilter = "Ayden Benton" } = req.body;

  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "No Slack messages provided" });
  }

  const { companies: parsed } = parseSlackMessages(messages, ownerFilter);

  // Cache the parsed data
  writeSlackCache({
    messages,
    lastScan: new Date().toISOString(),
    parsedCompanies: parsed,
  });

  // Feed parsed companies into the same trigger processing pipeline
  const today = new Date().toISOString().slice(0, 10);
  const allContacts = [];

  for (const co of parsed) {
    try {
      const companyData = await hsPost("/crm/v3/objects/companies/search", {
        filterGroups: [{ filters: [
          { propertyName: "name", operator: "EQ", value: co.name },
          { propertyName: "bdr_company_owner", operator: "EQ", value: String(getUserId()) },
        ]}],
        properties: ["name", "unit_count", "state"],
        limit: 10,
      });

      const companyResults = companyData.results || [];
      const companyIds = companyResults.map(c => c.id);
      if (!companyIds.length) continue;

      const companyInfo = companyResults[0]?.properties || {};
      const unitCount = companyInfo.unit_count || "";
      const companyState = companyInfo.state || "";
      const hsCompanyId = companyResults[0].id;

      let intentSignal = null;
      try {
        intentSignal = await updateCompanyIntentSignal(hsCompanyId, co.event);
      } catch (err) {
        console.error(`[Intent update] Company "${co.name}":`, err.message);
      }

      const contactIds = await getContactIdsForCompanies(companyIds);
      if (!contactIds.length) continue;

      const raw = await batchReadContacts(contactIds);
      const eligible = raw.filter(c => {
        const status = (c.properties.hs_lead_status || "").toLowerCase();
        return !EXCLUDED_STATUSES.some(s => status.includes(s));
      });

      const eligibleIds = eligible.map(c => String(c.id));
      const openDealIds = await getContactIdsWithOpenDeals(eligibleIds);

      eligible
        .filter(c => !openDealIds.has(String(c.id)))
        .forEach(c => {
          allContacts.push({
            id: Number(c.id),
            name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(" ") || "Unknown",
            title: c.properties.jobtitle || "",
            email: c.properties.email || "",
            status: c.properties.hs_lead_status || "NEW",
            company: co.name,
            unitCount,
            state: companyState,
            event: co.event || "",
            source: co.source || "",
            date: today,
            intentSignal,
          });
        });
    } catch (err) {
      console.error(`[Slack scan] Error processing "${co.name}":`, err.message);
    }
  }

  // Merge into trigger log
  const log = readTriggerLog().filter(e => e.date !== today);
  const existing = new Set();
  const merged = [...log];
  allContacts.forEach(c => {
    if (!existing.has(c.id)) {
      existing.add(c.id);
      merged.push(c);
    }
  });
  writeTriggerLog(merged);

  res.json({
    parsed: parsed.length,
    contacts: allContacts,
    total: allContacts.length,
  });
});

/**
 * GET /api/triggers/slack-cache
 * Returns the last Slack scan results without re-processing.
 */
router.get("/slack-cache", (req, res) => {
  const cache = readSlackCache();
  res.json(cache);
});

/**
 * GET /api/triggers/slack-status
 * Returns whether the Slack integration is configured.
 */
router.get("/slack-status", (req, res) => {
  res.json({ configured: isSlackConfigured() });
});

/**
 * POST /api/triggers/auto-scan-slack
 * Automatically fetches today's scan from #claude-updates via Slack API,
 * parses it, and processes companies through HubSpot.
 */
router.post("/auto-scan-slack", async (req, res) => {
  const { ownerFilter = "Ayden Benton" } = req.body || {};

  try {
    // 1. Fetch messages from Slack
    const messages = await fetchTodaysScan();
    if (!messages.length) {
      return res.json({ parsed: 0, contacts: [], total: 0, message: "No scan messages found for today." });
    }

    // 2. Parse the messages
    const { companies: parsed } = parseSlackMessages(messages, ownerFilter);

    // Cache the parsed data
    writeSlackCache({
      messages,
      lastScan: new Date().toISOString(),
      parsedCompanies: parsed,
    });

    if (!parsed.length) {
      return res.json({ parsed: 0, contacts: [], total: 0, message: "No companies found for your filter." });
    }

    // 3. Process through HubSpot
    const today = new Date().toISOString().slice(0, 10);
    const allContacts = [];

    for (const co of parsed) {
      try {
        const companyData = await hsPost("/crm/v3/objects/companies/search", {
          filterGroups: [{ filters: [
            { propertyName: "name", operator: "EQ", value: co.name },
            { propertyName: "bdr_company_owner", operator: "EQ", value: String(getUserId()) },
          ]}],
          properties: ["name", "unit_count", "state"],
          limit: 10,
        });

        const companyResults = companyData.results || [];
        const companyIds = companyResults.map(c => c.id);
        if (!companyIds.length) continue;

        const companyInfo = companyResults[0]?.properties || {};
        const unitCount = companyInfo.unit_count || "";
        const companyState = companyInfo.state || "";
        const hsCompanyId = companyResults[0].id;

        let intentSignal = null;
        try {
          intentSignal = await updateCompanyIntentSignal(hsCompanyId, co.event);
        } catch (err) {
          console.error(`[Intent update] Company "${co.name}":`, err.message);
        }

        const contactIds = await getContactIdsForCompanies(companyIds);
        if (!contactIds.length) continue;

        const raw = await batchReadContacts(contactIds);
        const eligible = raw.filter(c => {
          const status = (c.properties.hs_lead_status || "").toLowerCase();
          return !EXCLUDED_STATUSES.some(s => status.includes(s));
        });

        const eligibleIds = eligible.map(c => String(c.id));
        const openDealIds = await getContactIdsWithOpenDeals(eligibleIds);

        eligible
          .filter(c => !openDealIds.has(String(c.id)))
          .forEach(c => {
            allContacts.push({
              id: Number(c.id),
              name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(" ") || "Unknown",
              title: c.properties.jobtitle || "",
              email: c.properties.email || "",
              status: c.properties.hs_lead_status || "NEW",
              company: co.name,
              unitCount,
              state: companyState,
              event: co.event || "",
              source: co.source || "",
              date: today,
              intentSignal,
            });
          });
      } catch (err) {
        console.error(`[Auto-scan] Error processing "${co.name}":`, err.message);
      }
    }

    // Merge into trigger log
    const log = readTriggerLog().filter(e => e.date !== today);
    const existing = new Set();
    const merged = [...log];
    allContacts.forEach(c => {
      if (!existing.has(c.id)) {
        existing.add(c.id);
        merged.push(c);
      }
    });
    writeTriggerLog(merged);

    res.json({
      parsed: parsed.length,
      contacts: allContacts,
      total: allContacts.length,
    });
  } catch (err) {
    console.error("[Auto-scan] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
