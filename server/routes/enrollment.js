import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  enrollContact,
  getOwnedCompanyIds,
  getContactIdsForCompanies,
  batchReadContacts,
  getContactIdsWithOpenDeals,
  EXCLUDED_STATUSES,
} from "../services/hubspot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const ENROLLMENT_LOG = path.join(DATA_DIR, "enrollments.json");

function readEnrollmentLog() {
  try { return JSON.parse(fs.readFileSync(ENROLLMENT_LOG, "utf-8")); }
  catch { return []; }
}

function appendEnrollment(entry) {
  const log = readEnrollmentLog();
  log.push(entry);
  fs.mkdirSync(path.dirname(ENROLLMENT_LOG), { recursive: true });
  fs.writeFileSync(ENROLLMENT_LOG, JSON.stringify(log, null, 2));
}

const router = Router();

const TITLE_MAP = {
  "VP of Real Estate":                { seniority: ["vp", "vice president"],                topic: ["real estate"] },
  "SVP of Real Estate":               { seniority: ["svp", "senior vp", "senior vice president"], topic: ["real estate"] },
  "Head of Real Estate":              { seniority: ["head"],                                topic: ["real estate"] },
  "Director of Real Estate":          { seniority: ["director"],                            topic: ["real estate"] },
  "Director of Site Selection":       { seniority: ["director"],                            topic: ["site selection"] },
  "Head of Site Selection":           { seniority: ["head"],                                topic: ["site selection"] },
  "VP of Development":                { seniority: ["vp", "vice president"],                topic: ["development"] },
  "Director of Development":          { seniority: ["director"],                            topic: ["development"] },
  "Chief Development Officer":        { seniority: ["chief"],                              topic: ["development"] },
  "CDO":                              { seniority: ["cdo"],                                topic: ["cdo"] },
  "Real Estate Manager":              { seniority: ["manager"],                             topic: ["real estate"] },
  "Real Estate Strategy Manager":     { seniority: ["manager"],                             topic: ["real estate", "strategy"] },
  "Chief Growth Officer (CGO)":       { seniority: ["chief", "cgo"],                       topic: ["growth"] },
  "VP of Growth":                     { seniority: ["vp", "vice president"],                topic: ["growth"] },
  "Head of Growth":                   { seniority: ["head"],                                topic: ["growth"] },
  "VP of Strategy":                   { seniority: ["vp", "vice president"],                topic: ["strategy"] },
  "Director of Strategy":             { seniority: ["director"],                            topic: ["strategy"] },
  "Head of Strategic Planning":       { seniority: ["head"],                                topic: ["strategic", "planning"] },
  "VP of Market Planning":            { seniority: ["vp", "vice president"],                topic: ["market planning", "planning"] },
  "Director of Market Planning":      { seniority: ["director"],                            topic: ["market planning", "planning"] },
  "VP of Expansion":                  { seniority: ["vp", "vice president"],                topic: ["expansion"] },
  "Director of Expansion":            { seniority: ["director"],                            topic: ["expansion"] },
};

router.post("/find-contacts", async (req, res) => {
  const { selectedTitles } = req.body;
  if (!Array.isArray(selectedTitles) || !selectedTitles.length) {
    return res.status(400).json({ error: "No titles selected" });
  }

  try {
    const companyIds = await getOwnedCompanyIds();
    if (!companyIds.length) return res.json({ contacts: [] });

    const contactIds = await getContactIdsForCompanies(companyIds);
    if (!contactIds.length) return res.json({ contacts: [] });

    const raw = await batchReadContacts(contactIds);
    const rules = selectedTitles.map(t => TITLE_MAP[t]).filter(Boolean);

    function matchesAnyRule(jobTitle) {
      const t = jobTitle.toLowerCase();
      return rules.some(rule =>
        rule.seniority.some(s => t.includes(s)) &&
        rule.topic.some(kw => t.includes(kw))
      );
    }

    const titleMatched = raw.filter(c => {
      const title = c.properties.jobtitle || "";
      if (!title || !matchesAnyRule(title)) return false;
      const status = (c.properties.hs_lead_status || "").toLowerCase();
      return !EXCLUDED_STATUSES.some(s => status.includes(s));
    });

    const titleMatchedIds = titleMatched.map(c => String(c.id));
    const openDealContactIds = await getContactIdsWithOpenDeals(titleMatchedIds);

    const matched = titleMatched
      .filter(c => !openDealContactIds.has(String(c.id)))
      .map(c => ({
        id: Number(c.id),
        name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(" ") || "Unknown",
        title: c.properties.jobtitle || "",
        email: c.properties.email || "",
        status: c.properties.hs_lead_status || "NEW",
        company: c.properties.company || "",
      }));

    res.json({ contacts: matched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/enroll", async (req, res) => {
  const { contacts } = req.body;
  if (!contacts || !Array.isArray(contacts) || !contacts.length) {
    return res.status(400).json({ error: "No contacts provided" });
  }

  const results = [];
  for (const contact of contacts) {
    try {
      await enrollContact(contact.id);
      results.push({ id: contact.id, name: contact.name, status: "success" });
      appendEnrollment({
        id: contact.id,
        name: contact.name || "",
        email: contact.email || "",
        title: contact.title || "",
        company: contact.company || "",
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toISOString(),
      });
    } catch (err) {
      results.push({ id: contact.id, name: contact.name, status: "failed", error: err.message });
    }
    if (contacts.indexOf(contact) < contacts.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  res.json({ results });
});

router.get("/enrolled-today", (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const log = readEnrollmentLog();
  res.json({ enrollments: log.filter(e => e.date === today) });
});

export default router;
