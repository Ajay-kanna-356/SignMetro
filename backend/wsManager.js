/**
 * backend/wsManager.js
 * ---------------------
 * Manages browser-facing WebSocket connections and bridges events
 * from the Python recognition service to all connected frontend clients.
 *
 * Architecture:
 *   Python service  —WS:8765→  wsManager (Node)  —WS:5000/ws→  Browser(s)
 *
 * The Node backend acts as a relay so the frontend has only one WebSocket
 * connection to manage, and the Python service can restart independently.
 */

"use strict";

const WebSocket = require("ws");

// -------------------------------------------------------------------------
// Browser-facing WebSocket server (attached to the Express HTTP server)
// -------------------------------------------------------------------------

let _wss   = null;    // ws.Server instance, set by attach()
let _pythonWs = null; // current connection to Python service

/**
 * Attach the WebSocket server to an existing Express http.Server.
 * Call this once from server.js after Express app is created.
 */
function attach(httpServer, pythonWsUrl) {
  _wss = new WebSocket.Server({ server: httpServer, path: "/ws" });

  _wss.on("connection", (socket, req) => {
    console.log(`[WS] Browser connected from ${req.socket.remoteAddress}`);

    // Send current Python service connection status
    _safeSend(socket, {
      type:           "SYSTEM_STATUS",
      python_connected: isPythonConnected(),
      message:        isPythonConnected()
        ? "Recognition service is connected."
        : "Recognition service is not yet connected. Simulator mode available.",
    });

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw);
        _handleBrowserMessage(msg);
      } catch (_) { /* ignore malformed */ }
    });

    socket.on("close", () => {
      console.log("[WS] Browser disconnected.");
    });
  });

  // Connect to Python service
  _connectToPython(pythonWsUrl);
}

// -------------------------------------------------------------------------
// Python service bridge
// -------------------------------------------------------------------------

function _connectToPython(url) {
  if (_pythonWs) {
    try { _pythonWs.terminate(); } catch (_) {}
  }

  console.log(`[WS] Connecting to Python service at ${url} …`);

  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log("[WS] Python service connected.");
    _pythonWs = ws;
    _broadcastToBrowsers({ type: "SYSTEM_STATUS", python_connected: true });
  });

  ws.on("message", (raw) => {
    try {
      const event = JSON.parse(raw);
      // Forward every event from Python directly to all browsers
      _broadcastToBrowsers(event);
    } catch (_) {}
  });

  ws.on("close", () => {
    console.log("[WS] Python service disconnected. Reconnecting in 3 s…");
    _pythonWs = null;
    _broadcastToBrowsers({
      type:             "SYSTEM_STATUS",
      python_connected: false,
      message:          "Recognition service disconnected. Reconnecting…",
    });
    setTimeout(() => _connectToPython(url), 3000);
  });

  ws.on("error", (err) => {
    // Don't crash — just log; the close handler will retry
    if (err.code !== "ECONNREFUSED") {
      console.log(`[WS] Python WS error: ${err.message}`);
    }
  });
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function _broadcastToBrowsers(payload) {
  if (!_wss) return;
  const msg = JSON.stringify(payload);
  _wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function _handleBrowserMessage(msg) {
  // Forward control commands (e.g. RESET_BUFFERS) to Python service
  if (_pythonWs && _pythonWs.readyState === WebSocket.OPEN) {
    _pythonWs.send(JSON.stringify(msg));
  }
}

function _safeSend(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function isPythonConnected() {
  return _pythonWs !== null && _pythonWs.readyState === WebSocket.OPEN;
}

module.exports = { attach, isPythonConnected };
