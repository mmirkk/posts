
const numberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const listFromEnv = (name: string, fallback: string[]) => (process.env[name] ?? fallback.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const config = {
  port: numberFromEnv("PORT", 3001),
  databaseUrl: process.env.DATABASE_URL ?? "",
  databaseTable: process.env.POSTS_TABLE ?? "public.vs_posts_detalle",
  sheetId: process.env.GOOGLE_SHEET_ID ?? "1dss74R_EcymZiCXGpoLW4CM5256CMX5dfZyZLNoNlHE",
  sheetName: process.env.GOOGLE_SHEET_NAME ?? "Hoja 1",
  timezone: process.env.REPORT_TIMEZONE ?? "America/Argentina/Buenos_Aires",
  reportStartDate: process.env.REPORT_START_DATE ?? "2026-06-16",
  toleranceDays: numberFromEnv("DATE_TOLERANCE_DAYS", 0),
  approximateThreshold: numberFromEnv("APPROXIMATE_MATCH_THRESHOLD", 0.82),
  doubtfulThreshold: numberFromEnv("DOUBTFUL_MATCH_THRESHOLD", 0.66),
  ambiguityDelta: numberFromEnv("AMBIGUITY_SCORE_DELTA", 0.035),
  candidateWindowDays: numberFromEnv("CANDIDATE_WINDOW_DAYS", 45),
  cacheMinutes: numberFromEnv("REPORT_CACHE_MINUTES", 5),
  officialProfileIds: listFromEnv("OFFICIAL_PROFILE_IDS", ["757523", "743322", "560926", "566907", "560932", "560927"]),
};

if (!config.databaseUrl) throw new Error("Falta DATABASE_URL en el archivo .env");
if (!/^\d{4}-\d{2}-\d{2}$/u.test(config.reportStartDate)) throw new Error("REPORT_START_DATE debe tener formato YYYY-MM-DD");
if (!/^[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)?$/.test(config.databaseTable)) {
  throw new Error("POSTS_TABLE contiene un nombre no válido");
}

export const OFFICIAL_PROFILE_RULES: Record<string, RegExp[]> = {
  manuel: [/^manuel passaglia$/i],
  hechos: [/^passaglia hechos$/i, /^passagliahechos$/i],
  hermanos: [/^hermanos passaglia$/i, /^hermanospassaglia$/i, /^passaglia hechos$/i],
  x: [/^manuel passaglia$/i],
};
