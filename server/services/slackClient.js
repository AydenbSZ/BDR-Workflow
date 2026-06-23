/**
 * Lightweight Slack Web API client using native fetch.
 * Reads messages from a channel using conversations.history.
 */

const CHANNEL_ID = "C0B5C4WR8JJ"; // #sitezeus-scanner

function getSlackToken() {
  return process.env.SLACK_BOT_TOKEN;
}

/**
 * Decode Slack's HTML entities in message text.
 */
function decodeSlackText(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Fetch recent messages from #sitezeus-scanner.
 * @param {number} [limit=10] - Number of messages to fetch
 * @returns {Promise<string[]>} Array of message texts
 */
export async function fetchSlackMessages(limit = 10) {
  const token = getSlackToken();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN not configured. Add it to your .env file.");
  }

  const url = new URL("https://slack.com/api/conversations.history");
  url.searchParams.set("channel", CHANNEL_ID);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  // Filter to only daily scan messages, decode HTML entities first
  return (data.messages || [])
    .filter((m) => m.text && (
      m.text.includes("Daily Franchise & Restaurant News Scan") ||
      m.text.includes("Daily Franchise &amp; Restaurant News Scan")
    ))
    .map((m) => decodeSlackText(m.text));
}

/**
 * Fetch only today's scan message.
 * @returns {Promise<string[]>}
 */
export async function fetchTodaysScan() {
  const messages = await fetchSlackMessages(10);

  const today = new Date();
  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const month = monthNames[today.getMonth()];
  const day = today.getDate();
  const year = today.getFullYear();

  // Match today's date in various formats (full and abbreviated month)
  const todayPatterns = [
    `${month} ${day}, ${year}`,
    `${month.slice(0, 3)} ${day}, ${year}`,
    `May ${day}, ${year}`,
  ];

  // Also match day-of-week formats like "Wednesday, May 21, 2026"
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const dayOfWeek = dayNames[today.getDay()];
  todayPatterns.push(`${dayOfWeek}, ${month} ${day}, ${year}`);

  const todayMessages = messages.filter((text) =>
    todayPatterns.some((p) => text.includes(p))
  );

  // If no exact today match, return the most recent scan
  return todayMessages.length > 0 ? todayMessages : messages.slice(0, 1);
}

export function isSlackConfigured() {
  return !!process.env.SLACK_BOT_TOKEN;
}
