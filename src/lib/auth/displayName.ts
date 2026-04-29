export function displayNameForEmail(email?: string | null): string | null {
  if (!email) return null;
  const e = email.toLowerCase();
  if (e === "fletcher@millieshomemade.com") return "Fletcher";
  if (e === "caroline@millieshomemade.com") return "Caroline";
  return email.split("@")[0] ?? null;
}

