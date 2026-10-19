/**
 * frontend/js/state.js
 * ---------------------
 * Single source of truth for kiosk UI state.
 * Ported from the original prototype's `S` object — same fields, same logic.
 * Subscribers are notified on every state change so views can re-render.
 */

/* global window */

(function (global) {
  "use strict";

  // ── State object (matches original prototype) ──────────────────────────
  let S = {
    scr:  "home",    // current screen name
    h:    [],        // navigation history stack
    lang: "en",      // active language: en | ta | hi
    d:    {},        // screen-specific data (tab, query, form fields, etc.)
    m:    null,      // pending gesture confirmation message (or null)
    act:  Date.now(), // last user activity timestamp (for idle timeout)
    w:    false,     // step-free mode toggle
    dis:  false,     // discreet mode (security flow)
    to:   0,         // timeout modal active flag
    fs:   false,     // large-text mode
  };

  // Subscribers notified on change
  const _listeners = [];

  function _notify() {
    _listeners.forEach((fn) => fn(S));
  }

  // ── Public API ──────────────────────────────────────────────────────────

  const State = {
    /** Return a shallow copy of current state */
    get() { return Object.assign({}, S); },

    /** Replace state partially and notify */
    set(patch) {
      Object.assign(S, patch);
      _notify();
    },

    subscribe(fn) { _listeners.push(fn); },

    // ── Navigation helpers (identical to original prototype) ──────────────
    go(scr, d) {
      S.h.push(S.scr);
      S.scr = scr;
      S.d   = d || {};
      _notify();
    },

    back() {
      S.scr = S.h.pop() || "home";
      if (S.scr === "idle") S.scr = "home";
      S.d = {};
      if (S.scr === "board") S.d = { tab: "board", q: "" };
      _notify();
    },

    home() {
      S.h   = [];
      S.scr = "home";
      S.d   = {};
      _notify();
    },

    done(msg) {
      this.go("done", { m: msg });
    },

    /** Update a field inside S.d and notify */
    setD(patch) {
      Object.assign(S.d, patch);
      _notify();
    },

    /** Touch activity (resets idle timer) */
    touch() {
      S.act = Date.now();
      if (S.to) { S.to = 0; _notify(); }
    },
  };

  global.State = State;
}(window));
