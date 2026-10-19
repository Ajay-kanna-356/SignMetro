/**
 * frontend/js/app.js
 * -------------------
 * Bootstrap — wires click/input handlers, idle timer, camera feed,
 * WS status indicators, and starts the render loop.
 *
 * Mirrors the original prototype's A action-dispatch table and
 * event listeners exactly; refactored for module separation.
 */

/* global window, document, State, WsClient, IntentRouter, Views, _TR, fetch */

(function () {
  "use strict";

  const E = (id) => document.getElementById(id);

  // ── Action table (identical to original prototype's A{} object) ─────────
  const A = {
    lang:  (v) => { State.set({ lang: v }); },
    go:    (v) => {
      if (v === "medical") {
        State.go("medical", {});
        IntentRouter.notifyAssistance("medical").then(() => IntentRouter.track());
      } else if (v === "train") {
        State.go("train", {});
      } else if (v === "board") {
        State.go("board", { tab: "board", q: "" });
      } else {
        State.go(v);
      }
    },
    sos:   ()  => {
      State.go("sos", {});
      IntentRouter.notifyAssistance("sos").then(() => IntentRouter.track());
    },
    kind:  (v) => State.setD({ kind: v }),
    home:  ()  => State.home(),
    back:  ()  => State.back(),
    tab:   (v) => State.set({ d: { tab: v, q: "" } }),
    td:    (v) => State.go("td", { c: v }),
    acc:   ()  => State.set({ w: !State.get().w }),
    pick:  (v) => State.setD({ p: v, q: "" }),
    chg:   ()  => State.setD({ p: "", q: "" }),
    rt:    (v) => State.setD({ c: v }),
    fs:    ()  => {
      const s = State.get();
      State.set({ fs: !s.fs });
      document.body.style.fontSize = !s.fs ? "22px" : "";
    },
    to:    (v) => State.go("map", { to: v }),
    body:  (v) => State.setD({ body: v }),
    more:  ()  => State.setD({ more: 1 }),
    cx:    ()  => State.setD({ cf: 1 }),
    cxn:   ()  => State.setD({ cf: 0 }),
    cxy:   ()  => State.done("Request cancelled."),
    dis:   ()  => State.set({ dis: !State.get().dis }),
    sec:   (v) => {
      State.setD({ sent: v });
      IntentRouter.notifyAssistance("security", { reason: v });
      IntentRouter.track();
    },
    hide:  ()  => State.home(),
    lp:    ()  => State.go("lostp", { f: {} }),
    li:    ()  => State.go("losti", { f: {} }),
    arr:   ()  => State.done("Glad you are reunited. The announcement has been stopped."),
    cat:   (v) => {
      const d = State.get().d;
      if (!d.f) d.f = {};
      d.f.cat = v;
      State.setD({});   // trigger re-render
    },
    sy:    ()  => { const m = State.get().m; State.set({ m: null }); if (m) IntentRouter.dispatch(m); },
    sn:    ()  => State.set({ m: null }),
    sg:    (v) => IntentRouter.dispatch(v),   // simulator button

    // ── Train number lookup ──────────────────────────────────────────────
    find: () => {
      const val = E("tn")?.value.trim();
      if (!val) return;
      const r = /^\d{5}$/.test(val)
        ? _TR.find((x) => x[0] === val)
        : /^\d{10}$/.test(val)
          ? _TR[6]   // PNR demo: always return Pandian Express
          : null;
      if (r) {
        State.go("td", { c: r[0] });
      } else {
        const el = E("er");
        if (el) el.textContent = "Not found. Enter a 5-digit train number or a 10-digit PNR.";
      }
    },

    // ── SMS alert subscription (simulated) ─────────────────────────────
    sub: () => {
      const ph = E("ph")?.value;
      const cs = E("cs")?.checked;
      const er = E("er");
      if (!/^[6-9]\d{9}$/.test(ph)) {
        if (er) er.textContent = "Enter a valid 10-digit mobile number.";
        return;
      }
      if (!cs) {
        if (er) er.textContent = "Please tick consent to receive alerts.";
        return;
      }
      if (er) { er.className = "ok"; er.textContent = "Alerts on (simulated). We will SMS you about platform or delay changes."; }
    },

    // ── Lost person submission ──────────────────────────────────────────
    subp: async () => {
      const d  = State.get().d;
      const v  = d.f || {};
      const er = E("er");
      if (!v.n || !v.a)           { if (er) er.textContent = "Please enter name and age."; return; }
      if (!/^\d{1,3}$/.test(v.a)) { if (er) er.textContent = "Age must be a number."; return; }
      if (!d.pin)                  { if (er) er.textContent = "Tap the map to mark where you last saw them."; return; }

      await IntentRouter.notifyAssistance("lost_person", { ...v, pin: d.pin });
      State.setD({ sent: 1 });
      IntentRouter.track();
    },

    // ── Lost item submission ────────────────────────────────────────────
    subi: async () => {
      const d  = State.get().d;
      const v  = d.f || {};
      const er = E("er");
      if (!v.cat) { if (er) er.textContent = "Please choose a category."; return; }
      if (v.ct && !(/^[6-9]\d{9}$/.test(v.ct) || /^\S+@\S+\.\S+$/.test(v.ct))) {
        if (er) er.textContent = "Enter a valid phone number or email.";
        return;
      }
      if (v.ct && !v.cs) { if (er) er.textContent = "Please tick consent to be contacted."; return; }

      await IntentRouter.notifyAssistance("lost_item", v);
      State.setD({ sent: 1 });
    },
  };

  // ── Click handler ───────────────────────────────────────────────────────
  document.addEventListener("click", (e) => {
    State.touch();
    const btn = e.target.closest("[data-a]");
    if (btn && A[btn.dataset.a]) {
      A[btn.dataset.a](btn.dataset.v);
    }

    // Map pin tap for lost-person
    const mp = e.target.closest("#mp");
    if (mp && State.get().scr === "lostp" && !State.get().d.sent) {
      const r = mp.getBoundingClientRect();
      const pin = [
        (e.clientX - r.left) * 600 / r.width,
        (e.clientY - r.top) * 300 / r.height,
      ];
      State.setD({ pin });
    }
  });

  // ── Input handler ──────────────────────────────────────────────────────
  document.addEventListener("input", (e) => {
    const t = e.target;
    const k = t.dataset.f;

    // Form field binding
    if (k) {
      const d = State.get().d;
      if (!d.f) d.f = {};
      d.f[k] = t.type === "checkbox" ? t.checked : t.value;
    }

    // Train board search
    if (t.id === "q") {
      const tbody = E("tb");
      if (tbody && Views.rows) {
        tbody.innerHTML = Views.rows(t.value);
        State.get().d.q = t.value;
      }
    }

    // Destination search
    if (t.id === "dq") {
      const dl2 = E("dl2");
      if (dl2 && Views.dl) {
        dl2.innerHTML = Views.dl(t.value);
        State.get().d.q = t.value;
      }
    }

    // Route search
    if (t.id === "rq") {
      const rs = E("rs");
      if (rs && Views.rl) {
        rs.innerHTML = Views.rl(t.value, State.get().d.c);
        State.get().d.q = t.value;
      }
    }
  });

  // ── Idle timeout (same logic as original prototype) ──────────────────────
  setInterval(() => {
    const s = State.get();
    if (["idle","home","medical","sos"].includes(s.scr)) return;
    const idle = (Date.now() - s.act) / 1000;
    if (idle > 45 && !s.to) { State.set({ to: 1 }); }
    if (s.to && idle > 55)  {
      IntentRouter.clearStepTimers();
      State.set({ to: 0, h: [], scr: "home", d: {} });
    }
  }, 1000);

  // ── Camera feed (MJPEG img) ───────────────────────────────────────────────
  const pythonHost = location.hostname || "localhost";
  const camFeedUrl = `http://${pythonHost}:8766/video_feed`;
  const camFeed    = E("cam-feed");
  const camPh      = E("cam-placeholder");
  const camEl      = document.getElementById("cam");
  const camLabel   = E("cam-label");

  if (camFeed) {
    camFeed.src = camFeedUrl;
    camFeed.onload = () => {
      camPh.style.display = "none";
      camFeed.style.display = "block";
    };
    camFeed.onerror = () => {
      // Python service not running — show placeholder
      camFeed.style.display = "none";
      camPh.style.display = "";
    };
  }

  // ── WebSocket status → camera widget classes ──────────────────────────
  WsClient.on("SYSTEM_STATUS", (msg) => {
    if (!camEl) return;
    if (msg.python_connected) {
      camEl.classList.add("python-connected");
      if (camLabel) camLabel.textContent = "Camera · sign here";
      if (camFeed && camFeed.style.display === "none") {
        camFeed.src = `${camFeedUrl}?t=${Date.now()}`;
      }
    } else {
      camEl.classList.remove("python-connected");
      if (camLabel) camLabel.textContent = "Recognition offline";
      if (camFeed) camFeed.style.display = "none";
      if (camPh) camPh.style.display = "";
    }
  });

  const hudSign   = E("hud-sign");
  const hudPct    = E("hud-pct");
  const hudBar    = E("hud-bar");
  const hudDot    = E("hud-dot");
  const hudThresh = E("hud-thresh");
  const hudAlts   = E("hud-alts");

  WsClient.on("RECOGNITION_TELEMETRY", (msg) => {
    if (!camEl) return;
    const st = msg.status || "";
    camEl.classList.remove("state-confirming", "state-accepted");
    if (st.startsWith("Confirming")) camEl.classList.add("state-confirming");
    if (st.startsWith("Accepted"))   camEl.classList.add("state-accepted");

    // Update live HUD
    const pred   = msg.prediction || msg.candidate || "";
    const pct    = typeof msg.confidence_percent === "number"
      ? msg.confidence_percent
      : Math.round((msg.confidence || 0) * 1000) / 10;
    const thresh = typeof msg.threshold_percent === "number"
      ? msg.threshold_percent
      : Math.round((msg.threshold || 0.8) * 100);

    if (hudSign && pred && pred !== "Waiting for frames…") {
      hudSign.textContent = pred.toUpperCase();
    }
    if (hudPct) {
      hudPct.textContent = `${pct.toFixed(1)}%`;
      if (pct >= thresh) {
        hudPct.classList.add("qualified");
      } else {
        hudPct.classList.remove("qualified");
      }
    }
    if (hudBar) {
      const fillPct = Math.min(100, Math.max(0, (pct / thresh) * 100));
      hudBar.style.width = `${fillPct}%`;
      if (pct >= thresh) {
        hudBar.classList.add("qualified");
      } else {
        hudBar.classList.remove("qualified");
      }
    }
    if (hudDot) {
      if (pct >= thresh) hudDot.classList.add("active");
      else hudDot.classList.remove("active");
    }
    if (hudThresh) {
      hudThresh.textContent = `Req: ${thresh}%`;
    }
    if (hudAlts && Array.isArray(msg.top) && msg.top.length > 1) {
      const second = msg.top[1];
      hudAlts.textContent = `2nd: ${second.sign} (${second.prob}%)`;
    }
  });

  WsClient.on("GESTURE_ACCEPTED", (msg) => {
    if (!camEl) return;
    camEl.classList.add("state-accepted");
    const gName = (msg.gesture || msg.data?.gesture || "").toUpperCase();
    if (hudSign && gName) hudSign.textContent = `✓ ${gName}`;
    if (hudDot) hudDot.classList.add("active");
    setTimeout(() => {
      camEl.classList.remove("state-accepted");
    }, 800);
  });

  // ── Sync active screen & allowed gestures with Python recognition ─────
  let _lastSyncedScreen = null;

  function syncScreenWithPython(scr) {
    const s = (scr || State.get().scr || "home").toLowerCase();
    if (s === _lastSyncedScreen && WsClient.isConnected()) return;
    _lastSyncedScreen = s;

    const allowed = (IntentRouter.SCREEN_GESTURES && IntentRouter.SCREEN_GESTURES[s]) || null;
    WsClient.send({
      command: "SET_SCREEN",
      screen: s,
      allowed_gestures: allowed,
    });
    console.log(`[Screen] Synced "${s}" to Python service. Allowed gestures:`, allowed);
  }

  WsClient.on("connected", () => {
    if (camEl) camEl.classList.add("python-connected");
    _lastSyncedScreen = null;
    syncScreenWithPython(State.get().scr);
  });

  WsClient.on("disconnected", () => {
    if (camEl) camEl.classList.remove("python-connected");
    if (camLabel) camLabel.textContent = "Backend offline — reconnecting";
  });

  // ── Subscribe state changes to Views.render and Python screen sync ─────
  State.subscribe((s) => {
    Views.render();
    syncScreenWithPython(s.scr);
  });

  // ── Initial render and sync ───────────────────────────────────────────
  Views.render();
  syncScreenWithPython(State.get().scr);

}());
