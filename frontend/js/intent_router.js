/**
 * frontend/js/intent_router.js
 * -----------------------------
 * Maps confirmed gesture labels to kiosk actions.
 *
 * Model vocabulary (CLASS_NAMES in recognition/config.py, lowercased):
 *   destination, platform, route, ticket, train, when, where,
 *   help, lost, medical, security
 *
 * Prototype simulator gestures (SG array in original prototype):
 *   train, when, destination, route, where, help, medical, security, lost
 *   + back, cancel (simulator-only)
 *
 * ── Vocabulary notes ──────────────────────────────────────────────────────
 *  "platform"  — model has it; prototype has no dedicated screen; mapped to
 *                train board with a platform-focus message.
 *  "ticket"    — model has it; prototype has no ticket screen; shows a
 *                ticket-counter notice.
 *  "back"      — simulator only, not in model; handled via UI touch.
 *  "cancel"    — simulator only, not in model.
 */

/* global window, State, WsClient */

(function (global) {
  "use strict";

  // ── Timeout tracking for simulated status steps ──────────────────────
  let _stepTimers = [];

  function _clearStepTimers() {
    _stepTimers.forEach(clearTimeout);
    _stepTimers = [];
  }

  /** Simulate a 3-step tracker (received → in progress → done) */
  function _track() {
    _clearStepTimers();
    State.setD({ step: 0 });
    _stepTimers.push(setTimeout(() => { State.setD({ step: 1 }); }, 2500));
    _stepTimers.push(setTimeout(() => { State.setD({ step: 2 }); }, 6500));
  }

  // ── Contextual gesture vocabulary per screen ────────────────────────
  const SCREEN_GESTURES = {
    idle:     ["train", "where", "help", "medical", "security", "ticket"],
    home:     ["train", "where", "help", "medical", "security", "ticket"],
    train:    ["when", "destination", "route", "platform", "medical", "security"],
    help:     ["medical", "security", "lost"],
    where:    ["where", "ticket", "medical", "security", "help"],
    when:     ["when", "destination", "route", "train", "medical", "security"],
    dest:     ["destination", "when", "route", "train", "medical", "security"],
    route:    ["route", "when", "destination", "train", "medical", "security"],
    board:    ["train", "when", "destination", "route", "platform", "medical", "security"],
    lost:     ["lost", "help", "medical", "security"],
    medical:  ["medical", "help", "security"],
    security: ["security", "help", "medical"],
    sos:      ["medical", "security", "help"],
    ticket:   ["ticket", "train", "where", "help", "medical", "security"],
  };

  // ── Gesture → action map ─────────────────────────────────────────────
  //
  // Each key is the lowercase model label.
  // The value is a function(currentScreen) that executes the action.
  //
  const GESTURE_MAP = {
    train(scr) {
      if (scr === "home" || scr === "idle") {
        State.go("train", {});
      }
      // If already on a train sub-screen, ignore (avoid re-navigation loop)
    },

    when(scr) {
      if (["home", "idle", "train", "board"].includes(scr)) {
        State.go("when");
      }
    },

    destination(scr) {
      if (["home", "idle", "train", "board"].includes(scr)) {
        State.go("dest", {});
      }
    },

    route(scr) {
      if (["home", "idle", "train", "board"].includes(scr)) {
        State.go("route", {});
      }
    },

    platform(scr) {
      State.go("board", { tab: "board", q: "", platform_note: true });
    },

    ticket(_scr) {
      State.go("ticket");
    },

    where(_scr) {
      State.go("where");
    },

    // ── Emergency gestures (preemptive — always fire) ──────────────────
    medical(_scr) {
      _clearStepTimers();
      State.go("medical", {});
      _notifyAssistance("medical");
      _track();
    },

    security(_scr) {
      State.go("security", {});
      // Do not auto-select reason — passenger must choose
    },

    help(_scr) {
      State.go("help");
    },

    lost(_scr) {
      State.go("lost");
    },

    // ── Simulator-only (not in model) ─────────────────────────────────
    back(_scr)   { State.back(); },
    cancel(_scr) { State.home(); },
  };

  // ── POST or PATCH assistance request to backend ────────────────────
  async function _notifyAssistance(category, details = {}) {
    try {
      const curReqId = State.get().d?.request_id;
      const res = await fetch("/api/assistance", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          category,
          details,
          request_id: curReqId || undefined,
        }),
      });
      const json = await res.json();
      if (json.request_id) {
        console.log(`[Assist] Request ${json.updated ? "updated" : "created"}: ${json.request_id}`);
        State.setD({ request_id: json.request_id });
      }
      return json;
    } catch (err) {
      console.warn("[Assist] Failed to record request:", err.message);
      return null;
    }
  }

  // ── Cancel / Resolve assistance request on backend ──────────────────
  async function _cancelAssistance(staffNotes = "Cancelled by passenger at kiosk") {
    try {
      const reqId = State.get().d?.request_id;
      if (!reqId) return null;
      console.log(`[Assist] Resolving request ${reqId} due to passenger action: ${staffNotes}`);
      const res = await fetch(`/api/assistance/${reqId}/resolve`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ staffNotes, staffName: "Passenger (Kiosk)" }),
      });
      return await res.json();
    } catch (err) {
      console.warn("[Assist] Failed to cancel request on backend:", err.message);
      return null;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────

  const IntentRouter = {
    /**
     * Dispatch a gesture label.
     * @param {string} gesture   — lowercase label from model or simulator
     */
    dispatch(gesture) {
      const g = (gesture || "").toLowerCase();
      const scr = State.get().scr || "home";

      // Simulator commands 'back' and 'cancel' are always allowed
      if (!["back", "cancel"].includes(g)) {
        const allowed = SCREEN_GESTURES[scr];
        if (allowed && !allowed.includes(g)) {
          console.warn(`[Intent] Gesture "${gesture}" not valid on screen "${scr}". Blocked.`);
          return;
        }
      }

      const fn = GESTURE_MAP[g];
      if (!fn) {
        console.warn(`[Intent] Unknown gesture: "${gesture}" — ignored.`);
        return;
      }
      console.log(`[Intent] Accepted gesture="${gesture}" on screen="${scr}"`);
      State.touch();
      fn(scr);
    },

    SCREEN_GESTURES,

    /** Expose _notifyAssistance for manual SOS / security submission */
    notifyAssistance: _notifyAssistance,
    cancelAssistance: _cancelAssistance,

    clearStepTimers: _clearStepTimers,
    track:           _track,
  };

  // Wire WS gesture events
  WsClient.on("GESTURE_ACCEPTED", (msg) => {
    const gesture = msg.data?.gesture || msg.gesture;
    if (gesture) IntentRouter.dispatch(gesture);
  });

  global.IntentRouter = IntentRouter;
}(window));
