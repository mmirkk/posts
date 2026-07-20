import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError, z } from "zod";
import { config } from "./config";
import { buildReport } from "./report";
import { saveReviewDecision } from "./reviews";

const app = express();
const reportPeriodSchema = z.union([z.literal("all"), z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)]);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => response.json({ ok: true, service: "cumplimiento-publicaciones" }));
app.get("/api/report", async (request, response, next) => {
  try {
    const query = z.object({
      refresh: z.enum(["true", "false"]).optional(),
      week: reportPeriodSchema.optional(),
    }).parse(request.query);
    response.json(await buildReport({ force: query.refresh === "true", weekEnd: query.week }));
  } catch (error) {
    next(error);
  }
});
app.post("/api/reviews", async (request, response, next) => {
  try {
    const body = z.object({
      plannedId: z.string().min(1),
      actualId: z.string().min(1),
      decision: z.enum(["approved", "rejected"]),
      week: reportPeriodSchema.optional(),
    }).parse(request.body);
    await saveReviewDecision(body.plannedId, body.actualId, body.decision);
    response.json(await buildReport({ force: true, weekEnd: body.week }));
  } catch (error) {
    next(error);
  }
});

const dirname = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(dirname, "../../dist/client");
app.use(express.static(clientPath));
app.get("/{*splat}", (_request, response, next) => response.sendFile(path.join(clientPath, "index.html"), (error) => error ? next(error) : undefined));

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (error instanceof ZodError) return response.status(400).json({ error: "Parámetros inválidos", details: error.issues });
  const message = error instanceof Error ? error.message : "Error inesperado";
  return response.status(500).json({ error: message });
});

export { app };
