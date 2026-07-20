import { describe, expect, it } from "vitest";
import type { ReportRecord } from "../shared/types";
import { summarizePlannedContent } from "./contentSummary";

function target(id: string, sourceRow: number, actualId: string | null): ReportRecord {
  return {
    id,
    plannedId: `plan-${id}`,
    plannedSourceRow: sourceRow,
    actualId,
    plannedDate: "2026-07-06",
    title: `Contenido ${sourceRow}`,
    plannedDescription: `Descripción ${sourceRow}`,
    campaign: "Prueba",
    network: "instagram",
    account: "Cuenta oficial",
    manualReview: false,
  } as ReportRecord;
}

describe("resumen ejecutivo por contenido", () => {
  it("considera publicado un contenido con al menos un destino asociado", () => {
    const summary = summarizePlannedContent([
      target("a", 10, "real-a"),
      target("b", 10, null),
      target("c", 11, null),
    ]);
    expect(summary).toMatchObject({
      plannedContents: 2,
      publishedContents: 1,
      unpublishedContents: 1,
      plannedTargets: 3,
      matchedTargets: 1,
    });
    expect(summary.contents.find((content) => content.sourceRow === 10)?.status).toBe("published");
  });

  it("considera no publicado un contenido sin post asociado", () => {
    const summary = summarizePlannedContent([target("a", 12, null)]);
    expect(summary.publishedContents).toBe(0);
    expect(summary.unpublishedContents).toBe(1);
    expect(summary.contents[0].status).toBe("not_published");
  });
});
