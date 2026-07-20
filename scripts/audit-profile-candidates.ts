import "dotenv/config";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { closeDatabase, loadActualPosts } from "../src/server/data/database.js";
import { loadPlannedPosts } from "../src/server/data/sheet.js";
import { canonicalizeUrl, extractUrls } from "../src/server/matching/normalize.js";

try {
  const sheet = await loadPlannedPosts();
  const dates = sheet.posts.map((post) => post.plannedDate).filter(Boolean).sort();
  const database = await loadActualPosts(format(addDays(parseISO(dates[0]), -45), "yyyy-MM-dd"), format(addDays(parseISO(dates.at(-1)!), 45), "yyyy-MM-dd"));
  const hints = new Set(sheet.posts.flatMap((post) => extractUrls(post.publishedLinkHint).map(canonicalizeUrl)).filter(Boolean));
  const groups = new Map<string, {
    profileId: string;
    profile: string;
    network: string;
    rows: number;
    exactCopyAndNetwork: number;
    exactCopyNetworkAndDate: number;
    urlEvidence: number;
  }>();
  for (const actual of database.posts) {
    const key = `${actual.profileId}|${actual.network}`;
    const group = groups.get(key) ?? { profileId: actual.profileId, profile: actual.profile, network: actual.network, rows: 0, exactCopyAndNetwork: 0, exactCopyNetworkAndDate: 0, urlEvidence: 0 };
    group.rows += 1;
    if (hints.has(canonicalizeUrl(actual.url))) group.urlEvidence += 1;
    const matchingPlans = sheet.posts.filter((plan) => plan.network === actual.network && Boolean(plan.normalizedDescription) && plan.normalizedDescription === actual.normalizedDescription);
    if (matchingPlans.length) {
      group.exactCopyAndNetwork += 1;
      if (matchingPlans.some((plan) => Math.abs(differenceInCalendarDays(parseISO(actual.actualDate), parseISO(plan.plannedDate))) <= 2)) group.exactCopyNetworkAndDate += 1;
    }
    groups.set(key, group);
  }
  console.log(JSON.stringify([...groups.values()]
    .filter((group) => group.exactCopyAndNetwork > 0 || group.urlEvidence > 0)
    .sort((a, b) => b.exactCopyNetworkAndDate - a.exactCopyNetworkAndDate || b.urlEvidence - a.urlEvidence || b.exactCopyAndNetwork - a.exactCopyAndNetwork), null, 2));
} finally {
  await closeDatabase();
}
