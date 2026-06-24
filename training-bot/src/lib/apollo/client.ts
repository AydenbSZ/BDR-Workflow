const APOLLO_API_BASE = "https://api.apollo.io";
const RATE_LIMIT_DELAY = 500;
const MAX_RETRIES = 3;

let lastRequestTime = 0;

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY is not configured");
  return key;
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
  body: Record<string, unknown>
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await rateLimit();

    try {
      const res = await fetch(`${APOLLO_API_BASE}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": getApiKey(),
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
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
          `Apollo API error ${res.status}: ${errorBody.slice(0, 500)}`
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

  throw lastError ?? new Error("Apollo request failed");
}

// --- Types ---

export interface ApolloPerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  phone_numbers?: Array<{ raw_number: string; type: string }>;
  linkedin_url: string | null;
  seniority: string | null;
  departments: string[];
  organization?: {
    id: string;
    name: string;
    domain: string | null;
    estimated_num_employees: number | null;
    industry: string | null;
  };
}

export interface ApolloOrganization {
  id: string;
  name: string;
  domain: string | null;
  website_url: string | null;
  estimated_num_employees: number | null;
  industry: string | null;
  sub_industry: string | null;
  annual_revenue: number | null;
  annual_revenue_printed: string | null;
  total_funding: number | null;
  total_funding_printed: string | null;
  headquarter_city: string | null;
  headquarter_state: string | null;
  headquarter_country: string | null;
  num_retail_locations: number | null;
  linkedin_url: string | null;
}

// --- People Search ---

export interface PeopleSearchParams {
  organizationDomains?: string[];
  organizationNames?: string[];
  personTitles?: string[];
  personSeniorities?: string[];
  limit?: number;
  page?: number;
}

export async function searchPeople(
  params: PeopleSearchParams
): Promise<{ people: ApolloPerson[]; totalEntries: number }> {
  const body: Record<string, unknown> = {
    per_page: params.limit ?? 25,
    page: params.page ?? 1,
  };

  if (params.organizationDomains?.length) {
    body.q_organization_domains = params.organizationDomains.join("\n");
  }
  if (params.organizationNames?.length) {
    body.q_organization_name = params.organizationNames[0];
  }
  if (params.personTitles?.length) {
    body.person_titles = params.personTitles;
  }
  if (params.personSeniorities?.length) {
    body.person_seniorities = params.personSeniorities;
  }

  const data = await request<{
    people: ApolloPerson[];
    pagination: { total_entries: number };
  }>("/v1/mixed_people/search", body);

  return {
    people: data.people ?? [],
    totalEntries: data.pagination?.total_entries ?? 0,
  };
}

// --- Organization Search ---

export interface OrgSearchParams {
  organizationName?: string;
  organizationDomains?: string[];
  organizationIndustries?: string[];
  employeeRanges?: string[];
  limit?: number;
  page?: number;
}

export async function searchOrganizations(
  params: OrgSearchParams
): Promise<{ organizations: ApolloOrganization[]; totalEntries: number }> {
  const body: Record<string, unknown> = {
    per_page: params.limit ?? 25,
    page: params.page ?? 1,
  };

  if (params.organizationName) {
    body.q_organization_name = params.organizationName;
  }
  if (params.organizationDomains?.length) {
    body.organization_domains = params.organizationDomains;
  }
  if (params.organizationIndustries?.length) {
    body.organization_industry_tag_ids = params.organizationIndustries;
  }
  if (params.employeeRanges?.length) {
    body.organization_num_employees_ranges = params.employeeRanges;
  }

  const data = await request<{
    organizations: ApolloOrganization[];
    pagination: { total_entries: number };
  }>("/v1/mixed_organizations/search", body);

  return {
    organizations: data.organizations ?? [],
    totalEntries: data.pagination?.total_entries ?? 0,
  };
}

// --- Contact Enrichment ---

export async function enrichContact(
  email: string
): Promise<ApolloPerson | null> {
  try {
    const data = await request<{ person: ApolloPerson | null }>(
      "/v1/people/match",
      { email }
    );
    return data.person;
  } catch {
    return null;
  }
}

export function isApolloConfigured(): boolean {
  return !!process.env.APOLLO_API_KEY;
}
