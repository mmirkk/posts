import { app } from "./app.js";
import { config } from "./config.js";
import { closeDatabase } from "./data/database.js";

const server = app.listen(config.port, () => console.log(`Informe disponible en http://localhost:${config.port}`));

const shutdown = () => server.close(async () => {
  await closeDatabase();
  process.exit(0);
});
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
