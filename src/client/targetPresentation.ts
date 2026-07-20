import type { ReportRecord } from "../shared/types";

export type TargetVisualState = "done" | "review" | "no-evidence" | "missing";

const MATCH_REASON: Partial<Record<ReportRecord["matchType"], string>> = {
  exacta: "Copy exacto",
  por_url: "Por enlace",
  por_titulo: "Por título",
  aproximada: "Copy similar",
};

export function getTargetPresentation(record: ReportRecord): { state: TargetVisualState; label: string } {
  if (record.actualId) {
    return { state: "done", label: MATCH_REASON[record.matchType] ?? "Publicado" };
  }
  if (record.status === "datos_incompletos") {
    return { state: "no-evidence", label: "Sin evidencia" };
  }
  if (record.status === "coincidencia_dudosa" || record.matchType === "dudosa" || record.manualReview) {
    return { state: "review", label: "Revisar coincidencia" };
  }
  return { state: "missing", label: "No publicado" };
}
