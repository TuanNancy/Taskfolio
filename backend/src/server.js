import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import connectDB from "./config/db.js";
import User from "../models/User.js";
import Task from "../models/Task.js";

try {
  const config = loadConfig();
  await connectDB(config.mongoUri);
  // Wait for declared indexes, including account uniqueness, before accepting traffic.
  await Promise.all([User.init(), Task.init()]);
  const app = createApp(config);
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.info(JSON.stringify({ event: "listening", port: config.port }));
  });
  server.on("error", async () => {
    console.error(JSON.stringify({ event: "listen_failed" }));
    await mongoose.disconnect();
    process.exitCode = 1;
  });

  const shutdown = () => {
    if (app.locals.shuttingDown) return;
    app.locals.shuttingDown = true;
    const timeout = setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => {
      try {
        await mongoose.disconnect();
      } catch {
        console.error(JSON.stringify({ event: "shutdown_failed" }));
        process.exitCode = 1;
      } finally {
        clearTimeout(timeout);
      }
    });
    server.closeIdleConnections();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch (error) {
  // Startup failures may contain database credentials; report only safe identifiers.
  console.error(JSON.stringify({ event: "startup_failed", fields: error.issues?.map((issue) => issue.path.join(".")) }));
  await mongoose.disconnect();
  process.exitCode = 1;
}
