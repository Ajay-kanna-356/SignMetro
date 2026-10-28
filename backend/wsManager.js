/**
 * backend/wsManager.js
 * ---------------------
 * Manages browser-facing WebSocket connections for both:
 *  - Kiosk Screen (Port 5000)
 *  - Staff Operations Dashboard (Port 4000)
 *
 * Bridges events from:
 *  - Python ISL recognition service (ws://localhost:8765)
 *  - Node.js assistance & emergency incident events
 */

"use strict";

const WebSocket = require("ws");

let _servers = [];    // ws.Server instances (Kiosk + Staff)
let _pythonWs = null; // Connection to Python service

/**
 * Configure event listeners for a WebSocket Server instance.
 */
function _setupWss(wss, label = "Client") {
  wss.on("connection", (socket, req) => {
    console.log(`[WS] ${label} connected from ${req.socket.remoteAddress}`);

    // Send current Python recognition service connection status
    _safeSend(socket, {
      type: "SYSTEM_STATUS",
      python_connected: isPythonConnected(),
      message: isPythonConnected()
        ? "Recognition service is connected."
        : "Recognition service is not yet connected. Simulator mode available.",
    });

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw);
        _handleBrowserMessage(msg);
      } catch (_) {
        /* ignore malformed */
      }
    });

    socket.on("close", () => {
      console.log(`[WS] ${label} disconnected.`);
    });
  });
}

/**
 * Attach the WebSocket server to Express HTTP server(s).
 * Accepts a single server or an array of servers.
 */
function attach(httpServers, pythonWsUrl) {
  const servers = Array.isArray(httpServers) ? httpServers : [httpServers];

  servers.forEach((server, idx) => {
    try {
      const label = idx === 0 ? "Kiosk / Main" : "Staff Dashboard";
      const wss = new WebSocket.Server({ server, path: "/ws" });
      _setupWss(wss, label);
      _servers.push(wss);
    } catch (err) {
      console.warn(`[WS] Failed to attach WebSocket to server #${idx}:`, err.message);
    }
  });

  // Connect to Python recognition service
  if (pythonWsUrl) {
    _connectToPython(pythonWsUrl);
  }
}

// -------------------------------------------------------------------------
// Python service bridge
// -------------------------------------------------------------------------

function _connectToPython(url) {
  if (_pythonWs) {
    try {
      _pythonWs.terminate();
    } catch (_) {}
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
      // Forward gesture recognition event to all connected kiosks and dashboards
      _broadcastToBrowsers(event);
    } catch (_) {}
  });

  ws.on("close", () => {
    console.log("[WS] Python service disconnected. Reconnecting in 3 s…");
    _pythonWs = null;
    _broadcastToBrowsers({
      type: "SYSTEM_STATUS",
      python_connected: false,
      message: "Recognition service disconnected. Reconnecting…",
    });
    setTimeout(() => _connectToPython(url), 3000);
  });

  ws.on("error", (err) => {
    // Don't crash on connection refused — close handler will retry
    if (err.code !== "ECONNREFUSED") {
      console.log(`[WS] Python WS error: ${err.message}`);
    }
  });
}

// -------------------------------------------------------------------------
// Helpers & Public API
// -------------------------------------------------------------------------

function _broadcastToBrowsers(payload) {
  const msg = JSON.stringify(payload);
  _servers.forEach((wss) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
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

module.exports = {
  attach,
  isPythonConnected,
  broadcastToBrowsers: _broadcastToBrowsers,
};
