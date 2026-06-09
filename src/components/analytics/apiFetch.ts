/** Client-side fetch helper — handles HTML/504 responses from Vercel without JSON parse crashes. */
export async function fetchAnalyticsApi<T extends { ok: boolean; error?: string }>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const text = await res.text();

  let json: T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
    if (res.status === 504 || snippet.toLowerCase().includes("timeout")) {
      throw new Error("Loading Square data timed out. Wait a moment and try again.");
    }
    throw new Error(snippet || `Server error (${res.status})`);
  }

  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }

  return json;
}
