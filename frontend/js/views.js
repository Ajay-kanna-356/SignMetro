/**
 * frontend/js/views.js
 * ---------------------
 * All screen template functions.
 * Ported from the original prototype's V object — same HTML output,
 * same data logic, reorganized for readability.
 *
 * Train data is fetched from the backend API (backed by kiosk_data.json —
 * Tambaram dataset, ~2016 timetable snapshot).
 * Station layout derived from layout_graph.json (Tambaram data pack, Oct 2026).
 */

/* global window, State, IntentRouter */

(function (global) {
  "use strict";

  // ── i18n labels ────────────────────────────────────────────────────────
  const L = {
    en: ["Train", "Where", "Help", "Touch the screen or sign to begin"],
    ta: ["ரயில்", "எங்கே", "உதவி", "தொடங்க திரையைத் தொடவும் அல்லது சைகை செய்யவும்"],
    hi: ["ट्रेन", "कहाँ", "मदद", "शुरू करने के लिए स्क्रीन छुएँ या संकेत करें"],
  };
  const WL = {
    en: "How can we help you?",
    ta: "நாங்கள் எவ்வாறு உதவலாம்?",
    hi: "हम आपकी कैसे सहायता करें?",
  };

  // ── SVG icon paths ─────────────────────────────────────────────────────
  const PA = {
    train:     '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l2-4M15 21l-2-4M9 14h.01M15 14h.01"/>',
    where:     '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
    help:      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>',
    lift:      '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3"/>',
    escalator: '<path d="M3 20h5v-4h5v-4h5V8h3"/>',
    washroom:  '<circle cx="7" cy="5" r="2"/><path d="M7 8v6M4 21v-5h6v5"/><circle cx="17" cy="5" r="2"/><path d="M17 8v13M14 14l3-6 3 6"/>',
    exit:      '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
    medical:   '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
    security:  '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    lost:      '<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5"/>',
    person:    '<circle cx="12" cy="7" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/>',
    item:      '<rect x="4" y="8" width="16" height="13" rx="1"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    alert:     '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    hand:      '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 6-5 6s-4-1.5-5-3l-3-5a1.5 1.5 0 0 1 2.5-1.5L8 13"/>',
    when:      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    dest:      '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><path d="M9.5 10l2 2 3-3.5"/>',
    route:     '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/>',
    ticket:    '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 12h4M18 12h4"/>',
  };

  /** Return an inline SVG string for icon key k */
  function ic(k) {
    return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PA[k] || ""}</svg>`;
  }

  // ── Train data — loaded from backend API (kiosk_data.json via /api/trains) ──
  // TR is populated by _loadTrains() on startup.
  // Format: [number, name, destination, departure, platform, status, tbm_event, category, from]
  // Index:     0       1     2            3           4         5       6          7         8
  let TR = [];

  async function _loadTrains() {
    try {
      const res = await fetch("/api/trains");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw  = Array.isArray(data.trains) ? data.trains : [];
      TR = raw.map(t => [
        t.number        || "",
        t.name          || "",
        t.destination   || t.to_name || "",
        t.departure     || t.tbm_departure || t.tbm_arrival || "",
        t.platform      || "",     // blank — check station boards
        t.status        || "Scheduled",
        t.tbm_event     || "",
        t.category      || "",
        t.from          || t.from_name || "",
      ]);
      // Expose updated TR to app.js
      global._TR = TR;
      // Re-render if a view is already shown
      if (global.Views && global.State) global.Views.render();
    } catch (err) {
      console.warn("[Views] Could not load trains from API:", err.message);
    }
  }

  // ── Route cache — loaded on demand from /api/trains/:number/route ────────
  const _routeCache = {};

  async function _fetchRoute(number) {
    if (_routeCache[number]) return _routeCache[number];
    try {
      const res = await fetch(`/api/trains/${encodeURIComponent(number)}/route`);
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data.route)) {
        _routeCache[number] = data.route;
        return data.route;
      }
    } catch (_) {}
    return null;
  }

  // ── Station layout — loaded from /api/station ────────────────────────────
  let _layout = null;

  async function _loadLayout() {
    try {
      const res = await fetch("/api/station");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _layout = await res.json();
    } catch (err) {
      console.warn("[Views] Could not load station layout:", err.message);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  const mn  = (s) => {
    if (!s || typeof s !== "string") return -1;
    const p = s.split(":");
    return p.length < 2 ? -1 : (+p[0]) * 60 + (+p[1]);
  };
  const now = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const clk = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

  /** Trains with a departure time that haven't left yet, sorted by time */
  const up = () => TR
    .filter(x => x[3] && mn(x[3]) >= 0 && mn(x[3]) >= now())
    .sort((a, b) => mn(a[3]) - mn(b[3]));

  const wc  = (s) => (s === "On time" || s === "Scheduled") ? "ok" : "warn";

  /** All unique destinations (from TR) */
  const DS = () => {
    const seen = new Set();
    return TR.map(x => x[2]).filter(d => d && !seen.has(d) && seen.add(d)).sort();
  };

  function rows(q) {
    q = (q || "").toLowerCase();
    const r = TR.filter(x => (x[1] + x[2] + x[0] + x[8]).toLowerCase().includes(q));
    return r.length
      ? r.map(x => {
          const dep  = x[3] || (x[6] === "terminates" ? `arr ${x[3]}` : "—");
          const plat = x[4] || "—";
          return `<tr data-a="td" data-v="${x[0]}"><td>${x[0]}<td>${x[1]}<td>${x[2]}<td>${dep}<td><b>${plat}</b><td class="${wc(x[5])}">${x[5]}`;
        }).join("")
      : `<tr><td colspan="6">No trains found for "${q}".`;
  }

  function chips(a, k, cur) {
    return a.map(x =>
      `<button class="ch ${cur === x ? "on" : ""}" data-a="${k}" data-v="${x}">${x}</button>`
    ).join(" ");
  }

  function trk(steps, s) {
    return `<div class="tk">${steps.map((x, i) =>
      `<div class="st ${i <= s ? "on" : ""}"><b>${i < s ? "✓" : i + 1}</b>${x}</div>`
    ).join("")}</div>`;
  }

  // ── Station map (SVG) — derived from layout_graph.json TBM data ─────────
  // Canvas: 700 × 360
  // Structure: West entrance (left) → concourse → platforms (top to bottom) → East entrance (right)
  // Platforms 1–4: suburban (top band), 5–10: express (bottom band)
  // Kiosk is in the west concourse.
  //
  // SVG coordinate mapping:
  //   x axis: west (left, x≈80) → platforms (x≈280–520) → east (x≈620)
  //   y axis: concourse/kiosk (y≈30) → FOB (y≈160) → platforms spread y 56–294

  // Facility markers (x, y in SVG space)
  const FAC_MARKERS = {
    lift:      { x: 380, y: 160, label: "Lifts (Old FOB)", symbol: "L" },
    escalator: { x: 210, y: 80,  label: "Escalator (West/East FOB ends)", symbol: "E" },
    washroom:  { x: 80,  y: 160, label: "Washroom (West)", symbol: "W" },
    exit:      { x: 80,  y: 310, label: "West Exit (GST Rd)", symbol: "X" },
  };

  // Status badge colours for facility status from layout_graph
  const STATUS_STYLE = {
    open:                 "var(--ok)",
    pending_licence:      "#e6a817",
    installing:           "#e6a817",
    approach_incomplete:  "#e6a817",
    under_construction:   "var(--mu)",
  };

  // Paths from kiosk to each facility (polylines in SVG space)
  // Kiosk is at [140, 40] (west concourse).
  const FAC_PATHS = {
    lift:      [[140, 40], [140, 160], [380, 160]],
    escalator: [[140, 40], [210, 40], [210, 80]],
    washroom:  [[140, 40], [80, 40], [80, 160]],
    exit:      [[140, 40], [140, 310], [80, 310]],
  };

  // Directions from layout_graph.json (authoritative)
  const FAC_DIRECTIONS = {
    lift: [
      "From kiosk, walk along the west concourse toward the overbridge stairs",
      "Follow signs to the Old Foot Over Bridge (FOB)",
      "Lifts are located at each platform pair — check status board before use",
      "⚠ Platform lifts are pending licence or installation (Oct 2026)"
    ],
    escalator: [
      "From kiosk, walk toward the Old Foot Over Bridge",
      "Escalators are at the west entrance (GST Road) and east entrance (Velachery Road) ends of the old FOB",
      "⚠ New FOB escalators at platform level are under construction (expected Dec 2026)"
    ],
    washroom: [
      "West washroom: near the west concourse (GST Road side) — position estimated",
      "East washroom: near the east entrance (Velachery Road side)",
      "Ask station staff if the exact location is unclear"
    ],
    exit: [
      "Walk straight through the west concourse",
      "West exit (main): on GST Road",
      "East exit: on Velachery Road opposite MCC College"
    ],
  };

  // Approx distances from kiosk (from layout_graph routing test data)
  const FAC_DIST = {
    lift:      { m: 170, s: 130 },   // platform 7 via overbridge ≈170 m
    escalator: { m: 127, s: 95 },    // west entrance escalator ≈127 m
    washroom:  { m: 16,  s: 15 },
    exit:      { m: 22,  s: 20 },
  };

  /**
   * Render the SVG station map for Tambaram.
   * Shows 10 platforms, concourse, FOB, lifts, escalators, washrooms and exits.
   * Highlights the path to the selected facility.
   */
  function svgMap(facilityKey, pin) {
    // Platform rows: 1-4 suburban (top), 5-10 express (bottom)
    // Each platform is a horizontal bar; FOB is the vertical connector
    const platformRows = [
      // y,  label,      group
      [56,  "Plat. 1",  "suburban"],
      [82,  "Plat. 2",  "suburban"],
      [108, "Plat. 3",  "suburban"],
      [134, "Plat. 4",  "suburban"],
      [164, "Plat. 5",  "express"],
      [190, "Plat. 6",  "express"],
      [216, "Plat. 7",  "express"],
      [242, "Plat. 8",  "express"],
      [268, "Plat. 9",  "express"],
      [294, "Plat. 10", "express"],
    ];

    const pfSvg = platformRows.map(([y, lbl, grp]) => {
      const fill = grp === "suburban" ? "var(--soft)" : "var(--cd)";
      return `<rect x="240" y="${y}" width="340" height="18" rx="3" fill="${fill}" stroke="var(--bd)"/>
              <text x="247" y="${y + 13}" font-size="10" fill="var(--mu)">${lbl} <tspan font-style="italic">${grp}</tspan></text>`;
    }).join("");

    // Old FOB — vertical corridor connecting all platforms
    const fobSvg = `
      <rect x="226" y="50" width="16" height="262" rx="3" fill="var(--bd)" opacity="0.5"/>
      <text x="234" y="182" font-size="9" text-anchor="middle" fill="var(--fg)" transform="rotate(-90,234,182)">Old FOB (open)</text>`;

    // New FOB — further right, under construction
    const fobNewSvg = `
      <rect x="590" y="50" width="14" height="262" rx="3" fill="var(--bd)" opacity="0.35" stroke-dasharray="5,3" stroke="var(--mu)"/>
      <text x="597" y="182" font-size="9" text-anchor="middle" fill="var(--mu)" transform="rotate(-90,597,182)">New FOB (u/c)</text>`;

    // Concourse block
    const concourseSvg = `
      <rect x="40" y="20" width="180" height="308" rx="8" fill="var(--soft)" stroke="var(--bd)"/>
      <text x="50" y="38" font-size="11" font-weight="bold" fill="var(--fg)">West Concourse</text>
      <text x="50" y="53" font-size="10" fill="var(--mu)">GST Road entrance</text>`;

    // East entrance label
    const eastLabelSvg = `
      <text x="665" y="185" font-size="10" text-anchor="middle" fill="var(--mu)" transform="rotate(-90,665,185)">East entrance</text>
      <text x="665" y="210" font-size="9" text-anchor="middle" fill="var(--mu)" transform="rotate(-90,665,210)">(Velachery Rd)</text>`;

    // Facility markers
    const markersSvg = Object.entries(FAC_MARKERS).map(([key, m]) => {
      const status = key === "lift"      ? "pending_licence"
                   : key === "escalator" ? "open"
                   : "open";
      const col = STATUS_STYLE[status] || "var(--ac)";
      const isSelected = key === facilityKey;
      return `<circle cx="${m.x}" cy="${m.y}" r="${isSelected ? 14 : 11}"
                fill="${isSelected ? "var(--ac)" : "var(--cd)"}"
                stroke="${col}" stroke-width="${isSelected ? 3 : 2}"/>
              <text x="${m.x}" y="${m.y + 4}" font-size="11" text-anchor="middle"
                fill="${isSelected ? "#fff" : "var(--fg)"}" font-weight="${isSelected ? "bold" : "normal"}">${m.symbol}</text>`;
    }).join("");

    // Kiosk marker
    const kioskSvg = `
      <circle cx="140" cy="40" r="9" fill="var(--rd)"/>
      <text x="140" y="58" font-size="10" text-anchor="middle" fill="var(--fg)">Kiosk</text>
      <text x="140" y="70" font-size="9" text-anchor="middle" fill="var(--mu)">(You are here)</text>`;

    // Route path to selected facility
    const pathPoints = facilityKey && FAC_PATHS[facilityKey]
      ? FAC_PATHS[facilityKey]
      : null;
    const lineSvg = pathPoints
      ? `<polyline points="${pathPoints.map(p => p.join(",")).join(" ")}"
           fill="none" stroke="var(--ac)" stroke-width="4"
           stroke-dasharray="10 7" stroke-linecap="round"/>`
      : "";

    // Pin (for lost-person map tap)
    const pinEl = pin
      ? `<text x="${pin[0]}" y="${pin[1]}" font-size="22" text-anchor="middle">📍</text>`
      : "";

    // Legend
    const legendSvg = `
      <rect x="42" y="284" width="170" height="36" rx="4" fill="var(--cd)" opacity="0.7"/>
      <circle cx="54" cy="296" r="5" fill="var(--soft)" stroke="var(--ok)" stroke-width="1.5"/>
      <text x="63" y="300" font-size="9" fill="var(--fg)">Open</text>
      <circle cx="54" cy="311" r="5" fill="var(--soft)" stroke="#e6a817" stroke-width="1.5"/>
      <text x="63" y="315" font-size="9" fill="var(--fg)">Pending/installing</text>
      <circle cx="110" cy="296" r="5" fill="var(--soft)" stroke="var(--mu)" stroke-width="1.5"/>
      <text x="119" y="300" font-size="9" fill="var(--fg)">Under construction</text>`;

    return `<svg id="mp" viewBox="0 0 700 360" width="100%">
      ${concourseSvg}
      ${fobSvg}
      ${pfSvg}
      ${fobNewSvg}
      ${eastLabelSvg}
      ${lineSvg}
      ${markersSvg}
      ${kioskSvg}
      ${legendSvg}
      ${pinEl}
    </svg>`;
  }

  /**
   * Render the route map for a train — uses real stops from the API.
   * Falls back to a "loading" state while fetching.
   */
  function rmap(trainRow) {
    const number = trainRow[0];
    const name   = trainRow[1];
    const dest   = trainRow[2];

    const cached = _routeCache[number];
    if (!cached) {
      // Kick off async fetch; re-render will follow when done
      _fetchRoute(number).then(route => {
        if (route) global.Views.render();
      });
      return `<div class="g2"><div class="card"><p class="mu">Loading route for ${number}…</p></div></div>`;
    }

    const stops = cached;
    const n     = stops.length;
    if (n === 0) return `<div class="g2"><div class="card"><p class="er">Route data not available.</p></div></div>`;

    // Use up to 8 representative stops for the route diagram to avoid clutter
    const step    = Math.max(1, Math.floor(n / 7));
    const indices = [0];
    for (let i = step; i < n - 1; i += step) indices.push(i);
    if (indices[indices.length - 1] !== n - 1) indices.push(n - 1);
    const diagram = indices.map(i => stops[i]);

    const nd = diagram.length;
    const pt = diagram.map((_, i) => [50 + i * (500 / (nd - 1)), 115 + Math.sin(i * 1.1) * 38]);

    const tbmIdx = stops.findIndex(s => s.station_code === "TBM");

    return `<div class="g2"><div class="card">
      <svg viewBox="0 0 600 230" width="100%" class="mp">
        <text x="560" y="22" font-size="11" text-anchor="end" fill="var(--mu)" font-style="italic">Southern Railway</text>
        <polyline points="${pt.map(p => p.join(",")).join(" ")}" fill="none" stroke="var(--ac)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        ${pt.map((p, i) => {
          const s   = diagram[i];
          const isTBM = s.station_code === "TBM";
          const isEnd = i === 0 || i === nd - 1;
          return `<circle cx="${p[0]}" cy="${p[1]}" r="${isEnd || isTBM ? 9 : 6}"
            fill="${isTBM ? "var(--rd)" : isEnd ? "var(--ac)" : "var(--cd)"}"
            stroke="var(--ac)" stroke-width="3"/>
           <text x="${p[0]}" y="${p[1] + (i % 2 ? 28 : -17)}" font-size="10" text-anchor="middle" fill="var(--fg)">${s.station_name}</text>`;
        }).join("")}
      </svg>
      <small>Schematic — not to scale. ${n} stops total. Data: ~2016 timetable snapshot.</small>
      </div><div class="card"><b>${number} · ${name}</b>
      <p class="mu">${trainRow[8] ? `From: ${trainRow[8]}` : ""} → To: ${dest}</p>
      <ol>${stops.slice(0, 12).map(s => {
        const isTBM = s.station_code === "TBM";
        const time  = s.departure || s.arrival || "";
        return `<li${isTBM ? ' style="font-weight:bold;color:var(--ac)"' : ""}>${s.station_name}${time ? ` <small>${time}</small>` : ""}${isTBM ? " ◀ Tambaram" : ""}`;
      }).join("")}${n > 12 ? `<li class="mu">… and ${n - 12} more stops</li>` : ""}</ol>
      </div></div>`;
  }

  function rl(q, cur) {
    q = (q || "").trim().toLowerCase();
    const l = TR.filter(x => (x[0] + " " + x[1] + " " + x[2]).toLowerCase().includes(q));
    return l.length
      ? l.map(x => `<button class="ch ${cur === x[0] ? "on" : ""}" style="margin:4px" data-a="rt" data-v="${x[0]}">${x[0]} · ${x[1]}</button>`).join(" ")
      : "No train found. Check the name or number and try again.";
  }

  function dl(q) {
    const res = DS()
      .filter(x => x.toLowerCase().includes((q || "").toLowerCase()))
      .map(x => `<button class="ch" style="margin:4px" data-a="pick" data-v="${x}">${x} <small>(${up().filter(t => t[2] === x).length} upcoming)</small></button>`)
      .join("");
    return res || "No destination matches.";
  }

  function tbl(list) {
    return list.length
      ? `<div class="card"><table><thead><tr><th>Code<th>Train<th>To<th>Dep<th>Plat<th>Status</thead><tbody>${
          list.map(x => {
            const dep  = x[3] || "—";
            const plat = x[4] || "—";
            return `<tr data-a="td" data-v="${x[0]}"><td>${x[0]}<td>${x[1]}<td>${x[2]}<td>${dep}<td><b>${plat}</b><td class="${wc(x[5])}">${x[5]}`;
          }).join("")
        }</tbody></table></div><small>Tap a train for route stops. Platform shown when available. <em>Historical timetable (~2016).</em></small>`
      : `<div class="card">No upcoming trains found.</div>`;
  }

  // ── Screen views ────────────────────────────────────────────────────────
  const V = {
    idle() {
      const s = State.get();
      return `<div class="idle" data-a="home">
        <div class="hand">${ic("hand")}</div>
        <h1>${L[s.lang][3]}</h1>
        <p class="mu">Tambaram (TBM) · Indian Sign Language help kiosk</p>
      </div>`;
    },

    home() {
      const s = State.get();
      return `<h1>${WL[s.lang]}</h1>
        <div class="tl">${["train", "where", "help"].map((k, i) =>
          `<button class="t ${k === "help" ? "rd" : ""}" data-a="go" data-v="${k}">
            <span>${ic(k)}</span>${L[s.lang][i]}
            <small>ISL sign: ${k.toUpperCase()}</small>
          </button>`
        ).join("")}</div>`;
    },

    train() {
      return `<h2>${ic("train")} Train information</h2>
        <div class="tl">${[
          ["when",  "When",        "Upcoming trains"],
          ["dest",  "Destination", "Trains to a place"],
          ["route", "Route",       "Stops of a train"],
        ].map(([k, n, s]) =>
          `<button class="t" data-a="go" data-v="${k}">
            <span>${ic(k)}</span>${n}
            <small>${s} · ISL sign: ${n.toUpperCase()}</small>
          </button>`
        ).join("")}</div>
        <div class="card" style="margin-top:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <b>Looking for the full timetable or train search?</b><br>
            <small class="mu">View all scheduled departures, search by number or PNR</small>
          </div>
          <button class="ch" data-a="go" data-v="board">Open Train Board →</button>
        </div>`;
    },

    board() {
      const d = State.get().d;
      const destOptions = [...new Set(TR.map(x => x[2]))].filter(Boolean);
      return `<h2>${ic("train")} Trains from Tambaram <small>(historical timetable ~2016)</small></h2>
        <div class="tabs">${[["board", "Train board"], ["my", "My train / Route"]].map(([k, n]) =>
          `<button class="ch ${(d.tab || "board") === k ? "on" : ""}" data-a="tab" data-v="${k}">${n}</button>`
        ).join("")}</div>
        ${(d.tab || "board") === "board"
          ? `<input id="q" list="dl" placeholder="Type destination or train name…" value="${d.q || ""}" autocomplete="off">
             <datalist id="dl">${destOptions.map(x => `<option value="${x}">`).join("")}</datalist>
             <div class="card"><table><thead><tr><th>Code<th>Train<th>To<th>Dep<th>Plat<th>Status</thead><tbody id="tb">${rows(d.q || "")}</tbody></table></div>
             <small>Tap a train for details. <em>Historical timetable (~2016) — not live.</em> Platform blank = check station board.</small>`
          : `<p>Enter train number (5 digits) or PNR (10 digits)</p>
             <div class="row"><input id="tn" inputmode="numeric" maxlength="10" placeholder="e.g. 56860"><button class="btn" data-a="find">Show</button></div>
             <p class="er" id="er"></p>`
        }`;
    },

    td() {
      const { d } = State.get();
      const r = TR.find(x => x[0] === d.c);
      if (!r) return `<p class="er">Train not found.</p>`;

      const route = _routeCache[r[0]];
      const stops = route ? route.slice(0, 8) : null;

      // Kick off route fetch if needed
      if (!route) {
        _fetchRoute(r[0]).then(rt => { if (rt) global.Views.render(); });
      }

      const dep  = r[3] || "—";
      const plat = r[4] || "— (check station boards)";

      return `<h2>${r[0]} · ${r[1]}</h2>
        <div class="g2">
          <div class="card"><div class="big">Platform ${plat}</div>
            <p class="${wc(r[5])}">${r[5]}</p>
            <p>
              ${r[6] === "terminates" ? `Arrives ${r[3] || "—"} · From ${r[8] || r[2]}` : `Departs ${dep} · To ${r[2]}`}
            </p>
            <p><b>Coach position:</b> <span class="mu">Not in dataset — check coach-guidance boards on platform</span></p>
            <p><small class="mu">Historical timetable (~2016). Platform, live status and days of run not in dataset.</small></p>
          </div>
          <div class="card"><b>Route ${stops ? `(first ${stops.length} of ${route.length} stops)` : "(loading…)"}</b>
            <ol>${stops
              ? stops.map(s => {
                  const isTBM = s.station_code === "TBM";
                  const time  = s.departure || s.arrival || "";
                  return `<li${isTBM ? ' style="font-weight:bold;color:var(--ac)"' : ""}>${s.station_name}${time ? ` <small>${time}</small>` : ""}${isTBM ? " ◀" : ""}`;
                }).join("")
              : "<li class='mu'>Loading stops…"}</ol>
          </div>
        </div>
        <div class="card"><b>SMS / WhatsApp alerts</b> for platform changes and delays
          <div class="row"><input type="tel" id="ph" inputmode="tel" maxlength="10" placeholder="10-digit mobile">
          <label><input type="checkbox" id="cs"> I consent</label>
          <button class="btn" data-a="sub">Alert me</button></div>
          <p id="er" class="er"></p></div>`;
    },

    when() {
      return `<h2>${ic("when")} Upcoming trains</h2>
        <p class="mu">Station time ${clk(now())} · trains yet to depart, earliest first</p>
        <small class="mu">Historical timetable (~2016). Platform column blank = check station display boards.</small>
        ${tbl(up())}`;
    },

    dest() {
      const { d } = State.get();
      return `<h2>${ic("dest")} Trains by destination</h2>
        ${d.p
          ? `<div class="row"><b>Destination: ${d.p}</b><button class="ch" data-a="chg">Change</button></div>${tbl(up().filter(x => x[2] === d.p))}`
          : `<input id="dq" placeholder="Type to search destinations" value="${d.q || ""}" autocomplete="off"><div class="card" id="dl2">${dl(d.q || "")}</div>`
        }`;
    },

    route() {
      const { d } = State.get();
      const r = TR.find(x => x[0] === d.c);
      return `<h2>${ic("route")} Train route</h2>
        <p class="mu">Type a train name or number, or select one below.</p>
        <input id="rq" placeholder="Train name or number (e.g. 56860 or Villupuram)" value="${d.q || ""}" autocomplete="off">
        <div class="card" id="rs">${rl(d.q, d.c)}</div>
        ${r ? rmap(r) : ""}`;
    },

    where() {
      const { w } = State.get();
      return `<h2>${ic("where")} Where do you want to go?</h2>
        <div class="row"><button class="ch ${w ? "on" : ""}" data-a="acc">Step-free route: ${w ? "ON" : "OFF"}</button></div>
        <div class="tl" style="margin-top:12px">
          ${["lift", "escalator", "washroom", "exit"].map(k =>
            `<button class="t" data-a="to" data-v="${k}"><span>${ic(k)}</span>${k[0].toUpperCase() + k.slice(1)}</button>`
          ).join("")}
        </div>`;
    },

    map() {
      const s = State.get();
      let k = s.d.to, note = "";
      if (k === "escalator" && s.w) {
        k = "lift";
        note = `<p class="wn">Step-free mode is on — escalator is not step-free, showing the lift.<br>
          <small>⚠ Platform lifts are pending licence or installation as of Oct 2026. Verify on site.</small></p>`;
      }
      const dist = FAC_DIST[k] || { m: 0, s: 0 };
      const dirs = FAC_DIRECTIONS[k] || [];
      const fac  = FAC_MARKERS[k] || {};

      // Status note from layout_graph
      const statusNotes = {
        lift:      "⚠ Platform lifts pending licence / installation (Oct 2026). West-entry lifts licensed, approach paths incomplete.",
        escalator: "Old FOB escalators at west and east entrances are open. New FOB escalators under construction (Dec 2026).",
        washroom:  "Positions estimated — verify on site.",
        exit:      "West entrance on GST Road. East entrance on Velachery Road.",
      };

      return `<h2>${ic(k)} Route to ${k}</h2>${note}
        <div class="g2">
          <div class="card">${svgMap(k)}
            <small>L Lifts · E Escalators · W Washroom · X Exit — Tambaram station schematic (Oct 2026, estimated positions)</small>
          </div>
          <div class="card"><b>Directions to ${fac.label || k}</b>
            <ol>${dirs.map(d => `<li>${d}`).join("")}</ol>
            <p>≈ ${dist.m} m · about ${dist.s} sec</p>
            <p class="mu"><small>${statusNotes[k] || ""}</small></p>
          </div>
        </div>`;
    },

    help() {
      return `<h2>${ic("help")} What do you need?</h2>
        <div class="tl">${["medical", "security", "lost"].map(k =>
          `<button class="t ${k !== "lost" ? "rd" : ""}" data-a="go" data-v="${k}">
            <span>${ic(k)}</span>${k[0].toUpperCase() + k.slice(1)}
            <small>ISL sign: ${k.toUpperCase()}</small>
          </button>`
        ).join("")}</div>`;
    },

    medical() {
      const { d } = State.get();
      return `<h2>${ic("medical")} Medical assistance requested</h2>
        <p class="ok"><b>Your location has been recorded:</b> Tambaram · West Concourse · Kiosk TBM-01</p>
        <p class="er"><small>⚠ SIMULATED — No real medical services have been notified.</small></p>
        ${d.request_id ? `<small>Request ID: ${d.request_id}</small>` : ""}
        ${trk(["Request recorded", "Staff notified (sim.)", "Staff arrived (sim.)"], d.step || 0)}
        <div class="card"><b>Stay where you are. Help is on the way (simulated).</b><br>
          ${d.more ? "<span class='er'>Additional help requested (simulated).</span>" : ""}</div>
        <div class="card"><b>Optional: where is the problem?</b><br>
          ${chips(["Head", "Chest", "Stomach", "Arm", "Leg", "Not sure"], "body", d.body)}</div>
        <div class="row">
          <button class="btn" data-a="more">I need more help</button>
          ${d.cf
            ? `<span>Cancel the request? <button class="ch" data-a="cxy">Yes, cancel</button> <button class="ch" data-a="cxn">No</button></span>`
            : `<button class="ch" data-a="cx">I'm okay – cancel request</button>`
          }
        </div>`;
    },

    security() {
      const { d, dis } = State.get();
      if (!d.sent) {
        return `<h2>${ic("security")} Security</h2>
          <p>A silent record will be created. Nothing loud will happen here.</p>
          <label><input type="checkbox" ${dis ? "checked" : ""} data-a="dis"> Discreet mode (neutral screen text)</label>
          <div class="tl" style="margin-top:12px">
            ${["Being followed", "Harassment", "Theft", "Unsafe person nearby", "Other"].map(x =>
              `<button class="t" style="min-height:90px;font-size:1.2em" data-a="sec" data-v="${x}">${x}</button>`
            ).join("")}
          </div>`;
      }
      return `<h2>${dis ? "Request received" : ic("security") + " Security request recorded (simulated)"}</h2>
        <p class="ok">Location: Tambaram · West Concourse · Kiosk TBM-01</p>
        <p class="er"><small>⚠ SIMULATED — No real security services have been notified.</small></p>
        ${trk(dis ? ["Received", "Coming", "Here"] : ["Request recorded", "Security notified (sim.)", "Security arrived (sim.)"], d.step || 0)}
        <p>${dis ? "Please wait here." : "Stay in a well-lit, busy spot if you can."}</p>
        <div class="row">
          <button class="btn" data-a="more">I need further help</button>
          <button class="ch" data-a="hide">Quick hide screen</button>
          <button class="ch" data-a="home">I'm safe – done</button>
        </div>
        ${d.more ? "<p class='er'>Additional support requested (simulated).</p>" : ""}`;
    },

    lost() {
      return `<h2>${ic("lost")} What is lost?</h2>
        <div class="tl">
          <button class="t" data-a="lp"><span>${ic("person")}</span>A person<small>my companion</small></button>
          <button class="t" data-a="li"><span>${ic("item")}</span>An item<small>bag, phone, documents…</small></button>
        </div>`;
    },

    lostp() {
      const { d } = State.get();
      const v = d.f || {};
      if (d.sent) {
        return `<h2>Report received</h2>
          <p class="er"><small>⚠ SIMULATED — No real announcement has been made.</small></p>
          ${d.request_id ? `<small>Request ID: ${d.request_id}</small>` : ""}
          ${trk(["Report recorded", "Staff approval (sim.)", "Announcement (sim.)"], d.step || 0)}
          <div class="card"><b>Announcement text (simulated)</b>
            <p>"${v.n || "—"}, ${v.a || "—"} years, ${v.d || "no description"}: your companion is waiting at ${v.w || "the Platform 1 bench"}. Please go to them."</p>
          </div>
          ${v.dk ? `<div class="board">MESSAGE FOR ${(v.n || "").toUpperCase()}: YOUR COMPANION IS AT ${(v.w || "PLATFORM 1 BENCH").toUpperCase()} · SIMULATED DISPLAY</div>` : ""}
          <div class="row" style="margin-top:12px">
            <button class="btn" data-a="arr">My companion has arrived</button>
            <button class="ch" data-a="go" data-v="help">I need further help</button>
          </div>`;
      }
      return `<h2>${ic("person")} Lost person</h2>
        <div class="g2"><div>
          <input data-f="n" placeholder="Name of lost person" value="${v.n || ""}">
          <input data-f="a" inputmode="numeric" placeholder="Age" value="${v.a || ""}">
          <input data-f="d" placeholder="Clothes / description" value="${v.d || ""}">
          <select data-f="w"><option value="">Where will you wait?
            <option>Platform 1 bench<option>Main entrance<option>Enquiry counter<option>Waiting hall<option>Ticket counter</select>
          <label><input type="checkbox" data-f="dk" ${v.dk ? "checked" : ""}> The lost person is deaf / hard of hearing</label>
        </div>
        <div class="card"><b>Tap the map where you last saw them</b>
          <div id="mw">${svgMap(null, d.pin)}</div>
        </div></div>
        <p class="er" id="er"></p>
        <button class="btn" data-a="subp">Send to staff</button>`;
    },

    losti() {
      const { d } = State.get();
      const v = d.f || {};
      if (d.sent) {
        return `<h2>Report submitted</h2>
          <div class="card">
            <p>Reference <b>${d.request_id || "LI-DEMO"}</b>. We will contact you if the item is found.</p>
            <small>⚠ SIMULATED — Not connected to a real lost property system.</small>
          </div>
          <button class="btn" data-a="home">Done</button>`;
      }
      return `<h2>${ic("item")} Lost item</h2>
        <b>Category</b><br>${chips(["Bag", "Phone", "Wallet", "Documents", "Other"], "cat", v.cat)}
        <input data-f="c" placeholder="Colour / brand" value="${v.c || ""}">
        <input data-f="t" placeholder="Train number / coach (optional)" value="${v.t || ""}">
        <input data-f="d" placeholder="Describe the item" value="${v.d || ""}">
        <input data-f="ct" placeholder="Phone or email for updates (optional)" value="${v.ct || ""}">
        <label><input type="checkbox" data-f="cs" ${v.cs ? "checked" : ""}> I consent to being contacted</label>
        <p class="er" id="er"></p>
        <button class="btn" data-a="subi">Submit report</button>`;
    },

    sos() {
      const { d } = State.get();
      return `<h2>${ic("alert")} Alert recorded — station staff</h2>
        <p class="ok"><b>Your location:</b> Tambaram · West Concourse · Kiosk TBM-01</p>
        <p class="er"><small>⚠ SIMULATED — No real staff or emergency services have been notified. In a real emergency, use the physical emergency call button beside this kiosk.</small></p>
        ${d.request_id ? `<small>Request ID: ${d.request_id}</small>` : ""}
        ${trk(["Alert recorded", "Staff notified (sim.)", "Staff arrived (sim.)"], d.step || 0)}
        <div class="card"><b>Stay where you are. Help is coming (simulated).</b></div>
        <div class="card"><b>Optional: tell staff what kind of help you need</b><br>
          ${chips(["Medical", "Security", "Lost person", "Other"], "kind", d.kind)}
          ${d.kind ? `<p class="ok">Staff have been told: ${d.kind} (simulated).</p>` : ""}
        </div>
        <div class="row">
          <button class="btn" data-a="more">I need more help</button>
          ${d.cf
            ? `<span>Cancel? <button class="ch" data-a="cxy">Yes, cancel</button> <button class="ch" data-a="cxn">No</button></span>`
            : `<button class="ch" data-a="cx">I'm okay – cancel</button>`
          }
          ${d.more ? "<span class='er'>Extra staff requested (simulated).</span>" : ""}
        </div>`;
    },

    ticket() {
      return `<h2>${ic("ticket")} Ticket counter</h2>
        <div class="card">
          <p>Ticket counters are located in the west concourse near the GST Road entrance.</p>
          <p>For unreserved tickets, use the <b>UTS mobile app</b> or the <b>UTS counter</b> in the west concourse.</p>
          <p class="mu"><small>⚠ This is an estimated direction notice. Verify at the station enquiry counter.</small></p>
        </div>
        <button class="btn" data-a="home">Back to home</button>`;
    },

    done() {
      const { d } = State.get();
      return `<div class="card" style="text-align:center"><h2>${d.m}</h2>
        <button class="btn" data-a="home">Home</button></div>`;
    },
  };

  // ── Header + nav + sim bar ─────────────────────────────────────────────

  const SIM_GESTURES = [
    "train", "when", "destination", "route", "where", "help", "medical", "security", "lost", "back", "cancel"
  ];

  function hd() {
    const s = State.get();
    return `<div class="hd">
      <div><b>Tambaram (TBM)</b> <small>· Southern Railway · Kiosk TBM-01</small></div>
      <div class="r">
        ${["en", "ta", "hi"].map(l =>
          `<button class="ch ${s.lang === l ? "on" : ""}" data-a="lang" data-v="${l}">${{ en: "EN", ta: "தமிழ்", hi: "हिं" }[l]}</button>`
        ).join("")}
        <button class="ch" data-a="fs" aria-label="Larger text">A+</button>
        <button class="sos" data-a="sos">SOS – Alert staff</button>
      </div>
    </div>`;
  }

  function nav() {
    const scr = State.get().scr;
    if (["idle", "home"].includes(scr)) return "";
    return `<div class="nav">
      <button class="ch" data-a="back">← Back</button>
      <button class="ch" data-a="home">Home</button>
    </div>`;
  }

  function sim() {
    return `<div class="sim">
      <b>Sign simulator (demo):</b>
      ${SIM_GESTURES.map(s => `<button data-a="sg" data-v="${s}">${s}</button>`).join("")}
    </div>`;
  }

  function modal() {
    const s = State.get();
    if (s.to) {
      return `<div class="mod"><div><h2>Still there?</h2>
        <p>Session ends in 10 seconds. Touch the screen or raise your hand to continue.</p>
      </div></div>`;
    }
    if (s.m) {
      return `<div class="mod"><div>
        <div class="hand">${ic("hand")}</div>
        <h2>Did you sign "${s.m.toUpperCase()}"?</h2>
        <p class="mu">Confirm with a thumbs-up, or tap.</p>
        <div class="row" style="justify-content:center">
          <button class="btn" data-a="sy">Yes</button>
          <button class="ch" data-a="sn">No</button>
        </div>
      </div></div>`;
    }
    return "";
  }

  function render() {
    const s   = State.get();
    const app = document.getElementById("app");
    if (!app) return;
    const viewFn = V[s.scr];
    if (!viewFn) {
      app.innerHTML = hd() + nav() + `<main><p class="er">Unknown screen: ${s.scr}</p></main>` + sim() + modal();
      return;
    }
    app.innerHTML = hd() + nav() + `<main>${viewFn()}</main>` + sim() + modal();
  }

  // Expose everything app.js needs (same interface as before)
  global.Views  = { render, V, ic, rows, dl, rl };
  global._TR    = TR;   // expose for app.js action handlers
  global._FAC_MARKERS    = FAC_MARKERS;
  global._FAC_PATHS      = FAC_PATHS;
  global._FAC_DIRECTIONS = FAC_DIRECTIONS;

  // ── Bootstrap: load trains and layout from backend, then render ──────────
  Promise.all([_loadTrains(), _loadLayout()]).then(() => {
    // Re-render now that data is available; State and Views are both ready
    if (global.State) render();
  });

}(window));
