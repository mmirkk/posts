import type { IncomingMessage, ServerResponse } from "node:http";

export type ApiRequest = IncomingMessage & { body?: unknown };

export function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado";
}

export async function readJsonBody(request: ApiRequest): Promise<unknown> {
  if (request.body !== undefined) {
    if (typeof request.body === "string") return JSON.parse(request.body);
    return request.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
