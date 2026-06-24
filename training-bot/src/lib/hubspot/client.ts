import { z } from "zod";

const HUBSPOT_API_BASE = "https://api.hubapi.com";
const API_VERSION = "2026-03";
const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY = 1100;

interface HubSpotRequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

let lastRequestTime = 0;

function getAccessToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN is not configured");
  return token;
}

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY - elapsed));
  }
  lastRequestTime = Date.now();
}

async function request<T>(
  path: string,
  options: HubSpotRequestOptions = {}
): Promise<T> {
  const { method = "GET", body, params } = options;

  let url = `${HUBSPOT_API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await rateLimit();

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (res.status >= 500 && attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(
          `HubSpot API error ${res.status}: ${errorBody.slice(0, 500)}`
        );
      }

      return (await res.json()) as T;
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw lastError ?? new Error("HubSpot request failed");
}

// --- Owners ---

export const HubSpotOwnerSchema = z.object({
  id: z.string(),
  userId: z.number().optional().nullable(),
  email: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  teams: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .optional()
    .default([]),
  archived: z.boolean().optional().default(false),
});

export type HubSpotOwnerDTO = z.infer<typeof HubSpotOwnerSchema>;

export async function getOwners(): Promise<HubSpotOwnerDTO[]> {
  const data = await request<{ results: unknown[] }>(
    "/crm/v3/owners",
    { params: { limit: "500" } }
  );
  return data.results.map((r) => HubSpotOwnerSchema.parse(r));
}

// --- Dispositions ---

export const DispositionSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export type DispositionDTO = z.infer<typeof DispositionSchema>;

export async function getDispositions(): Promise<DispositionDTO[]> {
  const data = await request<{
    results: Array<{
      id?: string;
      value?: string;
      internalValue?: string;
      label?: string;
      displayOrder?: number;
    }>;
  }>("/crm/v3/properties/calls/hs_call_disposition");

  const prop = data as unknown as {
    options?: Array<{ value: string; label: string }>;
  };

  if (prop.options && Array.isArray(prop.options)) {
    return prop.options.map((o) =>
      DispositionSchema.parse({ id: o.value, label: o.label })
    );
  }

  return [];
}

// --- Calls ---

export interface CallSearchFilters {
  dispositionId: string;
  ownerIds: string[];
  direction?: string;
  status?: string;
  minDurationMs?: number;
  dateFrom?: string;
  dateTo?: string;
  after?: string;
}

const CALL_PROPERTIES = [
  "hs_timestamp",
  "hs_call_title",
  "hs_call_body",
  "hs_call_duration",
  "hs_call_direction",
  "hs_call_disposition",
  "hs_call_status",
  "hs_call_recording_url",
  "hs_call_source",
  "hubspot_owner_id",
  "hs_object_id",
  "hs_call_transcription_id",
];

export async function searchCalls(filters: CallSearchFilters) {
  const filterGroups: Array<{ filters: Array<Record<string, unknown>> }> = [];

  for (const ownerId of filters.ownerIds) {
    const group: Array<Record<string, unknown>> = [
      {
        propertyName: "hs_call_disposition",
        operator: "EQ",
        value: filters.dispositionId,
      },
      {
        propertyName: "hubspot_owner_id",
        operator: "EQ",
        value: ownerId,
      },
    ];

    if (filters.direction) {
      group.push({
        propertyName: "hs_call_direction",
        operator: "EQ",
        value: filters.direction,
      });
    }

    if (filters.status) {
      group.push({
        propertyName: "hs_call_status",
        operator: "EQ",
        value: filters.status,
      });
    }

    if (filters.dateFrom) {
      group.push({
        propertyName: "hs_timestamp",
        operator: "GTE",
        value: filters.dateFrom,
      });
    }

    if (filters.dateTo) {
      group.push({
        propertyName: "hs_timestamp",
        operator: "LTE",
        value: filters.dateTo,
      });
    }

    filterGroups.push({ filters: group });
  }

  const body = {
    filterGroups,
    properties: CALL_PROPERTIES,
    limit: 100,
    after: filters.after || undefined,
    sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
  };

  try {
    return await request<{
      results: Array<{ id: string; properties: Record<string, string | null> }>;
      paging?: { next?: { after: string } };
    }>(`/crm/objects/${API_VERSION}/calls/search`, {
      method: "POST",
      body,
    });
  } catch {
    return await request<{
      results: Array<{ id: string; properties: Record<string, string | null> }>;
      paging?: { next?: { after: string } };
    }>("/crm/v3/objects/calls/search", {
      method: "POST",
      body,
    });
  }
}

export async function getCall(callId: string) {
  try {
    return await request<{
      id: string;
      properties: Record<string, string | null>;
    }>(`/crm/objects/${API_VERSION}/calls/${callId}`, {
      params: { properties: CALL_PROPERTIES.join(",") },
    });
  } catch {
    return await request<{
      id: string;
      properties: Record<string, string | null>;
    }>(`/crm/v3/objects/calls/${callId}`, {
      params: { properties: CALL_PROPERTIES.join(",") },
    });
  }
}

/**
 * Extract a HubSpot call/engagement ID from a pasted record link or raw ID.
 * Call record URLs look like:
 *   https://app.hubspot.com/contacts/<portal>/record/0-48/<callId>
 *   https://app.hubspot.com/contacts/<portal>/call/<callId>
 * (0-48 is HubSpot's object-type id for calls.)
 */
export function parseHubSpotCallId(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d{6,}$/.test(t)) return t;

  const recMatch = t.match(/0-48\/(\d+)/);
  if (recMatch) return recMatch[1];

  const callMatch = t.match(/\/call\/(\d+)/i);
  if (callMatch) return callMatch[1];

  try {
    const url = new URL(t);
    const idParam =
      url.searchParams.get("interactionId") ||
      url.searchParams.get("engagementId") ||
      url.searchParams.get("id");
    if (idParam && /^\d+$/.test(idParam)) return idParam;
    const seg = url.pathname.split("/").filter(Boolean).pop();
    if (seg && /^\d{6,}$/.test(seg)) return seg;
  } catch {
    /* not a URL */
  }

  const loose = t.match(/(\d{8,})/);
  return loose ? loose[1] : null;
}

// --- Transcripts ---

export interface TranscriptUtteranceDTO {
  speakerName?: string;
  speakerEmail?: string;
  text: string;
  startTimeMillis?: number;
  endTimeMillis?: number;
}

export async function getTranscript(
  transcriptId: string
): Promise<TranscriptUtteranceDTO[]> {
  try {
    const data = await request<{
      transcriptUtterances?: Array<{
        speakerName?: string;
        speakerEmail?: string;
        text?: string;
        startTimeMillis?: number;
        endTimeMillis?: number;
      }>;
    }>(`/crm/extensions/calling/${API_VERSION}/transcripts/${transcriptId}`);

    if (data.transcriptUtterances) {
      return data.transcriptUtterances
        .filter((u) => u.text)
        .map((u) => ({
          speakerName: u.speakerName,
          speakerEmail: u.speakerEmail,
          text: u.text!,
          startTimeMillis: u.startTimeMillis,
          endTimeMillis: u.endTimeMillis,
        }));
    }
    return [];
  } catch {
    return [];
  }
}

// --- Associations ---

export async function getAssociations(
  callId: string,
  toType: "contacts" | "companies"
) {
  try {
    const data = await request<{
      results: Array<{ id: string; type: string }>;
    }>(`/crm/v3/objects/calls/${callId}/associations/${toType}`);
    return data.results || [];
  } catch {
    return [];
  }
}

export async function getContact(contactId: string) {
  return request<{
    id: string;
    properties: Record<string, string | null>;
  }>(`/crm/v3/objects/contacts/${contactId}`, {
    params: {
      properties:
        "firstname,lastname,jobtitle,email,company,associatedcompanyid",
    },
  });
}

export async function getCompany(companyId: string) {
  return request<{
    id: string;
    properties: Record<string, string | null>;
  }>(`/crm/v3/objects/companies/${companyId}`, {
    params: {
      properties: "name,domain,industry,website",
    },
  });
}

// ─── BDR Bot: Write Operations ───────────────────────────────────────

interface HubSpotAssociation {
  to: { id: string };
  types: Array<{ associationCategory: string; associationTypeId: number }>;
}

interface CrmObject {
  id: string;
  properties: Record<string, string | null>;
}

interface CrmSearchResult {
  results: CrmObject[];
  total: number;
  paging?: { next?: { after: string } };
}

interface CrmFilter {
  propertyName: string;
  operator: string;
  value: string;
}

// --- Companies (Write) ---

export async function createCompany(
  properties: Record<string, string>
): Promise<CrmObject> {
  return request<CrmObject>("/crm/v3/objects/companies", {
    method: "POST",
    body: { properties },
  });
}

export async function updateCompany(
  companyId: string,
  properties: Record<string, string>
): Promise<CrmObject> {
  return request<CrmObject>(`/crm/v3/objects/companies/${companyId}`, {
    method: "PATCH",
    body: { properties },
  });
}

export async function searchCompanies(
  filters: CrmFilter[],
  properties?: string[]
): Promise<CrmSearchResult> {
  return request<CrmSearchResult>("/crm/v3/objects/companies/search", {
    method: "POST",
    body: {
      filterGroups: [{ filters }],
      properties: properties ?? [
        "name",
        "domain",
        "industry",
        "website",
        "numberofemployees",
        "annualrevenue",
      ],
      limit: 10,
    },
  });
}

// --- Contacts (Write) ---

export async function createContact(
  properties: Record<string, string>
): Promise<CrmObject> {
  return request<CrmObject>("/crm/v3/objects/contacts", {
    method: "POST",
    body: { properties },
  });
}

export async function updateContact(
  contactId: string,
  properties: Record<string, string>
): Promise<CrmObject> {
  return request<CrmObject>(`/crm/v3/objects/contacts/${contactId}`, {
    method: "PATCH",
    body: { properties },
  });
}

export async function searchContacts(
  filters: CrmFilter[],
  properties?: string[]
): Promise<CrmSearchResult> {
  return request<CrmSearchResult>("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: {
      filterGroups: [{ filters }],
      properties: properties ?? [
        "firstname",
        "lastname",
        "email",
        "jobtitle",
        "company",
        "phone",
      ],
      limit: 10,
    },
  });
}

// --- Tasks ---

export async function createTask(
  properties: Record<string, string>,
  associations?: HubSpotAssociation[]
): Promise<CrmObject> {
  return request<CrmObject>("/crm/v3/objects/tasks", {
    method: "POST",
    body: { properties, associations },
  });
}

// --- Notes ---

export async function createNote(
  properties: Record<string, string>,
  associations?: HubSpotAssociation[]
): Promise<CrmObject> {
  return request<CrmObject>("/crm/v3/objects/notes", {
    method: "POST",
    body: { properties, associations },
  });
}

// --- Associations ---

export async function associateObjects(
  fromType: string,
  fromId: string,
  toType: string,
  toId: string,
  associationTypeId: number
): Promise<void> {
  await request<unknown>(
    `/crm/v3/objects/${fromType}/${fromId}/associations/${toType}/${toId}/${associationTypeId}`,
    { method: "PUT" }
  );
}

// --- Sequences ---

export async function getSequences(): Promise<
  Array<{ id: string; name: string; updatedAt: string }>
> {
  try {
    const data = await request<{
      results: Array<{ id: string; name: string; updatedAt: string }>;
    }>("/automation/v4/sequences", { params: { limit: "100" } });
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function enrollInSequence(
  sequenceId: string,
  contactId: string,
  senderEmail: string
): Promise<{ id: string }> {
  return request<{ id: string }>(
    `/automation/v4/sequences/${sequenceId}/enrollments`,
    {
      method: "POST",
      body: { contactId, senderEmail },
    }
  );
}
