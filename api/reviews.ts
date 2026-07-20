import type { IncomingMessage, ServerResponse } from "node:http";
import type { ManualReviewValue } from "../src/shared/types.js";

const weekPattern = /^\d{4}-\d{2}-\d{2}$/u;
type ApiRequest = IncomingMessage & { body?: unknown };

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado";
}

async function readJsonBody(request: ApiRequest): Promise<unknown> {
  if (request.body !== undefined) {
    if (typeof request.body === "string") return JSON.parse(request.body);
    return request.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

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
    const { saveReviewDecision } = await import("../src/server/reviews.js");
    const { buildReport } = await import("../src/server/report.js");
    await saveReviewDecision(body.plannedId, body.actualId, decision);
    return sendJson(response, 200, await buildReport({ force: true, weekEnd: week }));
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: errorMessage(error) });
  }
}
