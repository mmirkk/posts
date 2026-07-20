import { describe, expect, it } from "vitest";
import type { ManualReviewDecision } from "../shared/types.js";
import { mergeReviewDecision } from "./reviews.js";

const decision = (plannedId: string, actualId: string, value: "approved" | "rejected"): ManualReviewDecision => ({
  plannedId,
  actualId,
  decision: value,
  updatedAt: "2026-07-17T12:00:00Z",
});

describe("decisiones de revisión manual", () => {
  it("conserva varios candidatos rechazados para un mismo planeado", () => {
    const merged = mergeReviewDecision([decision("p1", "a1", "rejected")], "p1", "a2", "rejected", "2026-07-17T13:00:00Z");
    expect(merged.filter((item) => item.plannedId === "p1" && item.decision === "rejected")).toHaveLength(2);
  });

  it("una aprobación reemplaza decisiones anteriores y mantiene asignación única", () => {
    const merged = mergeReviewDecision([
      decision("p1", "a1", "rejected"),
      decision("p2", "a2", "approved"),
    ], "p1", "a2", "approved", "2026-07-17T13:00:00Z");
    expect(merged).toEqual([decision("p1", "a2", "approved")].map((item) => ({ ...item, updatedAt: "2026-07-17T13:00:00Z" })));
  });
});
