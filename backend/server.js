/**
 * backend/server.js
 * ------------------
 * Express + WebSocket server for SignMetro.
 *
 * Responsibilities:
 *  - Serves the Passenger Kiosk UI on PORT 5000 (http://localhost:5000)
 *  - Serves the Station Staff Control Dashboard on STAFF_PORT 4000 (http://localhost:4000)
 *  - Exposes REST APIs for trains, station, and assistance
 *  - Bridges real-time gestures and emergency/lost-found events via WebSocket
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
// App & Port Setup
// -------------------------------------------------------------------------

const PORT       = parseInt(process.env.PORT || "5000", 10);
const STAFF_PORT = parseInt(process.env.STAFF_PORT || "4000", 10);

const PYTHON_WS_URL =
  process.env.PYTHON_WS_URL || "ws://localhost:8765";

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const STAFF_DIR    = path.join(FRONTEND_DIR, "staff");

// -------------------------------------------------------------------------
// 1. Kiosk Server (Port 5000)
// -------------------------------------------------------------------------

const kioskApp = express();
kioskApp.use(cors());
kioskApp.use(express.json());

// Request logger
kioskApp.use((req, _res, next) => {
  console.log(`[HTTP 5000] ${req.method} ${req.path}`);
  next();
});

// Mount APIs
kioskApp.use("/api/trains",     trainsRouter);
kioskApp.use("/api/station",    stationRouter);
kioskApp.use("/api/assistance", assistanceRouter);

// Health check
kioskApp.get("/api/status", (_req, res) => {
  res.json({
    service:          "SignMetro Passenger Kiosk Backend",
    version:          "1.0.0",
    python_connected: wsManager.isPythonConnected(),
    station:          process.env.STATION_NAME || "Chennai Egmore (MS)",
    kiosk_id:         process.env.KIOSK_ID || "K-03",
    timestamp:        new Date().toISOString(),
  });
});

// Serve staff directory as sub-path on 5000 as well
kioskApp.use("/staff", express.static(STAFF_DIR));

// Serve general frontend
kioskApp.use(express.static(FRONTEND_DIR));

// Fallback to kiosk index.html
kioskApp.get("*", (req, res) => {
  if (req.path.startsWith("/staff")) {
    res.sendFile(path.join(STAFF_DIR, "index.html"));
  } else {
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
  }
});

// Error handler
kioskApp.use((err, req, res, _next) => {
  console.error("[Kiosk Server ERROR]", err.stack);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// -------------------------------------------------------------------------
// 2. Staff Control Dashboard Server (Port 4000)
// -------------------------------------------------------------------------

const staffApp = express();
staffApp.use(cors());
staffApp.use(express.json());

staffApp.use((req, _res, next) => {
  console.log(`[STAFF 4000] ${req.method} ${req.path}`);
  next();
});

// Share same APIs on staff port
staffApp.use("/api/trains",     trainsRouter);
staffApp.use("/api/station",    stationRouter);
staffApp.use("/api/assistance", assistanceRouter);

// Health check
staffApp.get("/api/status", (_req, res) => {
  res.json({
    service:          "SignMetro Staff Operations Center",
    version:          "1.0.0",
    python_connected: wsManager.isPythonConnected(),
    station:          process.env.STATION_NAME || "Chennai Egmore (MS)",
    staff_port:       STAFF_PORT,
    timestamp:        new Date().toISOString(),
  });
});

// Serve staff dashboard as root on port 4000
staffApp.use(express.static(STAFF_DIR));
// Also serve shared assets from frontend/assets if needed
staffApp.use("/assets", express.static(path.join(FRONTEND_DIR, "assets")));

// Fallback to staff index.html
staffApp.get("*", (_req, res) => {
  res.sendFile(path.join(STAFF_DIR, "index.html"));
});

// Error handler
staffApp.use((err, req, res, _next) => {
  console.error("[Staff Server ERROR]", err.stack);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// -------------------------------------------------------------------------
// Startup & WebSocket Attachment
// -------------------------------------------------------------------------

const kioskHttpServer = http.createServer(kioskApp);
const staffHttpServer = http.createServer(staffApp);

// Attach WebSocket to both servers so both have real-time relay
wsManager.attach([kioskHttpServer, staffHttpServer], PYTHON_WS_URL);

kioskHttpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[Server ERROR] Kiosk Port ${PORT} is already in use by another process!`);
  } else {
    console.error(`\n[Server ERROR]`, err);
  }
});

staffHttpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[Server ERROR] Staff Port ${STAFF_PORT} is already in use by another process!`);
  } else {
    console.error(`\n[Server ERROR]`, err);
  }
});

// Start Kiosk Server
kioskHttpServer.listen(PORT, () => {
  console.log("=".repeat(64));
  console.log("  🚉 SignMetro — Passenger & Staff Operations Platform");
  console.log("=".repeat(64));
  console.log(`  Passenger Kiosk UI   →  http://localhost:${PORT}`);
  console.log(`  Kiosk WebSocket      →  ws://localhost:${PORT}/ws`);
  console.log(`  REST API Endpoints   →  http://localhost:${PORT}/api`);
  console.log(`  Python WS Bridge     →  ${PYTHON_WS_URL}`);
  console.log("-".repeat(64));
});

// Start Staff Dashboard Server on Port 4000
staffHttpServer.listen(STAFF_PORT, () => {
  console.log(`  🚨 Staff Operations   →  http://localhost:${STAFF_PORT}`);
  console.log(`  Staff WebSocket      →  ws://localhost:${STAFF_PORT}/ws`);
  console.log("=".repeat(64));
});

// Graceful shutdown
process.on("SIGINT",  () => { console.log("\n[Server] Shutting down."); process.exit(0); });
process.on("SIGTERM", () => { console.log("\n[Server] Shutting down."); process.exit(0); });
