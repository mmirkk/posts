import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "./_http";

export default function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Método no permitido" });
  return sendJson(response, 200, {
    ok: true,
    service: "cumplimiento-publicaciones",
    configuration: {
      databaseUrl: Boolean(process.env.DATABASE_URL),
      sheetId: Boolean(process.env.GOOGLE_SHEET_ID),
    },
  });
}
