import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./app.js";
import { config } from "./config.js";
import { closeDatabase } from "./data/database.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(dirname, "../../dist/client");
app.use(express.static(clientPath));
app.get("/{*splat}", (_request, response, next) => response.sendFile(path.join(clientPath, "index.html"), (error) => error ? next(error) : undefined));

const server = app.listen(config.port, () => console.log(`Informe disponible en http://localhost:${config.port}`));

const shutdown = () => server.close(async () => {
  await closeDatabase();
  process.exit(0);
});
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
