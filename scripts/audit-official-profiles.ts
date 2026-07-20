import "dotenv/config";
import { addDays, format, parseISO } from "date-fns";
import { loadActualPosts, closeDatabase } from "../src/server/data/database.js";
import { loadPlannedPosts } from "../src/server/data/sheet.js";
import { selectOfficialPosts } from "../src/server/report.js";

try {
  const sheet = await loadPlannedPosts();
  const dates = sheet.posts.map((post) => post.plannedDate).filter(Boolean).sort();
  const from = format(addDays(parseISO(dates[0]), -45), "yyyy-MM-dd");
  const to = format(addDays(parseISO(dates.at(-1)!), 45), "yyyy-MM-dd");
  const database = await loadActualPosts(from, to);
  const official = selectOfficialPosts(sheet.posts, database.posts);
  console.log(JSON.stringify({
    profileCount: official.profileIds.size,
    selectedRows: official.posts.length,
    profiles: official.audit,
  }, null, 2));
} finally {
  await closeDatabase();
}
