import express from "express";
import { ZodError, z } from "zod";
import { config } from "./config.js";

const app = express();
const reportPeriodSchema = z.union([z.literal("all"), z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)]);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => response.json({
  ok: true,
  service: "cumplimiento-publicaciones",
  configuration: { databaseUrl: Boolean(config.databaseUrl), sheetId: Boolean(config.sheetId) },
}));
app.get("/api/report", async (request, response, next) => {
  try {
    const { buildReport } = await import("./report.js");
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
    const { buildReport } = await import("./report.js");
    const { saveReviewDecision } = await import("./reviews.js");
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

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (error instanceof ZodError) return response.status(400).json({ error: "Parámetros inválidos", details: error.issues });
  const message = error instanceof Error ? error.message : "Error inesperado";
  return response.status(500).json({ error: message });
});

export { app };
