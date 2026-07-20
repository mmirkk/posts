import type { ServerResponse } from "node:http";
import type { ManualReviewValue } from "../src/shared/types";
import { errorMessage, readJsonBody, sendJson, type ApiRequest } from "./_http";

const weekPattern = /^\d{4}-\d{2}-\d{2}$/u;

interface ReviewBody {
  plannedId?: unknown;
  actualId?: unknown;
  decision?: unknown;
  week?: unknown;
}

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Método no permitido" });

  try {
    const body = await readJsonBody(request) as ReviewBody;
    if (typeof body.plannedId !== "string" || !body.plannedId) return sendJson(response, 400, { error: "plannedId es obligatorio" });
    if (typeof body.actualId !== "string" || !body.actualId) return sendJson(response, 400, { error: "actualId es obligatorio" });
    if (body.decision !== "approved" && body.decision !== "rejected") return sendJson(response, 400, { error: "decision no es válida" });
    if (body.week !== undefined && body.week !== "all" && (typeof body.week !== "string" || !weekPattern.test(body.week))) {
      return sendJson(response, 400, { error: "week debe ser all o una fecha YYYY-MM-DD" });
    }

    const decision = body.decision as ManualReviewValue;
    const week = typeof body.week === "string" ? body.week : undefined;
    const { saveReviewDecision } = await import("../src/server/reviews");
    const { buildReport } = await import("../src/server/report");
    await saveReviewDecision(body.plannedId, body.actualId, decision);
    return sendJson(response, 200, await buildReport({ force: true, weekEnd: week }));
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: errorMessage(error) });
  }
}
