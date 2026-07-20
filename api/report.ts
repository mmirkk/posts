import type { IncomingMessage, ServerResponse } from "node:http";

const weekPattern = /^\d{4}-\d{2}-\d{2}$/u;

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado";
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Método no permitido" });

  try {
    const url = new URL(request.url ?? "/api/report", `http://${request.headers.host ?? "localhost"}`);
    const refresh = url.searchParams.get("refresh");
    const week = url.searchParams.get("week") ?? undefined;
    if (refresh !== null && refresh !== "true" && refresh !== "false") {
      return sendJson(response, 400, { error: "El parámetro refresh debe ser true o false" });
    }
    if (week !== undefined && week !== "all" && !weekPattern.test(week)) {
      return sendJson(response, 400, { error: "El parámetro week debe ser all o una fecha YYYY-MM-DD" });
    }

    const { buildReport } = await import("../src/server/report.js");
    return sendJson(response, 200, await buildReport({ force: refresh === "true", weekEnd: week }));
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: errorMessage(error) });
  }
}
