const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s]+/giu;
const CHANNEL_PREFIX = /^\s*(?:meta|facebook|fb|instagram|ig|tiktok|tt|x|twitter|youtube|yt)\s*:\s*/giu;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/gu;
const VARIATION_SELECTORS = /[\uFE0E\uFE0F]/gu;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;
const PUNCTUATION = /[\p{P}\p{S}]/gu;

function urlToken(raw: string) {
  const canonical = canonicalizeUrl(raw) || raw.toLocaleLowerCase("es");
  let hash = 2166136261;
  for (const character of canonical) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return ` urltoken${(hash >>> 0).toString(36)} `;
}

function normalizeUnicode(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(ZERO_WIDTH, "")
    .replace(VARIATION_SELECTORS, "")
    .replace(CONTROL, "");
}

export function normalizeDescription(value: unknown): string {
  if (typeof value !== "string") return "";
  return normalizeUnicode(value)
    .toLocaleLowerCase("es")
    .replace(/\r\n?|\n/gu, " ")
    .replace(CHANNEL_PREFIX, "")
    .replace(URL_PATTERN, (match) => urlToken(match))
    .replace(/[“”«»]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/[–—]/gu, "-")
    .replace(/[.,;:!?¿¡()[\]{}"'…|/\\_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeForSimilarity(value: unknown): string {
  return normalizeDescription(value)
    .replace(/\burltoken[0-9a-z]+\b/gu, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(PUNCTUATION, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeProfile(value: unknown): string {
  return normalizeUnicode(String(value ?? ""))
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function extractUrls(value: string): string[] {
  return value.match(URL_PATTERN)?.map((url) => url.replace(/[),.;]+$/u, "")) ?? [];
}

export function canonicalizeUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw.startsWith("www.") ? `https://${raw}` : raw);
    let hostname = parsed.hostname.toLocaleLowerCase("es").replace(/^(?:www\.|m\.)/u, "");
    let pathname = parsed.pathname.replace(/\/$/u, "");
    if (hostname === "youtu.be") {
      hostname = "youtube.com";
      pathname = `/watch/${pathname.replace(/^\//u, "")}`;
    } else if (hostname === "youtube.com") {
      const pathParts = pathname.split("/").filter(Boolean);
      const videoId = pathname === "/watch"
        ? parsed.searchParams.get("v")
        : ["shorts", "embed", "live"].includes(pathParts[0] ?? "")
          ? pathParts[1]
          : null;
      if (videoId) pathname = `/watch/${videoId}`;
    } else if (hostname === "instagram.com") {
      const pathParts = pathname.split("/").filter(Boolean);
      if (["reel", "reels"].includes(pathParts[0] ?? "") && pathParts[1]) pathname = `/reel/${pathParts[1]}`;
    } else if (hostname === "facebook.com" && pathname === "/watch") {
      const videoId = parsed.searchParams.get("v");
      if (videoId) pathname = `/watch/${videoId}`;
    }
    return `${hostname}${pathname}`;
  } catch {
    return raw.toLocaleLowerCase("es").replace(/[?#].*$/u, "").replace(/\/$/u, "");
  }
}

export function extractHashtags(value: string): string[] {
  return normalizeUnicode(value).toLocaleLowerCase("es").match(/#[\p{L}\p{N}_]+/gu) ?? [];
}

export function extractEmojis(value: string): string[] {
  return value.replace(VARIATION_SELECTORS, "").match(/\p{Extended_Pictographic}/gu) ?? [];
}
