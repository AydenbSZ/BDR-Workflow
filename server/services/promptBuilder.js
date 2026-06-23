import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, "..", "..");
const RULES_PATH = path.join(BASE_DIR, "rules", "rules.md");
const EXAMPLES_DIR = path.join(BASE_DIR, "rules", "examples");
const SITEZEUS_PATH = path.join(BASE_DIR, "context", "sitezeus_products.md");
const CLIENTS_PATH = path.join(BASE_DIR, "context", "current_clients.md");

function loadRules() {
  try { return fs.readFileSync(RULES_PATH, "utf-8").trim(); }
  catch { return "(No rules.md found — add one at rules/rules.md)"; }
}

function loadExamples() {
  try {
    if (!fs.existsSync(EXAMPLES_DIR)) return [];
    return fs.readdirSync(EXAMPLES_DIR)
      .filter(f => f.endsWith(".txt") || f.endsWith(".md"))
      .sort()
      .map(f => fs.readFileSync(path.join(EXAMPLES_DIR, f), "utf-8").trim())
      .filter(Boolean);
  } catch { return []; }
}

function loadSitezeusContext() {
  try { return fs.readFileSync(SITEZEUS_PATH, "utf-8").trim(); }
  catch { return "(sitezeus_products.md not found)"; }
}

function loadCurrentClients() {
  try { return fs.readFileSync(CLIENTS_PATH, "utf-8").trim(); }
  catch { return "(current_clients.md not found)"; }
}

export function buildPrompt(contactData, research, extraContext = "") {
  const rules = loadRules();
  const examples = loadExamples();
  const sitezeusContext = loadSitezeusContext();
  const currentClients = loadCurrentClients();

  const contact = contactData.contact || {};
  const company = contactData.company || {};
  const emailHistory = contactData.email_history || [];
  const notes = contactData.notes || [];
  const deals = contactData.deals || [];
  const calls = contactData.calls || [];
  const meetings = contactData.meetings || [];
  const devSignals = research.development_signals || [];
  const fundSignals = research.funding_signals || [];

  const examplesBlock = examples.length
    ? examples.map((ex, i) => `<example id="${i + 1}">\n${ex}\n</example>`).join("\n")
    : '<example id="1">(No example emails found — add .txt files to rules/examples/)</example>';

  const companyName = company.name || "their company";
  const contactName = contact.name || "the prospect";
  const extraBlock = extraContext?.trim()
    ? `\nAdditional instructions for this version:\n${extraContext.trim()}\n`
    : "";

  return `You are a sales representative at SiteZeus writing a personalized outreach email to a prospect.

<sitezeus_context>
${sitezeusContext}
</sitezeus_context>

<current_clients>
${currentClients}
</current_clients>

<writing_rules>
${rules}
</writing_rules>

<example_emails>
${examplesBlock}
</example_emails>

<contact_information>
Name: ${contact.name || "Unknown"}
Email: ${contact.email || ""}
Job Title: ${contact.job_title || ""}
Lifecycle Stage: ${contact.lifecycle_stage || ""}
Lead Status: ${contact.lead_status || ""}
Last Contacted: ${contact.last_contacted || ""}
Last Activity: ${contact.last_activity || ""}
Times Contacted: ${contact.times_contacted || ""}
Last Email Reply: ${contact.last_email_reply || ""}
</contact_information>

<company_information>
Company: ${company.name || ""}
Industry: ${company.industry || ""}
Website: ${company.website || ""}
Employees: ${company.employees || ""}
Annual Revenue: ${company.revenue || ""}
City/State: ${company.city || ""} ${company.state || ""}
Description: ${company.description || ""}
</company_information>

<crm_history>
<past_emails>
${formatEmailHistory(emailHistory)}
</past_emails>
<notes_and_activities>
${formatNotes(notes)}
</notes_and_activities>
<call_logs>
${formatCalls(calls) || "No call history found."}
</call_logs>
<meetings>
${formatMeetings(meetings) || "No meeting history found."}
</meetings>
<deals>
${formatDeals(deals) || "No deal history found."}
</deals>
</crm_history>

<intent_signals>
<development_projects>
${formatSignals(devSignals) || "No recent development signals found."}
</development_projects>
<funding_and_growth>
${formatSignals(fundSignals) || "No recent funding or growth signals found."}
</funding_and_growth>
</intent_signals>

<task>
Write a personalized outreach email to ${contactName} at ${companyName} on behalf of SiteZeus.

- Follow ALL rules in writing_rules exactly.
- Write in a similar style, tone, and length to the example_emails. Use a bullet list when it fits naturally, but don't force it if the email flows better as short paragraphs.
- Use sitezeus_context to select the most relevant product(s) for this contact's role and company.
- If strong intent signals exist, reference 1-2 specific ones — be concrete, not vague. If none exist, focus on the contact's role and company context.
- If past_emails or notes_and_activities show prior contact, acknowledge it naturally rather than writing a cold opener.
- Naturally reference a relevant client from current_clients as social proof if it fits organically.
- Be selective — do not mention every data point.
${extraBlock}
OUTPUT FORMAT:
- First line: "Subject: [subject line]"
- Blank line
- Email body only — no preamble, explanation, or commentary
</task>`;
}

function formatEmailHistory(emails) {
  if (!emails.length) return "No prior email history found.";
  return emails.map(e => {
    const dir = e.direction || "";
    const label = dir.toUpperCase().includes("OUTGOING") ? "Sent to contact"
      : dir.toUpperCase().includes("INCOMING") ? "Received from contact" : dir;
    const ts = (e.timestamp || "").slice(0, 10);
    return `[${ts}] ${label} — Subject: ${e.subject || ""}\n  ${e.snippet || ""}`;
  }).join("\n\n");
}

function formatNotes(notes) {
  if (!notes.length) return "No CRM notes found.";
  return notes.map(n => `[${(n.timestamp || "").slice(0, 10)}] ${n.body || ""}`).join("\n\n");
}

function formatDeals(deals) {
  if (!deals.length) return "";
  return deals.map(d => {
    const parts = [`Deal: ${d.name || ""}`];
    if (d.pipeline) parts.push(`Pipeline: ${d.pipeline}`);
    if (d.stage) parts.push(`Stage: ${d.stage}`);
    if (d.amount) parts.push(`Amount: $${d.amount}`);
    if (d.close_date) parts.push(`Close date: ${d.close_date}`);
    if (d.last_modified) parts.push(`Last modified: ${d.last_modified}`);
    return parts.join(" | ");
  }).join("\n");
}

function formatCalls(calls) {
  if (!calls.length) return "";
  return calls.map(c => {
    const dir = c.direction || "";
    const label = dir.toUpperCase().includes("OUTBOUND") ? "Outbound call"
      : dir.toUpperCase().includes("INBOUND") ? "Inbound call" : "Call";
    let line = `[${c.timestamp || ""}] ${label}`;
    if (c.outcome) line += ` (Outcome: ${c.outcome})`;
    if (c.duration_ms) {
      const mins = Math.floor(parseInt(c.duration_ms) / 60000);
      if (mins > 0) line += ` — ${mins} min`;
    }
    if (c.notes) line += `\n  Notes: ${c.notes}`;
    return line;
  }).join("\n\n");
}

function formatMeetings(meetings) {
  if (!meetings.length) return "";
  return meetings.map(m => {
    let line = `[${m.timestamp || ""}] ${m.title || "Meeting"}`;
    if (m.outcome) line += ` (Outcome: ${m.outcome})`;
    if (m.notes) line += `\n  Notes: ${m.notes}`;
    return line;
  }).join("\n\n");
}

function formatSignals(signals) {
  if (!signals.length) return "";
  return signals.map(s => {
    const date = (s.published_date || "").slice(0, 10) || "unknown date";
    return `Title: ${s.title || ""}\nDate: ${date}\nSnippet: ${s.snippet || ""}\nURL: ${s.url || ""}`;
  }).join("\n\n");
}
