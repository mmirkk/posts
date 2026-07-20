import { describe, expect, it } from "vitest";
import type { ReportRecord } from "../shared/types";
import { buildDailyTimeline } from "./dailyTimeline";

const record = (id: string, plannedDate: string | null, actualDate: string | null, actualId: string | null) => ({
  id,
  plannedId: plannedDate ? `plan-${id}` : null,
  plannedDate,
  actualDate,
  actualId,
} as ReportRecord);

describe("serie diaria planificado frente a realizado", () => {
  it("ubica cada métrica en su fecha propia y no duplica posts reales", () => {
    const points = buildDailyTimeline([
      record("a", "2026-07-06", "2026-07-07", "real-1"),
      record("b", "2026-07-06", null, null),
      record("duplicado", null, "2026-07-07", "real-1"),
    ], "2026-07-06", "2026-07-12");
    expect(points).toHaveLength(7);
    expect(points[0]).toMatchObject({ planned: 2, realized: 0 });
    expect(points[1]).toMatchObject({ planned: 0, realized: 1, realizedPlanned: 1, realizedUnplanned: 0 });
  });

  it("divide los realizados entre publicaciones del plan y fuera del plan", () => {
    const points = buildDailyTimeline([
      record("asociado", "2026-07-06", "2026-07-07", "real-plan"),
      record("fuera", null, "2026-07-07", "real-fuera"),
    ], "2026-07-06", "2026-07-12");
    expect(points[1]).toMatchObject({ realized: 2, realizedPlanned: 1, realizedUnplanned: 1 });
  });
});
