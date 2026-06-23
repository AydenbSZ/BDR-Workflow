import Anthropic from "@anthropic-ai/sdk";
import { getContactFull } from "./hubspot.js";
import { researchCompany } from "./researcher.js";
import { buildPrompt } from "./promptBuilder.js";

const researchCache = new Map();

export async function processSingleContact(contactId, { onProgress, extraContext = "" } = {}) {
  const progress = (msg) => onProgress?.(contactId, msg);

  try {
    progress("Fetching HubSpot data...");
    const contactData = await getContactFull(contactId);
    const contact = contactData.contact || {};
    const company = contactData.company || {};
    const contactName = contact.name || `Contact ${contactId}`;
    const companyName = company.name || "";

    let research;
    if (companyName && researchCache.has(companyName)) {
      progress(`Using cached research for ${companyName}...`);
      research = researchCache.get(companyName);
    } else {
      progress(`Researching ${companyName || "company"} for intent signals...`);
      research = await researchCompany(companyName, company.website || "");
      if (companyName) researchCache.set(companyName, research);
    }

    progress("Building prompt...");
    const prompt = buildPrompt(contactData, research, extraContext);

    progress("Generating email with Claude...");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const rawText = message.content[0].text.trim();
    const { subject, body } = parseEmail(rawText);

    const topSignals = [];
    for (const s of (research.development_signals || []).slice(0, 2)) {
      topSignals.push({ type: "development", title: s.title, snippet: (s.snippet || "").slice(0, 150), url: s.url || "" });
    }
    for (const s of (research.funding_signals || []).slice(0, 2)) {
      topSignals.push({ type: "funding", title: s.title, snippet: (s.snippet || "").slice(0, 150), url: s.url || "" });
    }

    progress("Done.");
    return {
      contact_id: contactId,
      contact_name: contactName,
      company_name: companyName,
      email: contact.email || "",
      job_title: contact.job_title || "",
      subject,
      body,
      intent_signals: topSignals,
      status: "success",
      error_message: null,
    };
  } catch (err) {
    progress(`Error: ${err.message}`);
    return {
      contact_id: contactId,
      contact_name: `Contact ${contactId}`,
      company_name: "",
      email: "",
      job_title: "",
      subject: "",
      body: "",
      intent_signals: [],
      status: "error",
      error_message: err.message,
    };
  }
}

function parseEmail(raw) {
  const lines = raw.split("\n");
  let subject = "";
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().startsWith("subject:")) {
      subject = lines[i].slice("subject:".length).trim();
      bodyStart = i + 1;
      break;
    }
  }

  while (bodyStart < lines.length && !lines[bodyStart].trim()) {
    bodyStart++;
  }

  const body = lines.slice(bodyStart).join("\n").trim();
  return { subject, body };
}
