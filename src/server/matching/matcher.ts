import { differenceInCalendarDays, parseISO } from "date-fns";
import type { ActualPost, ManualReviewDecision, MatchType, PlannedPost, ReportRecord } from "../../shared/types.js";
import { config } from "../config.js";
import { canonicalizeUrl, extractUrls, normalizeDescription, normalizeForSimilarity } from "./normalize.js";
import { describeDifferences, descriptionContainmentSimilarity, descriptionSimilarity } from "./similarity.js";

interface Candidate {
  planned: PlannedPost;
  actual: ActualPost;
  exact: boolean;
  urlMatch: boolean;
  profileMatch: boolean;
  titleMatch: boolean;
  containmentMatch: boolean;
  similarity: number;
  score: number;
  dayDifference: number;
}

const TITLE_MATCH_WINDOW_DAYS = 14;
const TITLE_SIMILARITY_THRESHOLD = 0.58;
const SHORT_TITLE_SIMILARITY_THRESHOLD = 0.72;
const TITLE_STOP_WORDS = new Set(["a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "o", "para", "por", "que", "un", "una", "y"]);

const descriptionForMatching = (plan: PlannedPost) => plan.matchingDescription || plan.description;
const normalizedForMatching = (plan: PlannedPost) => plan.matchingNormalizedDescription || plan.normalizedDescription;

function titleReference(plan: PlannedPost) {
  const normalized = normalizeForSimilarity(plan.title);
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.length >= 2 && normalized.length >= 12 ? normalized : "";
}

function titleEvidence(plan: PlannedPost, actual: ActualPost) {
  const normalizedTitle = titleReference(plan);
  if (!normalizedTitle) return { matches: false, contained: false, similarity: 0 };
  const normalizedActual = normalizeForSimilarity(actual.description);
  const contained = normalizedActual.includes(normalizedTitle);
  const similarity = descriptionSimilarity(plan.title, actual.description);
  const titleTokens = normalizedTitle.match(/[\p{L}\p{N}]+/gu) ?? [];
  const meaningfulTitleTokens = [...new Set(titleTokens.filter((token) => !TITLE_STOP_WORDS.has(token)))];
  const actualTokens = new Set(normalizedActual.match(/[\p{L}\p{N}]+/gu) ?? []);
  const meaningfulMatches = meaningfulTitleTokens.filter((token) => actualTokens.has(token)).length;
  const meaningfulCoverage = meaningfulMatches / Math.max(meaningfulTitleTokens.length, 1);
  const tokenContained = meaningfulTitleTokens.length >= 2 && meaningfulMatches >= 2 && meaningfulCoverage >= 0.8;
  const threshold = titleTokens.length === 2 ? SHORT_TITLE_SIMILARITY_THRESHOLD : TITLE_SIMILARITY_THRESHOLD;
  const effectiveSimilarity = tokenContained ? Math.max(similarity, Math.min(0.96, 0.82 + meaningfulCoverage * 0.14)) : similarity;
  return { matches: contained || tokenContained || effectiveSimilarity >= threshold, contained: contained || tokenContained, similarity: effectiveSimilarity };
}

const dayDifference = (plannedDate: string, actualDate: string) => {
  if (!plannedDate || !actualDate) return 0;
  return differenceInCalendarDays(parseISO(actualDate), parseISO(plannedDate));
};

function hasCompatibleProfile(plan: PlannedPost, actual: ActualPost) {
  return plan.accountGroup === actual.profileGroup || (plan.accountGroup === "x" && actual.profileGroup === "manuel");
}

function hasMatchingUrl(plan: PlannedPost, actual: ActualPost, requireCompatibleProfile = false) {
  if (!plan.publishedLinkHint || !actual.url) return false;
  if (plan.network !== actual.network) return false;
  if (requireCompatibleProfile && !hasCompatibleProfile(plan, actual)) return false;
  const actualUrl = canonicalizeUrl(actual.url);
  return Boolean(actualUrl) && extractUrls(plan.publishedLinkHint).some((url) => canonicalizeUrl(url) === actualUrl);
}

function scoreCandidate(plan: PlannedPost, actual: ActualPost, similarity: number, titleMatch = false) {
  const days = Math.abs(dayDifference(plan.plannedDate, actual.actualDate));
  const temporal = Math.max(0, 1 - days / Math.max(config.candidateWindowDays, 1));
  const network = plan.network === actual.network ? 1 : 0;
  const profile = hasCompatibleProfile(plan, actual) ? 1 : 0;
  const url = hasMatchingUrl(plan, actual) ? 1 : 0;
  return Math.min(1, similarity * 0.68 + network * 0.12 + profile * 0.08 + temporal * 0.07 + url * 0.2 + (titleMatch ? 0.12 : 0));
}

function candidateList(plan: PlannedPost, actualPosts: ActualPost[], tokenCache: Map<string, Set<string>>): Candidate[] {
  const matchingDescription = descriptionForMatching(plan);
  const matchingNormalized = normalizedForMatching(plan);
  const planTokens = new Set(normalizeForSimilarity(matchingDescription).match(/[\p{L}\p{N}]+/gu) ?? []);
  const compatibleDestination = (actual: ActualPost) => {
    return plan.network === actual.network && hasCompatibleProfile(plan, actual);
  };
  const normalizedTitle = titleReference(plan);
  const urlPosts = actualPosts.filter((actual) => hasMatchingUrl(plan, actual));
  const exactPosts = matchingNormalized
    ? actualPosts.filter((actual) => compatibleDestination(actual) && matchingNormalized === actual.normalizedDescription)
    : [];
  const titlePosts = normalizedTitle
    ? actualPosts.filter((actual) => compatibleDestination(actual)
      && Math.abs(dayDifference(plan.plannedDate, actual.actualDate)) <= TITLE_MATCH_WINDOW_DAYS
      && titleEvidence(plan, actual).matches)
    : [];
  const approximatePosts = actualPosts.filter((actual) => {
    if (!matchingNormalized) return false;
    if (!actual.normalizedDescription || matchingNormalized === actual.normalizedDescription) return false;
    if (!compatibleDestination(actual)) return false;
    if (Math.abs(dayDifference(plan.plannedDate, actual.actualDate)) > config.candidateWindowDays) return false;
    if (descriptionContainmentSimilarity(matchingDescription, actual.description) >= 0.9) return true;
    const actualTokens = tokenCache.get(actual.id) ?? new Set<string>();
    let overlap = 0;
    for (const token of planTokens) if (actualTokens.has(token)) overlap += 1;
    return overlap >= (planTokens.size <= 3 ? 1 : 2);
  });
  const uniquePosts = [...new Map([...urlPosts, ...exactPosts, ...titlePosts, ...approximatePosts].map((actual) => [actual.id, actual])).values()];
  return uniquePosts.flatMap((actual): Candidate[] => {
    const urlMatch = hasMatchingUrl(plan, actual);
    const profileMatch = hasCompatibleProfile(plan, actual);
    const title = titleEvidence(plan, actual);
    const titleMatch = title.matches;
    const containmentSimilarity = descriptionContainmentSimilarity(matchingDescription, actual.description);
    const containmentMatch = containmentSimilarity >= 0.9;
    if (!actual.normalizedDescription && !urlMatch) return [];
    const exact = Boolean(matchingNormalized) && matchingNormalized === actual.normalizedDescription;
    const days = dayDifference(plan.plannedDate, actual.actualDate);
    const similarity = exact
      ? 1
      : titleMatch
        ? title.similarity
        : matchingNormalized && actual.normalizedDescription
          ? Math.max(descriptionSimilarity(matchingDescription, actual.description), containmentSimilarity)
          : 0;
    if (!urlMatch && !exact && !titleMatch && !containmentMatch && similarity < config.doubtfulThreshold) return [];
    return [{ planned: plan, actual, exact, urlMatch, profileMatch, titleMatch, containmentMatch, similarity, score: scoreCandidate(plan, actual, similarity, titleMatch), dayDifference: days }];
  }).sort((a, b) => b.score - a.score || Math.abs(a.dayDifference) - Math.abs(b.dayDifference));
}

function candidateForManualDecision(plan: PlannedPost, actual: ActualPost): Candidate {
  const matchingDescription = descriptionForMatching(plan);
  const matchingNormalized = normalizedForMatching(plan);
  const exact = Boolean(matchingNormalized) && matchingNormalized === actual.normalizedDescription;
  const urlMatch = hasMatchingUrl(plan, actual);
  const profileMatch = hasCompatibleProfile(plan, actual);
  const title = titleEvidence(plan, actual);
  const containmentSimilarity = descriptionContainmentSimilarity(matchingDescription, actual.description);
  const similarity = exact
    ? 1
    : title.matches
      ? title.similarity
      : Math.max(descriptionSimilarity(matchingDescription || plan.title, actual.description), containmentSimilarity);
  return {
    planned: plan,
    actual,
    exact,
    urlMatch,
    profileMatch,
    titleMatch: title.matches,
    containmentMatch: containmentSimilarity >= 0.9,
    similarity,
    score: scoreCandidate(plan, actual, similarity, title.matches),
    dayDifference: dayDifference(plan.plannedDate, actual.actualDate),
  };
}

function matchTypeForCandidate(candidate: Candidate): Extract<MatchType, "exacta" | "por_url" | "por_titulo" | "aproximada"> {
  if (candidate.exact) return "exacta";
  if (candidate.urlMatch) return "por_url";
  if (candidate.titleMatch) return "por_titulo";
  return "aproximada";
}

function alternatives(candidates: Candidate[]) {
  return candidates.slice(0, 4).map((candidate) => ({
    actualId: candidate.actual.id,
    description: candidate.actual.description,
    similarity: candidate.similarity,
    date: candidate.actual.actualDate,
    network: candidate.actual.network,
  }));
}

function isAmbiguous(candidates: Candidate[]) {
  if (candidates.length < 2) return false;
  const [first, second] = candidates;
  if (first.actual.id === second.actual.id) return false;
  if (first.exact && second.exact && Math.abs(first.dayDifference) < Math.abs(second.dayDifference)) return false;
  return first.score - second.score <= config.ambiguityDelta;
}

function enrichPlansFromLinkedDescriptions(plannedPosts: PlannedPost[], actualPosts: ActualPost[]) {
  const referenceByPlanId = new Map<string, ActualPost>();
  const referenceBySourceRow = new Map<number, ActualPost>();
  for (const plan of plannedPosts) {
    if (!plan.publishedLinkHint) continue;
    const linked = actualPosts.find((actual) => actual.normalizedDescription && hasMatchingUrl(plan, actual));
    if (!linked) continue;
    referenceByPlanId.set(plan.id, linked);
    const current = referenceBySourceRow.get(plan.sourceRow);
    if (!current || linked.description.length > current.description.length) referenceBySourceRow.set(plan.sourceRow, linked);
  }
  return plannedPosts.map((plan) => {
    const reference = referenceByPlanId.get(plan.id) ?? referenceBySourceRow.get(plan.sourceRow);
    if (plan.normalizedDescription || !reference) return plan;
    return {
      ...plan,
      matchingDescription: reference.description,
      matchingNormalizedDescription: reference.normalizedDescription,
      matchingDescriptionFromUrl: true,
      incomplete: false,
    };
  });
}

function temporalStatus(diff: number | null) {
  if (diff === null) return "no_aplica" as const;
  if (diff === 0) return "en_fecha" as const;
  if (Math.abs(diff) <= config.toleranceDays) return "dentro_tolerancia" as const;
  return diff < 0 ? "anticipada" as const : "demorada" as const;
}

function recordForMatch(candidate: Candidate, matchType: Extract<MatchType, "exacta" | "por_url" | "por_titulo" | "aproximada">, manuallyApproved = false): ReportRecord {
  const { planned, actual } = candidate;
  const temporal = temporalStatus(candidate.dayDifference);
  const observations: string[] = [];
  if (actual.deleted) observations.push("La publicación figura eliminada en la base de datos.");
  if (!actual.url) observations.push("La publicación real no tiene URL.");
  if (candidate.urlMatch) observations.push(matchType === "por_url" ? "Coincidencia confirmada mediante el enlace publicado informado en la planificación." : "El enlace publicado del Sheet también corrobora la coincidencia.");
  if (candidate.urlMatch && !candidate.profileMatch) observations.push(`El enlace publicado confirma el post en la red planificada, aunque la cuenta informada en el Sheet (${planned.account}) difiere de la cuenta real (${actual.profile}).`);
  if (candidate.containmentMatch && !candidate.exact) observations.push("El texto publicado conserva un fragmento sustancial o el inicio distintivo del copy planificado.");
  if (planned.matchingDescriptionFromUrl) observations.push("La descripción usada para comparar se obtuvo del post encontrado mediante el enlace informado en la misma fila de planificación.");
  if (manuallyApproved) observations.push("Coincidencia confirmada mediante revisión manual.");
  if (matchType === "por_titulo") observations.push(planned.normalizedDescription
    ? "La coincidencia se confirmó por similitud entre el título planificado y el texto publicado, con la misma red y cuenta. El Copy planificado presenta diferencias."
    : "La planificación no tenía Copy; la coincidencia se confirmó por similitud entre el título y el texto publicado, con la misma red y cuenta.");
  if (planned.network !== actual.network) observations.push(`La red planificada (${planned.network}) difiere de la real (${actual.network}).`);
  const descriptionChanged = matchType === "por_url" && Boolean(planned.normalizedDescription) && planned.normalizedDescription !== actual.normalizedDescription;
  const titleDescriptionChanged = matchType === "por_titulo" && Boolean(planned.normalizedDescription) && planned.normalizedDescription !== actual.normalizedDescription;
  const titleContained = matchType === "por_titulo" && titleEvidence(planned, actual).contained;
  const status = matchType === "aproximada" || descriptionChanged || titleDescriptionChanged
    ? "modificada"
    : temporal === "anticipada"
      ? "anticipada"
      : temporal === "demorada"
        ? "demorada"
        : "segun_plan";
  return {
    id: `match-${planned.id}-${actual.id}`,
    plannedId: planned.id,
    plannedSourceRow: planned.sourceRow,
    actualId: actual.id,
    plannedDate: planned.plannedDate,
    actualDate: actual.actualDate,
    dayDifference: candidate.dayDifference,
    plannedDescription: planned.description,
    actualDescription: actual.description,
    plannedNormalized: matchType === "por_titulo" ? normalizeDescription(planned.title) : normalizedForMatching(planned),
    actualNormalized: actual.normalizedDescription,
    matchType,
    similarity: matchType === "por_url" && !planned.normalizedDescription ? null : candidate.similarity,
    confidence: candidate.score,
    status,
    temporalStatus: temporal,
    network: actual.network,
    account: actual.profile,
    campaign: planned.campaign !== "Sin temática planificada" ? planned.campaign : actual.campaign,
    postUrl: actual.url,
    mediaType: actual.mediaType,
    mediaUrls: actual.mediaUrls,
    title: planned.title,
    observations,
    manualReview: manuallyApproved ? false : (matchType === "aproximada" && candidate.similarity < 0.9) || (matchType === "por_titulo" && !titleContained && candidate.similarity < 0.7),
    differences: matchType === "aproximada" || descriptionChanged || titleDescriptionChanged ? describeDifferences(planned.description || planned.title, actual.description) : null,
    alternativeCandidates: [],
    deleted: actual.deleted,
    reach: actual.reach,
    engagement: actual.engagement,
    likes: actual.likes,
    comments: actual.comments,
    shares: actual.shares,
  };
}

function recordForUnmatched(plan: PlannedPost): ReportRecord {
  const incomplete = !normalizedForMatching(plan) && !titleReference(plan);
  return {
    id: `unmatched-${plan.id}`,
    plannedId: plan.id,
    plannedSourceRow: plan.sourceRow,
    actualId: null,
    plannedDate: plan.plannedDate || null,
    actualDate: null,
    dayDifference: null,
    plannedDescription: plan.description,
    actualDescription: "",
    plannedNormalized: plan.normalizedDescription,
    actualNormalized: "",
    matchType: "sin_coincidencia",
    similarity: null,
    confidence: null,
    status: incomplete ? "datos_incompletos" : "no_publicada",
    temporalStatus: "no_aplica",
    network: plan.network,
    account: plan.account,
    campaign: plan.campaign,
    postUrl: "",
    mediaType: "",
    mediaUrls: [],
    title: plan.title,
    observations: incomplete ? [!plan.description ? "La planificación no tiene Copy." : "La planificación no tiene una fecha válida."] : ["No se encontró una publicación real suficientemente similar."],
    manualReview: incomplete,
    differences: null,
    alternativeCandidates: [],
    deleted: false,
    reach: 0,
    engagement: 0,
    likes: 0,
    comments: 0,
    shares: 0,
  };
}

function recordForDoubtful(plan: PlannedPost, candidates: Candidate[]): ReportRecord {
  const best = candidates[0];
  return {
    id: `doubtful-${plan.id}`,
    plannedId: plan.id,
    plannedSourceRow: plan.sourceRow,
    actualId: null,
    plannedDate: plan.plannedDate || null,
    actualDate: best?.actual.actualDate ?? null,
    dayDifference: best?.dayDifference ?? null,
    plannedDescription: plan.description,
    actualDescription: best?.actual.description ?? "",
    plannedNormalized: normalizedForMatching(plan),
    actualNormalized: best?.actual.normalizedDescription ?? "",
    matchType: "dudosa",
    similarity: best?.similarity ?? null,
    confidence: best?.score ?? null,
    status: "coincidencia_dudosa",
    temporalStatus: best ? temporalStatus(best.dayDifference) : "no_aplica",
    network: plan.network,
    account: plan.account,
    campaign: plan.campaign !== "Sin temática planificada" ? plan.campaign : best?.actual.campaign ?? plan.campaign,
    postUrl: best?.actual.url ?? "",
    mediaType: best?.actual.mediaType ?? "",
    mediaUrls: best?.actual.mediaUrls ?? [],
    title: plan.title,
    observations: [isAmbiguous(candidates) ? "Hay varias publicaciones con una puntuación equivalente." : "La similitud no alcanza el umbral de asignación automática."],
    manualReview: true,
    differences: best ? describeDifferences(descriptionForMatching(plan), best.actual.description) : null,
    alternativeCandidates: alternatives(candidates),
    deleted: best?.actual.deleted ?? false,
    reach: best?.actual.reach ?? 0,
    engagement: best?.actual.engagement ?? 0,
    likes: best?.actual.likes ?? 0,
    comments: best?.actual.comments ?? 0,
    shares: best?.actual.shares ?? 0,
  };
}

function recordForUnplanned(actual: ActualPost): ReportRecord {
  return {
    id: `unplanned-${actual.id}`,
    plannedId: null,
    plannedSourceRow: null,
    actualId: actual.id,
    plannedDate: null,
    actualDate: actual.actualDate,
    dayDifference: null,
    plannedDescription: "",
    actualDescription: actual.description,
    plannedNormalized: "",
    actualNormalized: actual.normalizedDescription,
    matchType: "no_aplica",
    similarity: null,
    confidence: null,
    status: "no_planificada",
    temporalStatus: "no_aplica",
    network: actual.network,
    account: actual.profile,
    campaign: actual.campaign,
    postUrl: actual.url,
    mediaType: actual.mediaType,
    mediaUrls: actual.mediaUrls,
    title: "Publicación no planificada",
    observations: [actual.deleted ? "Publicación no planificada y eliminada." : "No se relacionó con ninguna publicación planificada."],
    manualReview: false,
    differences: null,
    alternativeCandidates: [],
    deleted: actual.deleted,
    reach: actual.reach,
    engagement: actual.engagement,
    likes: actual.likes,
    comments: actual.comments,
    shares: actual.shares,
  };
}

export function matchPosts(plannedPosts: PlannedPost[], actualPosts: ActualPost[], range: { from: string; to: string }, reviewDecisions: ManualReviewDecision[] = []): ReportRecord[] {
  plannedPosts = enrichPlansFromLinkedDescriptions(plannedPosts, actualPosts);
  const tokenCache = new Map(actualPosts.map((actual) => [actual.id, new Set(normalizeForSimilarity(actual.description).match(/[\p{L}\p{N}]+/gu) ?? [])]));
  const rejectedPairs = new Set(reviewDecisions.filter((item) => item.decision === "rejected").map((item) => `${item.plannedId}|${item.actualId}`));
  const candidatesByPlan = new Map(plannedPosts.map((plan) => [plan.id, candidateList(plan, actualPosts, tokenCache)
    .filter((candidate) => !rejectedPairs.has(`${plan.id}|${candidate.actual.id}`))]));
  const assignedPlan = new Set<string>();
  const assignedActual = new Set<string>();
  const doubtful = new Map<string, Candidate[]>();
  const matches: ReportRecord[] = [];

  for (const decision of reviewDecisions.filter((item) => item.decision === "approved")) {
    const plan = plannedPosts.find((item) => item.id === decision.plannedId);
    const actual = actualPosts.find((item) => item.id === decision.actualId);
    if (!plan || !actual || assignedPlan.has(plan.id) || assignedActual.has(actual.id)) continue;
    const candidate = (candidatesByPlan.get(plan.id) ?? []).find((item) => item.actual.id === actual.id)
      ?? candidateForManualDecision(plan, actual);
    assignedPlan.add(plan.id);
    assignedActual.add(actual.id);
    matches.push(recordForMatch(candidate, matchTypeForCandidate(candidate), true));
  }

  const urlPlans = plannedPosts.filter((plan) => !assignedPlan.has(plan.id)).map((plan) => ({ plan, candidates: (candidatesByPlan.get(plan.id) ?? []).filter((candidate) => candidate.urlMatch) }));
  const plansByUrlActual = new Map<string, typeof urlPlans>();
  for (const entry of urlPlans) {
    for (const actualId of new Set(entry.candidates.map((candidate) => candidate.actual.id))) {
      const owners = plansByUrlActual.get(actualId) ?? [];
      owners.push(entry);
      plansByUrlActual.set(actualId, owners);
    }
  }
  const blockedUrlPairs = new Set<string>();
  for (const [actualId, owners] of plansByUrlActual.entries()) {
    const strictOwners = owners.filter((entry) => entry.candidates.some((candidate) => candidate.actual.id === actualId && candidate.profileMatch));
    if (strictOwners.length === 1) {
      owners.filter((entry) => entry !== strictOwners[0]).forEach((entry) => blockedUrlPairs.add(`${entry.plan.id}|${actualId}`));
    } else if (strictOwners.length > 1) {
      strictOwners.forEach((entry) => doubtful.set(entry.plan.id, entry.candidates.filter((candidate) => candidate.profileMatch)));
      owners.filter((entry) => !strictOwners.includes(entry)).forEach((entry) => blockedUrlPairs.add(`${entry.plan.id}|${actualId}`));
    } else if (owners.length > 1) owners.forEach((entry) => doubtful.set(entry.plan.id, entry.candidates));
  }
  for (const entry of urlPlans) {
    const { plan } = entry;
    const candidates = entry.candidates.filter((candidate) => !blockedUrlPairs.has(`${plan.id}|${candidate.actual.id}`));
    if (doubtful.has(plan.id)) continue;
    if (candidates.length > 1 && isAmbiguous(candidates)) {
      doubtful.set(plan.id, candidates);
      continue;
    }
    const selected = candidates.find((candidate) => !assignedActual.has(candidate.actual.id));
    if (!selected) continue;
    assignedPlan.add(plan.id);
    assignedActual.add(selected.actual.id);
    matches.push(recordForMatch(selected, selected.exact && !selected.planned.matchingDescriptionFromUrl ? "exacta" : "por_url"));
  }

  const exactPlans = plannedPosts.filter((plan) => !plan.incomplete && !assignedPlan.has(plan.id) && !doubtful.has(plan.id)).map((plan) => ({ plan, candidates: (candidatesByPlan.get(plan.id) ?? []).filter((candidate) => candidate.exact && !assignedActual.has(candidate.actual.id)) }));
  const duplicatePlanGroups = new Map<string, typeof exactPlans>();
  for (const entry of exactPlans) {
    const key = `${entry.plan.plannedDate}|${entry.plan.network}|${entry.plan.accountGroup}|${normalizedForMatching(entry.plan)}`;
    const group = duplicatePlanGroups.get(key) ?? [];
    group.push(entry);
    duplicatePlanGroups.set(key, group);
  }
  for (const group of duplicatePlanGroups.values()) {
    if (group.length < 2) continue;
    const actualIds = new Set(group.flatMap((entry) => entry.candidates.map((candidate) => candidate.actual.id)));
    if (actualIds.size < group.length) group.forEach((entry) => entry.candidates.length && doubtful.set(entry.plan.id, entry.candidates));
  }
  for (const { plan, candidates } of exactPlans) {
    if (candidates.length && isAmbiguous(candidates)) doubtful.set(plan.id, candidates);
  }
  const exactPairs = exactPlans.flatMap(({ plan, candidates }) => doubtful.has(plan.id) ? [] : candidates).sort((a, b) => b.score - a.score);
  for (const candidate of exactPairs) {
    if (assignedPlan.has(candidate.planned.id) || assignedActual.has(candidate.actual.id)) continue;
    assignedPlan.add(candidate.planned.id);
    assignedActual.add(candidate.actual.id);
    matches.push(recordForMatch(candidate, "exacta"));
  }

  const titlePlans = plannedPosts
    .filter((plan) => Boolean(titleReference(plan)) && !assignedPlan.has(plan.id) && !doubtful.has(plan.id))
    .map((plan) => ({ plan, candidates: (candidatesByPlan.get(plan.id) ?? []).filter((candidate) => candidate.titleMatch && !assignedActual.has(candidate.actual.id)) }));
  const titleOwnersByActual = new Map<string, typeof titlePlans>();
  for (const entry of titlePlans) {
    for (const actualId of new Set(entry.candidates.map((candidate) => candidate.actual.id))) {
      const owners = titleOwnersByActual.get(actualId) ?? [];
      owners.push(entry);
      titleOwnersByActual.set(actualId, owners);
    }
  }
  for (const owners of titleOwnersByActual.values()) {
    if (owners.length > 1) owners.forEach((entry) => doubtful.set(entry.plan.id, entry.candidates));
  }
  for (const { plan, candidates } of titlePlans) {
    if (doubtful.has(plan.id) || !candidates.length) continue;
    if (isAmbiguous(candidates)) {
      doubtful.set(plan.id, candidates);
      continue;
    }
    const selected = candidates.find((candidate) => !assignedActual.has(candidate.actual.id));
    if (!selected) continue;
    assignedPlan.add(plan.id);
    assignedActual.add(selected.actual.id);
    matches.push(recordForMatch(selected, "por_titulo"));
  }

  const approximatePlans = plannedPosts.filter((plan) => !plan.incomplete && !assignedPlan.has(plan.id) && !doubtful.has(plan.id));
  for (const plan of approximatePlans) {
    const available = (candidatesByPlan.get(plan.id) ?? []).filter((candidate) => !candidate.exact && !assignedActual.has(candidate.actual.id));
    if (!available.length) continue;
    if (available[0].similarity < config.approximateThreshold || isAmbiguous(available)) {
      doubtful.set(plan.id, available);
      continue;
    }
    const selected = available[0];
    assignedPlan.add(plan.id);
    assignedActual.add(selected.actual.id);
    matches.push(recordForMatch(selected, "aproximada"));
  }

  const records = [...matches];
  const tentativeActual = new Set<string>();
  for (const plan of plannedPosts) {
    if (assignedPlan.has(plan.id)) continue;
    const uncertain = doubtful.get(plan.id);
    if (uncertain?.length) {
      uncertain.slice(0, 4).forEach((candidate) => tentativeActual.add(candidate.actual.id));
      records.push(recordForDoubtful(plan, uncertain));
    } else records.push(recordForUnmatched(plan));
  }
  for (const actual of actualPosts) {
    if (actual.actualDate < range.from || actual.actualDate > range.to) continue;
    if (!assignedActual.has(actual.id) && !tentativeActual.has(actual.id)) records.push(recordForUnplanned(actual));
  }
  return records.sort((a, b) => (b.plannedDate ?? b.actualDate ?? "").localeCompare(a.plannedDate ?? a.actualDate ?? ""));
}
