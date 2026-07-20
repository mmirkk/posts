import { addDays, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { es } from "date-fns/locale";
import type { ActualPost, PlannedPost, ReportAnalytics, ReportMetrics, ReportRecord, ReportResponse, SocialNetwork, ThemeNetworkMetric, UpcomingContent } from "../shared/types";
import { config } from "./config";
import { loadActualPosts } from "./data/database";
import { loadPlannedPosts } from "./data/sheet";
import { matchPosts } from "./matching/matcher";
import { canonicalizeUrl, extractUrls } from "./matching/normalize";
import { loadReviewDecisions } from "./reviews";

const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const pct = (numerator: number, denominator: number) => denominator ? round(numerator / denominator * 100) : 0;

export function isStoryPost(post: Pick<ActualPost, "mediaType">) {
  return /^(story|stories|historia|historias)$/iu.test(post.mediaType.trim());
}

function localIsoDate(anchor = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(anchor);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function calculateMetrics(records: ReportRecord[], actualCount?: number): ReportMetrics {
  const plannedRecords = records.filter((record) => record.plannedId);
  const matchedRecords = plannedRecords.filter((record) => record.actualId);
  const exact = plannedRecords.filter((record) => record.matchType === "exacta").length;
  const byUrl = plannedRecords.filter((record) => record.matchType === "por_url").length;
  const byTitle = plannedRecords.filter((record) => record.matchType === "por_titulo").length;
  const approximate = plannedRecords.filter((record) => record.matchType === "aproximada").length;
  const modified = plannedRecords.filter((record) => record.status === "modificada").length;
  const onTime = matchedRecords.filter((record) => record.temporalStatus === "en_fecha").length;
  const withinTolerance = matchedRecords.filter((record) => record.temporalStatus === "dentro_tolerancia").length;
  const dayDiffs = matchedRecords.map((record) => record.dayDifference).filter((value): value is number => value !== null);
  const derivedActualIds = new Set(records.flatMap((record) => record.actualId ? [record.actualId] : record.alternativeCandidates.map((candidate) => candidate.actualId)));
  const actual = actualCount ?? derivedActualIds.size;
  return {
    planned: plannedRecords.length,
    actual,
    matched: matchedRecords.length,
    exact,
    byUrl,
    byTitle,
    approximate,
    onTime,
    withinTolerance,
    early: matchedRecords.filter((record) => record.temporalStatus === "anticipada").length,
    delayed: matchedRecords.filter((record) => record.temporalStatus === "demorada").length,
    notPublished: plannedRecords.filter((record) => ["no_publicada", "datos_incompletos"].includes(record.status)).length,
    unplanned: records.filter((record) => record.status === "no_planificada").length,
    doubtful: plannedRecords.filter((record) => record.status === "coincidencia_dudosa").length,
    incomplete: plannedRecords.filter((record) => record.status === "datos_incompletos").length,
    modified,
    compliancePct: pct(matchedRecords.length, plannedRecords.length),
    exactCompliancePct: pct(exact, plannedRecords.length),
    exactOnTimePct: pct(plannedRecords.filter((record) => record.matchType === "exacta" && record.temporalStatus === "en_fecha").length, plannedRecords.length),
    modifiedPct: pct(modified, plannedRecords.length),
    averageDayDeviation: dayDiffs.length ? round(dayDiffs.reduce((sum, value) => sum + Math.abs(value), 0) / dayDiffs.length, 2) : null,
  };
}

export function reportingWindow(anchor = new Date(), requestedWeekEnd?: string) {
  const localDate = localIsoDate(anchor);
  const localMidnight = new Date(`${localDate}T00:00:00Z`);
  const daysUntilSunday = (7 - localMidnight.getUTCDay()) % 7;
  const currentEnd = addDays(parseISO(localDate), daysUntilSunday);
  const end = requestedWeekEnd ? parseISO(requestedWeekEnd) : currentEnd;
  if (Number.isNaN(end.valueOf()) || end.getUTCDay() !== 0) throw new Error("La semana seleccionada debe cerrar un domingo válido.");
  const start = subDays(end, 6);
  const isCurrent = localDate >= format(start, "yyyy-MM-dd") && localDate <= format(end, "yyyy-MM-dd");
  const dataThrough = isCurrent ? localDate : format(end, "yyyy-MM-dd");
  return {
    from: format(start, "yyyy-MM-dd"),
    to: format(end, "yyyy-MM-dd"),
    dataThrough,
    isCurrent,
    isAll: false,
    label: `${format(start, "d MMM", { locale: es })} – ${format(end, "d MMM yyyy", { locale: es })}`,
    timezone: config.timezone,
    rule: isCurrent
      ? `Semana en curso: lunes a domingo. Datos disponibles hasta el ${format(parseISO(dataThrough), "d MMM", { locale: es })}.`
      : "Semana completa: lunes 00:00 a domingo 23:59.",
    nextDisplayDay: "martes",
  };
}

export function allReportingWindow(anchor = new Date()) {
  const latest = reportingWindow(anchor);
  const from = config.reportStartDate;
  const dataThrough = latest.dataThrough;
  return {
    from,
    to: latest.to,
    dataThrough,
    isCurrent: false,
    isAll: true,
    label: `${format(parseISO(from), "d MMM yyyy", { locale: es })} – ${format(parseISO(dataThrough), "d MMM yyyy", { locale: es })}`,
    timezone: config.timezone,
    rule: `Todas las semanas disponibles desde el ${format(parseISO(from), "d MMM yyyy", { locale: es })}. Datos disponibles hasta el ${format(parseISO(dataThrough), "d MMM yyyy", { locale: es })}.`,
    nextDisplayDay: "martes",
  };
}

export function availableReportingWeeks(planned: PlannedPost[], anchor = new Date()) {
  const latest = reportingWindow(anchor);
  const latestEnd = parseISO(latest.to);
  const reportStart = parseISO(config.reportStartDate);
  const ends = new Set<string>();
  if (latestEnd >= reportStart) ends.add(latest.to);
  for (const post of planned) {
    if (!post.plannedDate) continue;
    const date = parseISO(post.plannedDate);
    if (Number.isNaN(date.valueOf())) continue;
    const end = addDays(date, (7 - date.getUTCDay()) % 7);
    if (end >= reportStart && end <= latestEnd) ends.add(format(end, "yyyy-MM-dd"));
  }
  return [...ends]
    .sort((left, right) => right.localeCompare(left))
    .map((value) => {
      const window = reportingWindow(anchor, value);
      return { value, from: window.from, to: window.to, label: window.label, isCurrent: window.isCurrent };
    });
}

const cache = new Map<string, { expiresAt: number; value: ReportResponse }>();

export function buildUpcomingContent(planned: PlannedPost[], anchor = new Date()) {
  const asOf = localIsoDate(anchor);
  const future = planned.filter((post) => post.plannedDate > asOf).sort((left, right) => left.plannedDate.localeCompare(right.plannedDate) || left.sourceRow - right.sourceRow);
  const groups = new Map<number, PlannedPost[]>();
  for (const post of future) {
    const group = groups.get(post.sourceRow) ?? [];
    group.push(post);
    groups.set(post.sourceRow, group);
  }
  const items: UpcomingContent[] = [...groups.entries()].map(([sourceRow, posts]) => {
    const first = posts[0];
    const targets = [...new Map(posts.map((post) => [`${post.network}|${post.account}`, { network: post.network, account: post.account }])).values()];
    return {
      sourceRow,
      plannedDate: first.plannedDate,
      title: first.title,
      description: first.description,
      campaign: first.campaign,
      hasPublishedLinkHint: posts.some((post) => Boolean(post.publishedLinkHint)),
      targets,
    };
  });
  return {
    asOf,
    through: items.at(-1)?.plannedDate ?? null,
    plannedContents: items.length,
    plannedTargets: future.length,
    items,
  };
}

export function selectOfficialPosts(planned: PlannedPost[], actual: ActualPost[]) {
  const hints = new Map<string, Array<{ network: string; group: string }>>();
  for (const post of planned) {
    for (const url of extractUrls(post.publishedLinkHint)) {
      const key = canonicalizeUrl(url);
      if (!key) continue;
      const entries = hints.get(key) ?? [];
      entries.push({ network: post.network, group: post.accountGroup });
      hints.set(key, entries);
    }
  }
  const evidence = new Map<string, Map<string, number>>();
  const evidenceUrls = new Map<string, Set<string>>();
  for (const post of actual) {
    const canonicalUrl = canonicalizeUrl(post.url);
    const matchingHints = hints.get(canonicalUrl) ?? [];
    for (const hint of matchingHints) {
      if (hint.network !== post.network) continue;
      const groups = evidence.get(post.profileId) ?? new Map<string, number>();
      groups.set(hint.group, (groups.get(hint.group) ?? 0) + 1);
      evidence.set(post.profileId, groups);
      const urls = evidenceUrls.get(post.profileId) ?? new Set<string>();
      if (canonicalUrl) urls.add(canonicalUrl);
      evidenceUrls.set(post.profileId, urls);
    }
  }
  const inferredGroups = new Map<string, string>();
  for (const [profileId, groups] of evidence) {
    const dominant = [...groups.entries()].sort((a, b) => b[1] - a[1])[0];
    if (dominant) inferredGroups.set(profileId, dominant[0]);
  }
  const profileIds = new Set(config.officialProfileIds);
  const posts = actual
    .filter((post) => profileIds.has(post.profileId))
    .map((post) => ({ ...post, profileGroup: post.profileGroup || inferredGroups.get(post.profileId) || "" }));
  return { posts, profileIds, audit: buildOfficialProfileAudit(posts, evidenceUrls, planned) };
}

function buildOfficialProfileAudit(posts: ActualPost[], evidenceUrls: Map<string, Set<string>>, planned: PlannedPost[]) {
  const groups = new Map<string, ActualPost[]>();
  for (const post of posts) {
    const group = groups.get(post.profileId) ?? [];
    group.push(post);
    groups.set(post.profileId, group);
  }
  return [...groups.entries()].map(([profileId, rows]) => ({
    profileId,
    profile: [...new Set(rows.map((row) => row.profile))].join(" / "),
    networks: [...new Set(rows.map((row) => row.network))],
    evidenceUrls: evidenceUrls.get(profileId)?.size ?? 0,
    exactPlanMatches: rows.filter((row) => planned.some((plan) => plan.network === row.network && Boolean(plan.normalizedDescription) && plan.normalizedDescription === row.normalizedDescription && Math.abs(differenceInCalendarDays(parseISO(row.actualDate), parseISO(plan.plannedDate))) <= 2)).length,
    rows: rows.length,
    firstDate: rows.map((row) => row.actualDate).sort()[0] ?? "",
    lastDate: rows.map((row) => row.actualDate).sort().at(-1) ?? "",
  })).sort((a, b) => b.exactPlanMatches - a.exactPlanMatches || b.evidenceUrls - a.evidenceUrls || b.rows - a.rows);
}

function themes(value: string, emptyLabel: string) {
  const canonicalLabels: Record<string, string> = {
    economiadebolsillo: "Economía de Bolsillo",
    confrontacionpolitica: "Confrontación Política",
    modernizacionytecnologia: "Modernización y Tecnología",
    escapelibre: "Escape Libre",
    sintematicapublicada: "Sin temática publicada",
    sintematicaplanificada: "Sin temática planificada",
  };
  const values = value.split(/[,;|]/u).map((theme) => {
    const trimmed = theme.trim();
    const key = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("es").replace(/[^a-z0-9]/gu, "");
    return canonicalLabels[key] ?? trimmed;
  }).filter(Boolean);
  return values.length ? [...new Set(values)] : [emptyLabel];
}

function engagementSummary(posts: ActualPost[]) {
  const top = [...posts].sort((a, b) => b.engagement - a.engagement || b.reach - a.reach)[0];
  return {
    posts: posts.length,
    reach: posts.reduce((sum, post) => sum + post.reach, 0),
    engagement: posts.reduce((sum, post) => sum + post.engagement, 0),
    likes: posts.reduce((sum, post) => sum + post.likes, 0),
    comments: posts.reduce((sum, post) => sum + post.comments, 0),
    shares: posts.reduce((sum, post) => sum + post.shares, 0),
    topPost: top ? { id: top.id, description: top.description, url: top.url, date: top.actualDate, profile: top.profile, engagement: top.engagement, reach: top.reach } : null,
  };
}

function buildAnalytics(planned: PlannedPost[], actual: ActualPost[], records: ReportRecord[]): ReportAnalytics {
  const networks = ["facebook", "instagram", "tiktok", "youtube", "twitter", "otro"] as SocialNetwork[];
  const postsByNetwork = networks.map((network) => ({
    network,
    planned: planned.filter((post) => post.network === network).length,
    posted: actual.filter((post) => post.network === network).length,
    matched: records.filter((record) => record.plannedId && record.actualId && record.network === network).length,
  })).filter((row) => row.planned || row.posted);

  const plannedThemes = new Map<string, number>();
  for (const post of planned) for (const theme of themes(post.campaign, "Sin temática planificada")) plannedThemes.set(theme, (plannedThemes.get(theme) ?? 0) + 1);
  const postedThemes = new Map<string, number>();
  for (const post of actual) for (const theme of themes(post.campaign, "Sin temática publicada")) postedThemes.set(theme, (postedThemes.get(theme) ?? 0) + 1);
  const themeRows = [...new Set([...plannedThemes.keys(), ...postedThemes.keys()])]
    .map((theme) => ({ theme, planned: plannedThemes.get(theme) ?? 0, posted: postedThemes.get(theme) ?? 0 }))
    .sort((a, b) => b.planned + b.posted - (a.planned + a.posted));

  const engagementGroups = new Map<string, { theme: string; network: SocialNetwork; posts: ActualPost[] }>();
  for (const post of actual) {
    for (const theme of themes(post.campaign, "Sin temática publicada")) {
      const key = `${post.network}|${theme}`;
      const group = engagementGroups.get(key) ?? { theme, network: post.network, posts: [] };
      group.posts.push(post);
      engagementGroups.set(key, group);
    }
  }
  const engagementByThemeNetwork: ThemeNetworkMetric[] = [...engagementGroups.values()]
    .map((group) => ({ theme: group.theme, network: group.network, ...engagementSummary(group.posts) }))
    .sort((a, b) => b.engagement - a.engagement || b.reach - a.reach);
  const engagementByNetwork = networks
    .map((network) => ({ network, ...engagementSummary(actual.filter((post) => post.network === network)) }))
    .filter((row) => row.posts > 0)
    .sort((a, b) => b.engagement - a.engagement || b.reach - a.reach);
  const engagementByTheme = [...new Set(actual.flatMap((post) => themes(post.campaign, "Sin temática publicada")))]
    .map((theme) => ({ theme, ...engagementSummary(actual.filter((post) => themes(post.campaign, "Sin temática publicada").includes(theme))) }))
    .sort((a, b) => b.engagement - a.engagement || b.reach - a.reach);

  return {
    postsByNetwork,
    themes: themeRows,
    engagementByNetwork,
    engagementByTheme,
    engagementByThemeNetwork,
    totals: {
      reach: actual.reduce((sum, post) => sum + post.reach, 0),
      engagement: actual.reduce((sum, post) => sum + post.engagement, 0),
      likes: actual.reduce((sum, post) => sum + post.likes, 0),
      comments: actual.reduce((sum, post) => sum + post.comments, 0),
      shares: actual.reduce((sum, post) => sum + post.shares, 0),
    },
  };
}

export async function buildReport(input: boolean | { force?: boolean; weekEnd?: string } = false): Promise<ReportResponse> {
  const options = typeof input === "boolean" ? { force: input, weekEnd: undefined } : input;
  const window = options.weekEnd === "all" ? allReportingWindow(new Date()) : reportingWindow(new Date(), options.weekEnd);
  const cacheKey = window.isAll ? `all:${window.dataThrough}` : window.to;
  const cached = cache.get(cacheKey);
  if (!options.force && cached && cached.expiresAt > Date.now()) return cached.value;
  const sheet = await loadPlannedPosts();
  const availableWeeks = availableReportingWeeks(sheet.posts);
  const upcoming = buildUpcomingContent(sheet.posts);
  const planned = sheet.posts.filter((post) => post.plannedDate >= window.from && post.plannedDate <= window.dataThrough);
  const database = await loadActualPosts(window.from, window.dataThrough);
  const official = selectOfficialPosts(sheet.posts, database.posts.filter((post) => !isStoryPost(post)));
  const reviewDecisions = await loadReviewDecisions();
  const records = matchPosts(planned, official.posts, window, reviewDecisions);
  const weeklySourceRows = new Set(planned.map((post) => post.sourceRow));
  const duplicateCounts = new Map<string, number>();
  for (const post of planned) {
    const key = `${post.plannedDate}|${post.network}|${post.accountGroup}|${post.normalizedDescription}`;
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }
  const value: ReportResponse = {
    generatedAt: new Date().toISOString(),
    sourceFreshness: { sheetFetchedAt: sheet.fetchedAt, databaseMaxPublishedAt: database.maxPublishedAt },
    config: { toleranceDays: config.toleranceDays, approximateThreshold: config.approximateThreshold, doubtfulThreshold: config.doubtfulThreshold },
    availableWeeks,
    upcoming,
    window,
    metrics: calculateMetrics(records, official.posts.length),
    analytics: buildAnalytics(planned, official.posts, records),
    quality: {
      plannedRows: weeklySourceRows.size,
      plannedExpanded: planned.length,
      plannedEmptyDescriptions: planned.filter((post) => !post.normalizedDescription).length,
      plannedEmptyDates: 0,
      plannedDuplicateKeys: [...duplicateCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0),
      actualRowsConsidered: official.posts.length,
      actualEmptyDescriptions: official.posts.filter((post) => !post.normalizedDescription).length,
      actualDuplicatePostIds: official.posts.length - new Set(official.posts.map((post) => post.postId)).size,
      deletedActualPosts: official.posts.filter((post) => post.deleted).length,
      sheetHasTypeColumn: sheet.hasTypeColumn,
      officialRule: `Publicaciones reales limitadas a ${config.officialProfileIds.length} profile_id configurados explícitamente como oficiales; las historias se excluyen completamente.`,
      officialProfileIds: config.officialProfileIds.length,
      officialProfiles: official.audit,
      tableName: config.databaseTable,
      sheetHasThemeColumn: sheet.hasThemeColumn,
    },
    records,
  };
  cache.set(cacheKey, { value, expiresAt: Date.now() + config.cacheMinutes * 60_000 });
  return value;
}
