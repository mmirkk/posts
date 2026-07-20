import { eachDayOfInterval, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { ReportRecord } from "../shared/types";

export interface DailyTimelinePoint {
  key: string;
  label: string;
  planned: number;
  realized: number;
  realizedPlanned: number;
  realizedUnplanned: number;
}

export function buildDailyTimeline(records: ReportRecord[], from: string, to: string): DailyTimelinePoint[] {
  const points = new Map(eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map((date) => {
    const key = format(date, "yyyy-MM-dd");
    return [key, { key, label: format(date, "EEE d", { locale: es }), planned: 0, realized: 0, realizedPlanned: 0, realizedUnplanned: 0 } satisfies DailyTimelinePoint];
  }));
  const actualIdsByDay = new Map<string, Map<string, boolean>>();
  for (const record of records) {
    if (record.plannedId && record.plannedDate && points.has(record.plannedDate)) points.get(record.plannedDate)!.planned += 1;
    if (record.actualId && record.actualDate && points.has(record.actualDate)) {
      const ids = actualIdsByDay.get(record.actualDate) ?? new Map<string, boolean>();
      ids.set(record.actualId, Boolean(record.plannedId) || Boolean(ids.get(record.actualId)));
      actualIdsByDay.set(record.actualDate, ids);
    }
  }
  for (const [date, ids] of actualIdsByDay) {
    const point = points.get(date)!;
    point.realizedPlanned = [...ids.values()].filter(Boolean).length;
    point.realizedUnplanned = ids.size - point.realizedPlanned;
    point.realized = ids.size;
  }
  return [...points.values()];
}

export function recordsForDay(records: ReportRecord[], day: string) {
  const planned = records.filter((record) => record.plannedId && record.plannedDate === day);
  const actual = [...new Map(records
    .filter((record) => record.actualId && record.actualDate === day)
    .map((record) => [record.actualId!, record])).values()];
  return { planned, actual };
}
