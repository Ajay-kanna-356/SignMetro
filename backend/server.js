/**
 * backend/server.js
 * ------------------
 * Express + WebSocket server for SignMeet.
 *
 * Responsibilities:
 *  - Serve the kiosk frontend as static files from frontend/
 *  - Expose REST APIs for trains, station, and assistance
 *  - Bridge gesture events from the Python service to the browser via WS
 */

"use strict";

require("dotenv").config();

const express    = require("express");
const cors       = require("cors");
const path       = require("path");
const http       = require("http");
const wsManager  = require("./wsManager");

// ---- routes ----
const trainsRouter     = require("./routes/trains");
const stationRouter    = require("./routes/station");
const assistanceRouter = require("./routes/assistance");

// -------------------------------------------------------------------------
// App setup
// -------------------------------------------------------------------------

const app  = express();
const PORT = process.env.PORT || 5000;

const PYTHON_WS_URL =
  process.env.PYTHON_WS_URL || "ws://localhost:8765";

// -------------------------------------------------------------------------
// Middleware
// -------------------------------------------------------------------------

app.use(cors());
app.use(express.json());

// Request logger (compact)
app.use((req, _res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// -------------------------------------------------------------------------
// Serve frontend
// -------------------------------------------------------------------------

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR));

// -------------------------------------------------------------------------
// API routes
// -------------------------------------------------------------------------

app.use("/api/trains",     trainsRouter);
app.use("/api/station",    stationRouter);
app.use("/api/assistance", assistanceRouter);

// Health / status endpoint
app.get("/api/status", (req, res) => {
  res.json({
    service:          "SignMeet Backend",
    version:          "1.0.0",
    python_connected: wsManager.isPythonConnected(),
    station:          "Tambaram (TBM)",
    kiosk_id:         process.env.KIOSK_ID || "TBM-01",
    timestamp:        new Date().toISOString(),
  });
});

// Fallback — serve index.html for any unmatched route (SPA behaviour)
app.get("*", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// -------------------------------------------------------------------------
// Error handler
// -------------------------------------------------------------------------

app.use((err, req, res, _next) => {
  console.error("[ERROR]", err.stack);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// -------------------------------------------------------------------------
// HTTP + WebSocket server startup
// -------------------------------------------------------------------------

const httpServer = http.createServer(app);

wsManager.attach(httpServer, PYTHON_WS_URL);

httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[Server ERROR] Port ${PORT} is already in use by another process!`);
  } else {
    console.error(`\n[Server ERROR]`, err);
  }
});

httpServer.listen(PORT, () => {
  console.log("=".repeat(60));
  console.log("  SignMeet — Node.js Backend");
  console.log("=".repeat(60));
  console.log(`  Kiosk UI  →  http://localhost:${PORT}`);
  console.log(`  REST API  →  http://localhost:${PORT}/api`);
  console.log(`  WebSocket →  ws://localhost:${PORT}/ws`);
  console.log(`  Python WS →  ${PYTHON_WS_URL}  (auto-reconnect)`);
  console.log("=".repeat(60));
});

// Graceful shutdown
process.on("SIGINT",  () => { console.log("\n[Server] Shutting down."); process.exit(0); });
process.on("SIGTERM", () => { console.log("\n[Server] Shutting down."); process.exit(0); });

