import type { ReportRecord } from "../shared/types";

export type ContentStatus = "published" | "not_published";

export interface PlannedContent {
  key: string;
  sourceRow: number | null;
  title: string;
  description: string;
  plannedDate: string;
  campaign: string;
  targets: ReportRecord[];
  matched: number;
  review: number;
  incomplete: number;
  status: ContentStatus;
}

export function groupPlannedContent(records: ReportRecord[]): PlannedContent[] {
  const groups = new Map<string, ReportRecord[]>();
  for (const record of records) {
    if (!record.plannedId) continue;
    const key = record.plannedSourceRow === null ? record.plannedId : `row-${record.plannedSourceRow}`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, targets]) => {
    const first = targets[0];
    const matched = targets.filter((target) => Boolean(target.actualId)).length;
    return {
      key,
      sourceRow: first.plannedSourceRow,
      title: first.title,
      description: first.plannedDescription,
      plannedDate: first.plannedDate ?? "",
      campaign: first.campaign,
      targets: [...targets].sort((left, right) => left.network.localeCompare(right.network) || left.account.localeCompare(right.account, "es")),
      matched,
      review: targets.filter((target) => target.status === "coincidencia_dudosa" && !target.actualId).length,
      incomplete: targets.filter((target) => target.status === "datos_incompletos" && !target.actualId).length,
      status: matched > 0 ? "published" : "not_published",
    } satisfies PlannedContent;
  }).sort((left, right) => left.plannedDate.localeCompare(right.plannedDate) || left.key.localeCompare(right.key));
}

export function summarizePlannedContent(records: ReportRecord[]) {
  const contents = groupPlannedContent(records);
  const published = contents.filter((content) => content.status === "published").length;
  const plannedTargets = contents.reduce((sum, content) => sum + content.targets.length, 0);
  const matchedTargets = contents.reduce((sum, content) => sum + content.matched, 0);
  return {
    contents,
    plannedContents: contents.length,
    publishedContents: published,
    unpublishedContents: contents.filter((content) => content.status === "not_published").length,
    unfulfilledContents: contents.length - published,
    plannedTargets,
    matchedTargets,
  };
}
