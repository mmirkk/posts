import "dotenv/config";
import { buildReport } from "../src/server/report.js";
import { closeDatabase } from "../src/server/data/database.js";

try {
  const report = await buildReport(true);
  const statusCounts = Object.entries(report.records.reduce<Record<string, number>>((counts, record) => {
    counts[record.status] = (counts[record.status] ?? 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]);
  const matchCounts = Object.entries(report.records.reduce<Record<string, number>>((counts, record) => {
    counts[record.matchType] = (counts[record.matchType] ?? 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]);
  const assignedActual = report.records.filter((record) => record.actualId).map((record) => record.actualId);
  const duplicateAssignments = assignedActual.length - new Set(assignedActual).size;
  console.log(JSON.stringify({
    metrics: report.metrics,
    quality: report.quality,
    window: report.window,
    analytics: {
      totals: report.analytics.totals,
      postsByNetwork: report.analytics.postsByNetwork,
      themes: report.analytics.themes.slice(0, 10),
      topEngagement: report.analytics.engagementByThemeNetwork.slice(0, 10),
    },
    statusCounts,
    matchCounts,
    recordCount: report.records.length,
    duplicateAssignments,
    generatedAt: report.generatedAt,
  }, null, 2));
} finally {
  await closeDatabase();
}
