/**
 * frontend/js/ws_client.js
 * -------------------------
 * WebSocket client that connects to the Node.js backend (/ws).
 *
 * The Node backend relays events from the Python recognition service,
 * so the browser only needs one WS connection.
 *
 * Connection lifecycle:
 *  - Connects on page load
 *  - Auto-reconnects with exponential back-off (max 10 s)
 *  - Deduplicates consecutive identical GESTURE_ACCEPTED events
 *  - Exposes a send() method for commands (e.g. RESET_BUFFERS)
 */

/* global window, State */

(function (global) {
  "use strict";

  const WS_URL       = `ws://${location.host}/ws`;
  const RETRY_BASE   = 1000;
  const RETRY_MAX    = 10000;

  let _ws            = null;
  let _retryDelay    = RETRY_BASE;
  let _retryTimer    = null;

  // Deduplicate: track last accepted gesture + timestamp
  let _lastGesture   = null;
  let _lastGestureTs = 0;
  const DEDUP_MS     = 1500;  // ignore same gesture within 1.5 s

  // Event listeners registered by other modules
  const _handlers = {};

  function _connect() {
    _ws = new WebSocket(WS_URL);

    _ws.onopen = () => {
      console.log("[WS] Connected to backend.");
      _retryDelay = RETRY_BASE;
      _emit("connected", {});
    };

    _ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); }
      catch (_) { return; }

      _dispatch(msg);
    };

    _ws.onclose = () => {
      console.log(`[WS] Disconnected. Retrying in ${_retryDelay / 1000} s…`);
      _emit("disconnected", {});
      _scheduleRetry();
    };

    _ws.onerror = () => { /* close event will fire; handled there */ };
  }

  function _scheduleRetry() {
    if (_retryTimer) clearTimeout(_retryTimer);
    _retryTimer = setTimeout(() => {
      _retryTimer = null;
      _connect();
    }, _retryDelay);
    _retryDelay = Math.min(_retryDelay * 2, RETRY_MAX);
  }

  function _dispatch(msg) {
    const type = msg.type || msg.command || "unknown";

    // ── Deduplication for GESTURE_ACCEPTED ──────────────────────────────
    if (type === "GESTURE_ACCEPTED") {
      const now = Date.now();
      if (
        msg.data?.gesture === _lastGesture &&
        now - _lastGestureTs < DEDUP_MS
      ) {
        console.log(`[WS] Dedup: skipping duplicate ${msg.data.gesture}`);
        return;
      }
      _lastGesture   = msg.data?.gesture || msg.gesture;
      _lastGestureTs = Date.now();
    }

    _emit(type, msg);
    _emit("*", msg);   // wildcard for catch-all listeners
  }

  function _emit(type, payload) {
    if (_handlers[type]) {
      _handlers[type].forEach((fn) => fn(payload));
    }
  }

  const WsClient = {
    /** Register a listener for a specific message type (or "*" for all) */
    on(type, fn) {
      if (!_handlers[type]) _handlers[type] = [];
      _handlers[type].push(fn);
    },

    /** Send a command to the backend (forwarded to Python service) */
    send(payload) {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify(payload));
      }
    },

    isConnected() {
      return _ws !== null && _ws.readyState === WebSocket.OPEN;
    },
  };

  // Start connection on module load
  _connect();

  global.WsClient = WsClient;
}(window));
