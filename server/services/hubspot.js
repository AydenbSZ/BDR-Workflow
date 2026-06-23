const BASE = "https://api.hubapi.com";

function getToken() { return process.env.HUBSPOT_API_KEY; }
function getUserId() { return process.env.HUBSPOT_USER_ID; }
function getSequenceId() { return process.env.HUBSPOT_SEQUENCE_ID; }
function getSenderEmail() { return process.env.SENDER_EMAIL; }

async function hsGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`HubSpot GET ${path} → ${res.status}`);
  return res.json();
}

async function hsPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

function shapeContact(result) {
  const p = result.properties || {};
  const first = p.firstname || "";
  const last = p.lastname || "";
  const name = `${first} ${last}`.trim() || p.email || "Unknown";
  return {
    id: result.id,
    name,
    email: p.email || "",
    job_title: p.jobtitle || "",
    company: p.company || "",
  };
}

export async function getPortalId() {
  try {
    const data = await hsGet("/account-info/v3/details");
    return String(data.portalId || "");
  } catch {
    return "";
  }
}

export async function getContactBasic(contactId) {
  try {
    const data = await hsPost("/crm/v3/objects/contacts/batch/read", {
      inputs: [{ id: String(contactId) }],
      properties: ["firstname", "lastname", "email", "jobtitle", "company"],
    });
    if (data.results && data.results[0]) return shapeContact(data.results[0]);
    return { id: contactId, name: "Unknown", email: "", job_title: "", company: "" };
  } catch {
    return { id: contactId, name: "Unknown", email: "", job_title: "", company: "" };
  }
}

export async function searchContacts(query) {
  const [byContact, byCompany, byDeal] = await Promise.all([
    searchByContactFields(query),
    searchByCompanyName(query),
    searchByDealName(query),
  ]);

  const seen = new Set();
  const merged = [];
  for (const c of [...byContact, ...byCompany, ...byDeal]) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      merged.push(c);
    }
  }
  return merged.slice(0, 50);
}

async function searchByContactFields(query) {
  const words = query.trim().split(/\s+/);
  let filterGroups;

  if (words.length >= 2) {
    filterGroups = [
      { filters: [
        { propertyName: "firstname", operator: "CONTAINS_TOKEN", value: words[0] },
        { propertyName: "lastname", operator: "CONTAINS_TOKEN", value: words[words.length - 1] },
      ]},
      { filters: [
        { propertyName: "firstname", operator: "EQ", value: words[0] },
        { propertyName: "lastname", operator: "EQ", value: words[words.length - 1] },
      ]},
      { filters: [{ propertyName: "email", operator: "CONTAINS_TOKEN", value: query }] },
    ];
  } else {
    filterGroups = [
      { filters: [{ propertyName: "firstname", operator: "CONTAINS_TOKEN", value: query }] },
      { filters: [{ propertyName: "lastname", operator: "CONTAINS_TOKEN", value: query }] },
      { filters: [{ propertyName: "email", operator: "CONTAINS_TOKEN", value: query }] },
      { filters: [{ propertyName: "firstname", operator: "EQ", value: query }] },
      { filters: [{ propertyName: "lastname", operator: "EQ", value: query }] },
    ];
  }

  try {
    const data = await hsPost("/crm/v3/objects/contacts/search", {
      filterGroups,
      properties: ["firstname", "lastname", "email", "jobtitle", "company"],
      limit: 25,
    });
    return (data.results || []).map(shapeContact);
  } catch {
    return [];
  }
}

async function searchByCompanyName(query) {
  try {
    const coData = await hsPost("/crm/v3/objects/companies/search", {
      filterGroups: [{ filters: [
        { propertyName: "name", operator: "CONTAINS_TOKEN", value: query },
      ]}],
      properties: ["name"],
      limit: 10,
    });

    const contacts = [];
    for (const company of coData.results || []) {
      try {
        const assocData = await hsGet(`/crm/v4/objects/companies/${company.id}/associations/contacts`);
        const contactIds = (assocData.results || []).map(a => a.toObjectId).slice(0, 10);
        for (const cid of contactIds) {
          try {
            const cData = await hsPost("/crm/v3/objects/contacts/batch/read", {
              inputs: [{ id: String(cid) }],
              properties: ["firstname", "lastname", "email", "jobtitle", "company"],
            });
            if (cData.results?.[0]) contacts.push(shapeContact(cData.results[0]));
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
    return contacts;
  } catch {
    return [];
  }
}

async function searchByDealName(query) {
  try {
    const dealData = await hsPost("/crm/v3/objects/deals/search", {
      filterGroups: [{ filters: [
        { propertyName: "dealname", operator: "CONTAINS_TOKEN", value: query },
      ]}],
      properties: ["dealname"],
      limit: 10,
    });

    const contacts = [];
    for (const deal of dealData.results || []) {
      try {
        const assocData = await hsGet(`/crm/v4/objects/deals/${deal.id}/associations/contacts`);
        const contactIds = (assocData.results || []).map(a => a.toObjectId).slice(0, 10);
        for (const cid of contactIds) {
          try {
            const cData = await hsPost("/crm/v3/objects/contacts/batch/read", {
              inputs: [{ id: String(cid) }],
              properties: ["firstname", "lastname", "email", "jobtitle", "company"],
            });
            if (cData.results?.[0]) contacts.push(shapeContact(cData.results[0]));
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
    return contacts;
  } catch {
    return [];
  }
}

export async function getContactFull(contactId) {
  const [contact, company, emailHistory, notes, deals, calls, meetings] = await Promise.all([
    fetchContact(contactId),
    fetchCompany(contactId),
    fetchEmailHistory(contactId),
    fetchNotes(contactId),
    fetchDeals(contactId),
    fetchCalls(contactId),
    fetchMeetings(contactId),
  ]);
  return { contact, company, email_history: emailHistory, notes, deals, calls, meetings };
}

async function fetchContact(contactId) {
  const props = [
    "firstname", "lastname", "email", "jobtitle",
    "lifecyclestage", "hs_lead_status", "phone",
    "notes_last_contacted", "notes_last_activity_date",
    "num_contacted_notes", "hs_sales_email_last_replied",
    "hubspot_owner_id",
  ];
  try {
    const data = await hsPost("/crm/v3/objects/contacts/batch/read", {
      inputs: [{ id: String(contactId) }],
      properties: props,
    });
    const p = data.results?.[0]?.properties || {};
    return {
      id: contactId,
      name: `${p.firstname || ""} ${p.lastname || ""}`.trim(),
      email: p.email || "",
      job_title: p.jobtitle || "",
      lifecycle_stage: p.lifecyclestage || "",
      lead_status: p.hs_lead_status || "",
      phone: p.phone || "",
      last_contacted: (p.notes_last_contacted || "").slice(0, 10),
      last_activity: (p.notes_last_activity_date || "").slice(0, 10),
      times_contacted: p.num_contacted_notes || "",
      last_email_reply: (p.hs_sales_email_last_replied || "").slice(0, 10),
    };
  } catch {
    return { id: contactId, name: "Unknown", email: "", job_title: "", lifecycle_stage: "", lead_status: "", phone: "" };
  }
}

async function fetchCompany(contactId) {
  try {
    const assocData = await hsGet(`/crm/v4/objects/contacts/${contactId}/associations/companies`);
    if (!assocData.results?.length) return {};
    const companyId = assocData.results[0].toObjectId;

    const data = await hsPost("/crm/v3/objects/companies/batch/read", {
      inputs: [{ id: String(companyId) }],
      properties: ["name", "industry", "website", "numberofemployees", "annualrevenue", "city", "state", "description"],
    });
    const p = data.results?.[0]?.properties || {};
    return {
      id: companyId,
      name: p.name || "",
      industry: p.industry || "",
      website: p.website || "",
      employees: p.numberofemployees || "",
      revenue: p.annualrevenue || "",
      city: p.city || "",
      state: p.state || "",
      description: p.description || "",
    };
  } catch {
    return {};
  }
}

async function fetchEmailHistory(contactId) {
  try {
    const data = await hsPost("/crm/v3/objects/emails/search", {
      filterGroups: [{ filters: [
        { propertyName: "associations.contact", operator: "EQ", value: contactId },
      ]}],
      properties: ["hs_email_subject", "hs_email_text", "hs_email_direction", "hs_timestamp", "hs_email_status"],
      sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
      limit: 10,
    });
    return (data.results || []).map(item => {
      const p = item.properties || {};
      return {
        subject: p.hs_email_subject || "(no subject)",
        snippet: (p.hs_email_text || "").slice(0, 800),
        direction: p.hs_email_direction || "",
        timestamp: p.hs_timestamp || "",
        status: p.hs_email_status || "",
      };
    });
  } catch {
    return [];
  }
}

async function fetchNotes(contactId) {
  try {
    const data = await hsPost("/crm/v3/objects/notes/search", {
      filterGroups: [{ filters: [
        { propertyName: "associations.contact", operator: "EQ", value: contactId },
      ]}],
      properties: ["hs_note_body", "hs_timestamp"],
      sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
      limit: 15,
    });
    return (data.results || [])
      .map(item => {
        const p = item.properties || {};
        return p.hs_note_body ? { body: p.hs_note_body.slice(0, 1500), timestamp: p.hs_timestamp || "" } : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchDeals(contactId) {
  try {
    const assocData = await hsGet(`/crm/v4/objects/contacts/${contactId}/associations/deals`);
    const dealIds = (assocData.results || []).map(a => a.toObjectId).slice(0, 10);
    if (!dealIds.length) return [];

    const data = await hsPost("/crm/v3/objects/deals/batch/read", {
      inputs: dealIds.map(id => ({ id: String(id) })),
      properties: ["dealname", "dealstage", "closedate", "amount", "pipeline", "hs_lastmodifieddate"],
    });
    return (data.results || []).map(d => {
      const p = d.properties || {};
      return {
        name: p.dealname || "",
        stage: p.dealstage || "",
        pipeline: p.pipeline || "",
        close_date: (p.closedate || "").slice(0, 10),
        amount: p.amount || "",
        last_modified: (p.hs_lastmodifieddate || "").slice(0, 10),
      };
    });
  } catch {
    return [];
  }
}

async function fetchCalls(contactId) {
  try {
    const data = await hsPost("/crm/v3/objects/calls/search", {
      filterGroups: [{ filters: [
        { propertyName: "associations.contact", operator: "EQ", value: contactId },
      ]}],
      properties: ["hs_call_body", "hs_timestamp", "hs_call_direction", "hs_call_duration", "hs_call_disposition"],
      sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
      limit: 10,
    });
    return (data.results || []).map(item => {
      const p = item.properties || {};
      return {
        notes: (p.hs_call_body || "").slice(0, 800),
        timestamp: (p.hs_timestamp || "").slice(0, 10),
        direction: p.hs_call_direction || "",
        duration_ms: p.hs_call_duration || "",
        outcome: p.hs_call_disposition || "",
      };
    });
  } catch {
    return [];
  }
}

async function fetchMeetings(contactId) {
  try {
    const data = await hsPost("/crm/v3/objects/meetings/search", {
      filterGroups: [{ filters: [
        { propertyName: "associations.contact", operator: "EQ", value: contactId },
      ]}],
      properties: ["hs_meeting_title", "hs_meeting_body", "hs_timestamp", "hs_meeting_outcome"],
      sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
      limit: 10,
    });
    return (data.results || []).map(item => {
      const p = item.properties || {};
      return {
        title: p.hs_meeting_title || "",
        notes: (p.hs_meeting_body || "").slice(0, 800),
        timestamp: (p.hs_timestamp || "").slice(0, 10),
        outcome: p.hs_meeting_outcome || "",
      };
    });
  } catch {
    return [];
  }
}

// --- BDR-specific HubSpot functions ---

const EXCLUDED_STATUSES = ["customer", "evangelist", "open_deal", "open deal"];

export async function getOwnedCompanyIds() {
  const ids = [];
  let after;
  do {
    const body = {
      filterGroups: [{ filters: [
        { propertyName: "bdr_company_owner", operator: "EQ", value: String(getUserId()) },
        { propertyName: "unit_count", operator: "GTE", value: "50" },
      ]}],
      properties: ["name"],
      limit: 100,
    };
    if (after) body.after = after;
    const data = await hsPost("/crm/v3/objects/companies/search", body);
    (data.results || []).forEach(c => ids.push(c.id));
    after = data.paging?.next?.after;
  } while (after && ids.length < 2000);
  return ids;
}

export async function getContactIdsForCompanies(companyIds) {
  const contactIds = new Set();
  for (let i = 0; i < companyIds.length; i += 100) {
    const batch = companyIds.slice(i, i + 100);
    try {
      const data = await hsPost("/crm/v3/associations/company/contact/batch/read", {
        inputs: batch.map(id => ({ id })),
      });
      (data.results || []).forEach(r => (r.to || []).forEach(t => contactIds.add(String(t.id))));
    } catch { /* skip */ }
  }
  return [...contactIds];
}

export async function batchReadContacts(contactIds) {
  const all = [];
  for (let i = 0; i < contactIds.length; i += 100) {
    const batch = contactIds.slice(i, i + 100);
    try {
      const data = await hsPost("/crm/v3/objects/contacts/batch/read", {
        inputs: batch.map(id => ({ id })),
        properties: ["firstname", "lastname", "jobtitle", "email", "hs_lead_status", "company"],
      });
      all.push(...(data.results || []));
    } catch { /* skip */ }
  }
  return all;
}

export async function getContactIdsWithOpenDeals(contactIds) {
  const withDeals = new Set();
  for (let i = 0; i < contactIds.length; i += 100) {
    const batch = contactIds.slice(i, i + 100);
    try {
      const data = await hsPost("/crm/v3/associations/contact/deal/batch/read", {
        inputs: batch.map(id => ({ id })),
      });
      const dealIds = [];
      const dealToContact = {};
      (data.results || []).forEach(r => {
        (r.to || []).forEach(t => {
          dealIds.push(String(t.id));
          dealToContact[String(t.id)] = String(r.from.id);
        });
      });

      for (let j = 0; j < dealIds.length; j += 100) {
        const dealBatch = dealIds.slice(j, j + 100);
        const dealData = await hsPost("/crm/v3/objects/deals/batch/read", {
          inputs: dealBatch.map(id => ({ id })),
          properties: ["dealstage", "hs_is_closed"],
        });
        (dealData.results || []).forEach(d => {
          if (d.properties.hs_is_closed !== "true") {
            withDeals.add(dealToContact[String(d.id)]);
          }
        });
      }
    } catch { /* skip */ }
  }
  return withDeals;
}

export async function enrollContact(contactId) {
  const url = `${BASE}/automation/v4/sequences/enrollments?userId=${getUserId()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sequenceId: getSequenceId(),
      contactId: String(contactId),
      senderEmail: getSenderEmail(),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return await res.json();
}

export { EXCLUDED_STATUSES, hsPost };
