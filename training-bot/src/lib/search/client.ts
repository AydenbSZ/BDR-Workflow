const MAX_RETRIES = 2;

function getApiKey(): string {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY is not configured");
  return key;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  position: number;
}

export interface NewsResult {
  title: string;
  link: string;
  snippet: string;
  date: string;
  source: string;
}

export async function searchGoogle(
  query: string,
  num: number = 10
): Promise<SearchResult[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": getApiKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Serper error ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = await res.json();
      return (data.organic ?? []).map(
        (r: { title: string; link: string; snippet: string; date?: string }, i: number) => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
          date: r.date,
          position: i + 1,
        })
      );
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw lastError ?? new Error("Search failed");
}

export async function searchNews(
  query: string,
  num: number = 10
): Promise<NewsResult[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://google.serper.dev/news", {
        method: "POST",
        headers: {
          "X-API-KEY": getApiKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Serper error ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = await res.json();
      return (data.news ?? []).map(
        (r: { title: string; link: string; snippet: string; date: string; source: string }) => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
          date: r.date,
          source: r.source,
        })
      );
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw lastError ?? new Error("News search failed");
}

export function isSearchConfigured(): boolean {
  return !!process.env.SERPER_API_KEY;
}
