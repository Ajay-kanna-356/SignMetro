/**
 * frontend/staff/staff.js
 * ------------------------
 * Client-side Controller for SignMetro Station Operations Center.
 * Handles WebSocket events, Web Audio siren, incident triage, and SMTP email dispatch.
 */

"use strict";

(() => {
  // Application State
  let _incidents = [];
  let _currentTab = "all";
  let _searchQuery = "";
  let _ws = null;
  let _reconnectTimer = null;

  // DOM Elements
  const E = (id) => document.getElementById(id);

  // -------------------------------------------------------------------------
  // 1. Live Clock & Timers
  // -------------------------------------------------------------------------

  function startLiveClock() {
    const timeEl = E("live-time");
    const dateEl = E("live-date");

    function tick() {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString("en-IN", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      dateEl.textContent = now.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }

    tick();
    setInterval(tick, 1000);
  }

  // -------------------------------------------------------------------------
  // 2. Relative Time Helper
  // -------------------------------------------------------------------------

  function formatTimeAgo(isoString) {
    if (!isoString) return "just now";
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 10) return "just now";
    if (diff < 60) return `${diff}s ago`;
    const m = Math.floor(diff / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return new Date(isoString).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // -------------------------------------------------------------------------
  // 3. WebSocket Real-Time Client
  // -------------------------------------------------------------------------

  function connectWebSocket() {
    if (_reconnectTimer) clearTimeout(_reconnectTimer);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    console.log(`[Staff WS] Connecting to ${wsUrl}...`);
    const pillWs = E("pill-ws");

    try {
      _ws = new WebSocket(wsUrl);

      _ws.onopen = () => {
        console.log("[Staff WS] Connected.");
        pillWs.querySelector(".indicator-dot").className = "indicator-dot dot-ws";
        pillWs.querySelector(".indicator-label").textContent = "WS: Online";
        showToast("Connected to live station relay", "success");
      };

      _ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleWebSocketMessage(msg);
        } catch (_) {}
      };

      _ws.onclose = () => {
        console.warn("[Staff WS] Disconnected. Reconnecting in 3s...");
        pillWs.querySelector(".indicator-dot").className = "indicator-dot dot-ws disconnected";
        pillWs.querySelector(".indicator-label").textContent = "WS: Offline";
        _reconnectTimer = setTimeout(connectWebSocket, 3000);
      };

      _ws.onerror = () => {
        pillWs.querySelector(".indicator-dot").className = "indicator-dot dot-ws disconnected";
      };
    } catch (err) {
      console.warn("[Staff WS] Connection error:", err.message);
      _reconnectTimer = setTimeout(connectWebSocket, 4000);
    }
  }

  function handleWebSocketMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === "ASSISTANCE_NEW") {
      const record = msg.data;
      // Prepend to list
      _incidents = [record, ..._incidents.filter((i) => i.request_id !== record.request_id)];
      render();

      // Trigger siren for critical emergency
      if (["sos", "medical", "security"].includes(record.category)) {
        triggerEmergencyAlert(record);
      } else {
        showToast(`New ${record.category.replace("_", " ")} report received (${record.request_id})`, "info");
      }
    } else if (msg.type === "ASSISTANCE_UPDATED") {
      const record = msg.data;
      _incidents = _incidents.map((i) => (i.request_id === record.request_id ? record : i));
      render();
      showToast(`Updated: ${record.request_id} · ${record.details?.body || "Details updated"}`, "info");
    } else if (msg.type === "ASSISTANCE_ACKNOWLEDGED") {
      const record = msg.data;
      _incidents = _incidents.map((i) => (i.request_id === record.request_id ? record : i));
      checkAndClearActiveEmergencies();
      render();
      showToast(`Alert acknowledged: ${record.request_id}`, "warning");
    } else if (msg.type === "ASSISTANCE_FOUND") {
      const record = msg.data;
      _incidents = _incidents.map((i) => (i.request_id === record.request_id ? record : i));
      render();
      showToast(`Item/Person marked found & email processed for ${record.request_id}`, "success");
    } else if (msg.type === "ASSISTANCE_RESOLVED") {
      const record = msg.data;
      _incidents = _incidents.map((i) => (i.request_id === record.request_id ? record : i));
      checkAndClearActiveEmergencies();
      render();
      showToast(`Incident resolved: ${record.request_id}`, "success");
    } else if (msg.type === "ASSISTANCE_DELETED") {
      _incidents = _incidents.filter((i) => i.request_id !== msg.request_id);
      checkAndClearActiveEmergencies();
      render();
    }
  }

  // -------------------------------------------------------------------------
  // 4. Emergency Alarm & Top Banner Management
  // -------------------------------------------------------------------------

  function triggerEmergencyAlert(record) {
    const banner = E("emergency-banner");
    const title = E("banner-title");
    const details = E("banner-details");

    const catUpper = (record.category || "Emergency").toUpperCase();
    title.textContent = `CRITICAL ${catUpper} ALERT: ${record.station_name || "Chennai Egmore"}`;
    details.textContent = `${record.location || "Concourse"} (Kiosk: ${record.terminal_id || "K-03"}) · ${
      record.details?.body || record.details?.reason || record.details?.kind || "Immediate response required"
    }`;

    banner.classList.remove("hidden");

    // Start audio alarm siren
    StaffAudio.startSiren();
    showToast(`🚨 URGENT: ${catUpper} alert at ${record.location}!`, "error");
  }

  function checkAndClearActiveEmergencies() {
    const hasActiveUnackEmergency = _incidents.some(
      (i) => ["sos", "medical", "security"].includes(i.category) && i.status === "received"
    );

    if (!hasActiveUnackEmergency) {
      StaffAudio.stopSiren();
      E("emergency-banner").classList.add("hidden");
    }
  }

  // -------------------------------------------------------------------------
  // 5. REST API Client
  // -------------------------------------------------------------------------

  async function fetchIncidents() {
    try {
      const res = await fetch("/api/assistance");
      const json = await res.json();
      if (json.requests) {
        _incidents = json.requests;
        render();

        // Check if there's already an active received emergency on page load
        const activeCrit = _incidents.find(
          (i) => ["sos", "medical", "security"].includes(i.category) && i.status === "received"
        );
        if (activeCrit && StaffAudio.isArmed()) {
          triggerEmergencyAlert(activeCrit);
        }
      }
    } catch (err) {
      console.error("[Staff] Failed to fetch incidents:", err);
      showToast("Could not load incidents from server", "error");
    }
  }

  async function checkSmtpStatus() {
    const pill = E("pill-smtp");
    try {
      const res = await fetch("/api/assistance/smtp-status");
      const json = await res.json();
      if (json.isConfigured) {
        pill.querySelector(".indicator-dot").className = "indicator-dot dot-smtp";
        pill.querySelector(".indicator-label").textContent = `SMTP`;
      } else {
        pill.querySelector(".indicator-dot").className = "indicator-dot dot-smtp unconfigured";
        pill.querySelector(".indicator-label").textContent = "SMTP";
      }
    } catch (_) {
      pill.querySelector(".indicator-dot").className = "indicator-dot dot-smtp unconfigured";
      pill.querySelector(".indicator-label").textContent = "SMTP";
    }
  }

  async function acknowledgeIncident(id) {
    try {
      const res = await fetch(`/api/assistance/${id}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffName: "Station Duty Officer" }),
      });
      const json = await res.json();
      if (json.success) {
        _incidents = _incidents.map((i) => (i.request_id === id ? json.request : i));
        checkAndClearActiveEmergencies();
        render();
        showToast("Incident acknowledged & siren silenced", "success");
      }
    } catch (err) {
      showToast("Failed to acknowledge incident: " + err.message, "error");
    }
  }

  async function resolveIncident(id) {
    try {
      const res = await fetch(`/api/assistance/${id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffName: "Station Duty Officer" }),
      });
      const json = await res.json();
      if (json.success) {
        _incidents = _incidents.map((i) => (i.request_id === id ? json.request : i));
        checkAndClearActiveEmergencies();
        render();
        showToast("Incident marked resolved", "success");
      }
    } catch (err) {
      showToast("Failed to resolve incident: " + err.message, "error");
    }
  }

  async function deleteIncident(id) {
    if (!confirm(`Are you sure you want to remove report ${id}?`)) return;
    try {
      const res = await fetch(`/api/assistance/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        _incidents = _incidents.filter((i) => i.request_id !== id);
        checkAndClearActiveEmergencies();
        render();
        showToast("Incident removed", "info");
      }
    } catch (err) {
      showToast("Failed to delete incident: " + err.message, "error");
    }
  }

  // -------------------------------------------------------------------------
  // 6. "Mark as Found & Send Email" Modal Handling
  // -------------------------------------------------------------------------

  function openMarkFoundModal(incident) {
    const modal = E("modal-mark-found");
    const isPerson = incident.category === "lost_person";

    E("found-req-id").value = incident.request_id;
    E("found-category").value = incident.category;

    // Set modal headers and icons
    E("found-modal-icon").textContent = isPerson ? "👤" : "🎒";
    E("found-modal-title").textContent = isPerson
      ? "Mark Person Located & Email Guardian"
      : "Mark Property Found & Email Passenger";
    E("preview-template-name").textContent = isPerson ? "Missing Person Located" : "Lost Property Found";

    // Auto-extract recipient email
    const autoEmail =
      (incident.details && (incident.details.email || incident.details.gm)) ||
      (incident.details && incident.details.ct && incident.details.ct.includes("@") ? incident.details.ct : "") ||
      "";

    const emailInput = E("found-recipient-email");
    emailInput.value = autoEmail;

    if (autoEmail) {
      E("found-email-hint").textContent = "✓ Extracted from passenger kiosk submission";
      E("found-email-hint").style.color = "#34d399";
    } else {
      E("found-email-hint").textContent = "⚠️ Passenger did not provide an email on the kiosk. Enter recipient email manually.";
      E("found-email-hint").style.color = "#f59e0b";
    }

    // Default instructions
    if (isPerson) {
      E("found-instructions").value =
        "Please proceed to the Station Master Office on Platform 1 Concourse with valid photo identification to be reunited.";
      E("found-staff-notes").placeholder = "e.g. Located near Waiting Hall Platform 2, in safe care of Station Staff";
      E("preview-text-snippet").textContent =
        `Relief Notice: ${incident.details?.n || "The missing person"} has been located safely by railway staff...`;
    } else {
      E("found-instructions").value =
        "Please present this email or your Reference ID along with a valid government photo ID at the Station Master Office to claim.";
      E("found-staff-notes").placeholder = "e.g. Found near Coach S4, turned over to Station Duty Officer";
      E("preview-text-snippet").textContent =
        `Good news! Property matching your report (${incident.details?.cat || "Item"}) has been safely deposited...`;
    }

    modal.classList.remove("hidden");
  }

  function closeMarkFoundModal() {
    E("modal-mark-found").classList.add("hidden");
  }

  // -------------------------------------------------------------------------
  // 6b. "View Location on Station Map" Modal
  // -------------------------------------------------------------------------

  function estimateZone(pin) {
    if (!pin || pin.length < 2) return "Station Concourse Area";
    const [x, y] = pin;
    if (x < 220) return "West Concourse (GST Road Entrance)";
    if (x > 580) return "East Entrance (Velachery Road)";
    if (y < 70) return "Platform 1 Area (Suburban Line)";
    if (y < 95) return "Platform 2 Area (Suburban Line)";
    if (y < 120) return "Platform 3 Area (Suburban Line)";
    if (y < 150) return "Platform 4 Area (Suburban Line)";
    if (y < 175) return "Platform 5 Area (Express Line)";
    if (y < 200) return "Platform 6 Area (Express Line)";
    if (y < 230) return "Platform 7 Area (Express Line)";
    if (y < 255) return "Platform 8 Area (Express Line)";
    if (y < 280) return "Platform 9 Area (Express Line)";
    return "Platform 10 Area (Express Line)";
  }

  function renderStationMapSvg(pin, calloutLabel = "Reported Location") {
    const platformRows = [
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
      const fill = grp === "suburban" ? "rgba(30, 41, 59, 0.9)" : "rgba(15, 23, 42, 0.9)";
      return `<rect x="240" y="${y}" width="340" height="18" rx="3" fill="${fill}" stroke="#334155"/>
              <text x="247" y="${y + 13}" font-size="10" fill="#94a3b8" font-family="Inter, sans-serif">${lbl} <tspan font-style="italic" fill="#64748b">${grp}</tspan></text>`;
    }).join("");

    const fobSvg = `
      <rect x="226" y="50" width="16" height="262" rx="3" fill="#334155" opacity="0.6"/>
      <text x="234" y="182" font-size="9" text-anchor="middle" fill="#cbd5e1" font-family="Inter, sans-serif" transform="rotate(-90,234,182)">Old Foot Over Bridge (Open)</text>`;

    const fobNewSvg = `
      <rect x="590" y="50" width="14" height="262" rx="3" fill="#334155" opacity="0.35" stroke-dasharray="5,3" stroke="#64748b"/>
      <text x="597" y="182" font-size="9" text-anchor="middle" fill="#64748b" font-family="Inter, sans-serif" transform="rotate(-90,597,182)">New FOB (Under Construction)</text>`;

    const concourseSvg = `
      <rect x="40" y="20" width="180" height="308" rx="8" fill="rgba(30, 41, 59, 0.7)" stroke="#334155"/>
      <text x="50" y="38" font-size="11" font-weight="bold" fill="#ffffff" font-family="Inter, sans-serif">West Concourse</text>
      <text x="50" y="53" font-size="10" fill="#94a3b8" font-family="Inter, sans-serif">GST Road Entrance & Ticket Counters</text>`;

    const eastLabelSvg = `
      <text x="665" y="185" font-size="10" text-anchor="middle" fill="#94a3b8" font-family="Inter, sans-serif" transform="rotate(-90,665,185)">East Entrance</text>
      <text x="665" y="210" font-size="9" text-anchor="middle" fill="#64748b" font-family="Inter, sans-serif" transform="rotate(-90,665,210)">(Velachery Road)</text>`;

    const kioskSvg = `
      <circle cx="140" cy="40" r="8" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/>
      <text x="140" y="58" font-size="10" text-anchor="middle" fill="#ffffff" font-weight="bold" font-family="Inter, sans-serif">Kiosk K-03</text>
      <text x="140" y="70" font-size="9" text-anchor="middle" fill="#94a3b8" font-family="Inter, sans-serif">(Report Origin)</text>`;

    const pinX = pin ? Math.max(10, Math.min(690, pin[0])) : 350;
    const pinY = pin ? Math.max(10, Math.min(350, pin[1])) : 180;

    const pinEl = pin
      ? `
      <g id="map-pinpoint" transform="translate(${pinX}, ${pinY})" style="filter: drop-shadow(0 4px 10px rgba(239, 68, 68, 0.7));">
        <circle cx="0" cy="0" r="24" fill="rgba(239, 68, 68, 0.2)" stroke="#ef4444" stroke-width="2">
          <animate attributeName="r" values="10;30" dur="1.4s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.9;0.1" dur="1.4s" repeatCount="indefinite"/>
        </circle>
        <circle cx="0" cy="0" r="5" fill="#ef4444" stroke="#ffffff" stroke-width="2"/>
        <path d="M0 -34 C -10 -34 -16 -28 -16 -18 C -16 -8 0 0 0 0 C 0 0 16 -8 16 -18 C 16 -28 10 -34 0 -34 Z" fill="#ef4444" stroke="#ffffff" stroke-width="2.5"/>
        <circle cx="0" cy="-18" r="6" fill="#ffffff"/>
        <!-- Floating Callout Tooltip -->
        <g transform="translate(0, -46)">
          <rect x="-85" y="-12" width="170" height="24" rx="12" fill="#0f172a" stroke="#ef4444" stroke-width="1.5"/>
          <text x="0" y="4" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="Inter, sans-serif">📍 ${escapeHtml(calloutLabel).slice(0, 20)}</text>
        </g>
      </g>`
      : "";

    return `
      <svg id="staff-map-svg" viewBox="0 0 700 360" width="100%" height="auto" style="border-radius: 8px;">
        <rect width="700" height="360" fill="#0b1120"/>
        ${concourseSvg}
        ${fobSvg}
        ${pfSvg}
        ${fobNewSvg}
        ${eastLabelSvg}
        ${kioskSvg}
        ${pinEl}
      </svg>
    `;
  }

  function openMapModal(incident) {
    const modal = E("modal-view-map");
    const isPerson = incident.category === "lost_person";
    const pin = incident.details?.pin;

    const label = isPerson
      ? (incident.details?.n ? `${incident.details.n} (Age ${incident.details?.a || "?"})` : "Missing Person")
      : (incident.details?.cat ? `${incident.details.cat}` : "Lost Item");

    const desc = isPerson
      ? [incident.details?.n, incident.details?.a ? `${incident.details.a} yrs` : "", incident.details?.d].filter(Boolean).join(" · ")
      : [incident.details?.cat, incident.details?.c, incident.details?.d].filter(Boolean).join(" · ") || "Reported property";

    E("map-modal-title").textContent = `Station Map Location · ${incident.request_id}`;
    E("map-modal-subtitle").textContent = isPerson
      ? "Exact concourse/platform location where the missing person was last seen"
      : "Exact concourse/platform location where the passenger reported losing this item";

    E("map-cat-tag").textContent = isPerson ? "👤 Missing Person" : "🎒 Lost Property";
    E("map-desc-text").textContent = desc;

    if (pin && pin.length >= 2) {
      E("map-coords-pill").textContent = `📍 Coords: (${Math.round(pin[0])}, ${Math.round(pin[1])})`;
      E("map-zone-pill").textContent = estimateZone(pin);
      E("modal-map-svg-wrap").innerHTML = renderStationMapSvg(pin, label);
    } else {
      E("map-coords-pill").textContent = "No pin recorded";
      E("map-zone-pill").textContent = "General Station Concourse";
      E("modal-map-svg-wrap").innerHTML = renderStationMapSvg(null, "No exact pinpoint");
    }

    modal.classList.remove("hidden");
  }

  function closeMapModal() {
    E("modal-view-map").classList.add("hidden");
  }

  // -------------------------------------------------------------------------
  // 7. Filtering & Search Logic
  // -------------------------------------------------------------------------

  function getFilteredIncidents() {
    return _incidents.filter((inc) => {
      // Tab filter
      if (_currentTab === "emergency") {
        if (!["sos", "medical", "security"].includes(inc.category)) return false;
      } else if (_currentTab === "lost_person") {
        if (inc.category !== "lost_person") return false;
      } else if (_currentTab === "lost_item") {
        if (inc.category !== "lost_item") return false;
      } else if (_currentTab === "resolved") {
        if (!["resolved", "found"].includes(inc.status)) return false;
      }

      // Search text filter
      if (_searchQuery.trim().length > 0) {
        const q = _searchQuery.toLowerCase();
        const str = [
          inc.request_id,
          inc.category,
          inc.location,
          inc.terminal_id,
          inc.status,
          inc.details?.n,
          inc.details?.cat,
          inc.details?.c,
          inc.details?.d,
          inc.details?.t,
          inc.details?.ct,
          inc.details?.email,
          inc.details?.phone,
          inc.details?.gn,
          inc.details?.body,
          inc.details?.reason,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!str.includes(q)) return false;
      }

      return true;
    });
  }

  // -------------------------------------------------------------------------
  // 8. Render Engine
  // -------------------------------------------------------------------------

  function render() {
    updateKPIs();
    updateTabCounts();
    renderIncidentCards();
  }

  function updateKPIs() {
    const totalCrit = _incidents.filter(
      (i) => ["sos", "medical", "security"].includes(i.category) && i.status === "received"
    ).length;
    const totalPersons = _incidents.filter((i) => i.category === "lost_person" && i.status !== "resolved").length;
    const totalItems = _incidents.filter((i) => i.category === "lost_item" && i.status !== "resolved").length;
    const totalResolved = _incidents.filter((i) => ["resolved", "found"].includes(i.status)).length;

    E("kpi-emergencies").textContent = totalCrit;
    E("kpi-persons").textContent = totalPersons;
    E("kpi-items").textContent = totalItems;
    E("kpi-resolved").textContent = totalResolved;

    const critCard = document.querySelector(".kpi-emergency");
    if (totalCrit > 0) {
      critCard.classList.add("has-active");
      E("kpi-emergencies-tag").textContent = `${totalCrit} ACTIVE ALARMS`;
    } else {
      critCard.classList.remove("has-active");
      E("kpi-emergencies-tag").textContent = "All Clear";
    }

    E("kpi-persons-tag").textContent = `${totalPersons} Open`;
    E("kpi-items-tag").textContent = `${totalItems} In Queue`;
  }

  function updateTabCounts() {
    E("tab-cnt-all").textContent = _incidents.length;
    E("tab-cnt-emergency").textContent = _incidents.filter((i) =>
      ["sos", "medical", "security"].includes(i.category)
    ).length;
    E("tab-cnt-person").textContent = _incidents.filter((i) => i.category === "lost_person").length;
    E("tab-cnt-item").textContent = _incidents.filter((i) => i.category === "lost_item").length;
    E("tab-cnt-resolved").textContent = _incidents.filter((i) => ["resolved", "found"].includes(i.status)).length;
  }

  function renderIncidentCards() {
    const list = getFilteredIncidents();
    const container = E("incidents-grid");
    E("results-count").textContent = `${list.length} report${list.length === 1 ? "" : "s"}`;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#4e5a72"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg></div>
          <p class="empty-title">No reports match this filter</p>
          <p class="empty-sub">Try a different tab or clear the search query.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map((inc) => buildCardHtml(inc)).join("");
  }

  function buildCardHtml(inc) {
    const isEmergency = ["sos", "medical", "security"].includes(inc.category);
    const isPerson = inc.category === "lost_person";
    const isItem = inc.category === "lost_item";
    const isResolved = ["resolved", "found"].includes(inc.status);

    let cardClass = "incident-card";
    if (isEmergency) cardClass += " crit-card";
    else if (isPerson) cardClass += " person-card";
    else if (isItem) cardClass += " item-card";
    if (isResolved) cardClass += " resolved-card";

    let icon = "📋";
    let catLabel = inc.category.toUpperCase().replace("_", " ");
    if (inc.category === "medical") { icon = "🩺"; catLabel = "MEDICAL EMERGENCY"; }
    else if (inc.category === "security") { icon = "👮"; catLabel = "SECURITY ALERT"; }
    else if (inc.category === "sos") { icon = "🚨"; catLabel = "SOS EMERGENCY"; }
    else if (isPerson) { icon = "👤"; catLabel = "MISSING PERSON REPORT"; }
    else if (isItem) { icon = "🎒"; catLabel = "LOST PROPERTY REPORT"; }

    let statusPillClass = `status-${inc.status}`;
    let statusLabel = inc.status.toUpperCase();
    if (inc.status === "received") statusLabel = "🔴 NEW ALERT";
    else if (inc.status === "acknowledged") statusLabel = "🟡 ACKNOWLEDGED";
    else if (inc.status === "found") statusLabel = isPerson ? "🟢 PERSON LOCATED" : "🟢 ITEM FOUND";
    else if (inc.status === "resolved") statusLabel = "⚪ RESOLVED";

    // Build category-specific detail blocks
    let detailsHtml = "";

    if (isEmergency) {
      const issue = inc.details?.body || inc.details?.reason || inc.details?.kind || "Assistance needed";
      detailsHtml = `
        <div class="detail-item">
          <span class="detail-label">Reported Issue</span>
          <span class="detail-value" style="color: #fca5a5; font-weight: 700;">${escapeHtml(issue)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Location / Terminal</span>
          <span class="detail-value">${escapeHtml(inc.location)} · <b>${escapeHtml(inc.terminal_id)}</b></span>
        </div>
      `;
    } else if (isPerson) {
      const pName = inc.details?.n || "Person";
      const pAge = inc.details?.a ? `${inc.details.a} yrs` : "";
      const pDesc = inc.details?.d || "No clothing description provided";
      const gName = inc.details?.gn || "Guardian";
      const phone = inc.details?.phone || inc.details?.ct || "";
      const email = inc.details?.email || inc.details?.gm || "";
      const pin = inc.details?.pin ? `Map Pin: (${Math.round(inc.details.pin[0])}, ${Math.round(inc.details.pin[1])})` : "";

      detailsHtml = `
        <div class="detail-item">
          <span class="detail-label">Missing Person</span>
          <span class="detail-value"><b>${escapeHtml(pName)}</b> ${escapeHtml(pAge)}</span>
          <span style="font-size: 12px; color: #cbd5e1;">${escapeHtml(pDesc)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Guardian / Complainant Contact</span>
          <span class="detail-value">
            <b>${escapeHtml(gName)}</b><br>
            ${phone ? `📞 <a href="tel:${phone}" class="contact-link">${escapeHtml(phone)}</a>` : "No phone provided"}<br>
            ${email ? `✉️ <a href="mailto:${email}" class="contact-link">${escapeHtml(email)}</a>` : "<span style='color:#f59e0b;'>No email provided</span>"}
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Designated Meeting Point</span>
          <span class="detail-value">${escapeHtml(inc.details?.w || "Platform 1 bench")}</span>
        </div>
      `;
    } else if (isItem) {
      const cat = inc.details?.cat || "Item";
      const desc = [inc.details?.c, inc.details?.d].filter(Boolean).join(" · ") || "Details provided at kiosk";
      const train = inc.details?.t ? `Train: ${inc.details.t}` : "";
      const email = inc.details?.email || (inc.details?.ct && inc.details.ct.includes("@") ? inc.details.ct : "");
      const phone = inc.details?.phone || (inc.details?.ct && !inc.details.ct.includes("@") ? inc.details.ct : "");

      detailsHtml = `
        <div class="detail-item">
          <span class="detail-label">Item Description</span>
          <span class="detail-value"><b>${escapeHtml(cat)}</b> · ${escapeHtml(desc)}</span>
          ${train ? `<span style="font-size: 12px; color: #93c5fd;">${escapeHtml(train)}</span>` : ""}
        </div>
        <div class="detail-item">
          <span class="detail-label">Passenger Contact Details</span>
          <span class="detail-value">
            ${email ? `✉️ <a href="mailto:${email}" class="contact-link">${escapeHtml(email)}</a>` : "<span style='color:#f59e0b;'>No email provided</span>"}<br>
            ${phone ? `📞 <a href="tel:${phone}" class="contact-link">${escapeHtml(phone)}</a>` : "No phone provided"}
          </span>
        </div>
      `;
    }

    // Email dispatch indicator if item/person was marked found
    let emailStatusBadge = "";
    if (inc.email_dispatch) {
      if (inc.email_dispatch.sent) {
        emailStatusBadge = `
          <div style="font-size: 11px; color: #34d399; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
            <span>✓ Email sent via SMTP to <b>${escapeHtml(inc.email_dispatch.to)}</b></span>
            ${inc.email_dispatch.simulated ? "<span style='color:#f59e0b;'>(Dev Simulated)</span>" : ""}
          </div>
        `;
      } else {
        emailStatusBadge = `
          <div style="font-size: 11px; color: #f59e0b; margin-top: 6px;">
            ⚠️ Email notice pending: ${escapeHtml(inc.email_dispatch.reason || "No email on record")}
          </div>
        `;
      }
    }

    // Resolution details if resolved
    let resolutionBlock = "";
    if (inc.resolution) {
      resolutionBlock = `
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); padding: 8px 12px; border-radius: 6px; font-size: 12px; color: #a7f3d0; margin-top: 8px;">
          <b>Safe Location:</b> ${escapeHtml(inc.resolution.found_location || "Station Master Office")}<br>
          ${inc.resolution.claim_instructions ? `<b>Instructions:</b> ${escapeHtml(inc.resolution.claim_instructions)}<br>` : ""}
          ${inc.resolution.staff_notes ? `<b>Staff Note:</b> ${escapeHtml(inc.resolution.staff_notes)}` : ""}
        </div>
      `;
    }

    // Build Actions
    let actionsHtml = "";

    if (inc.status === "received") {
      actionsHtml += `
        <button class="btn-action btn-ack" onclick="window.StaffApp.acknowledge('${inc.request_id}')">
          🔔 Acknowledge Alert
        </button>
      `;
    }

    if (isPerson && inc.details?.phone) {
      actionsHtml += `
        <a href="tel:${inc.details.phone}" class="btn-action btn-call">
          📞 Call Guardian (${escapeHtml(inc.details.phone)})
        </a>
      `;
    }

    if ((isItem || isPerson) && inc.status !== "found" && inc.status !== "resolved") {
      actionsHtml += `
        <button class="btn-action btn-found-mail" onclick="window.StaffApp.openFoundModal('${inc.request_id}')">
          ${isPerson ? "👤 Mark Located & Email" : "🎒 Mark Found & Email"}
        </button>
      `;
    }

    if (inc.status !== "resolved") {
      actionsHtml += `
        <button class="btn-action btn-resolve" onclick="window.StaffApp.resolve('${inc.request_id}')">
          ✓ Mark Resolved
        </button>
      `;
    }

    actionsHtml += `
      <button class="btn-action btn-del" title="Delete incident" onclick="window.StaffApp.deleteIncident('${inc.request_id}')">
        🗑️
      </button>
    `;

    return `
      <div class="${cardClass}" id="card-${inc.request_id}">
        <div class="card-top">
          <div class="card-left">
            <div class="cat-badge">${icon}</div>
            <div class="card-title-block">
              <span class="card-cat-name">${catLabel}</span>
              <span class="card-ref">${inc.request_id} · ${inc.station_name || "Chennai Egmore"}</span>
            </div>
          </div>
          <div class="card-right">
            <span class="status-pill ${statusPillClass}">${statusLabel}</span>
          </div>
        </div>

        <div class="card-details">
          ${detailsHtml}
        </div>

        ${resolutionBlock}
        ${emailStatusBadge}

        <div class="card-actions">
          <span class="card-time">${formatTimeAgo(inc.created_at)}</span>
          <div class="action-group">
            ${actionsHtml}
          </div>
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // -------------------------------------------------------------------------
  // 9. Toast Notifications
  // -------------------------------------------------------------------------

  function showToast(message, type = "info") {
    const container = E("toast-stack");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "ℹ️";
    if (type === "success") icon = "✓";
    else if (type === "error") icon = "🚨";
    else if (type === "warning") icon = "⚠️";

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // -------------------------------------------------------------------------
  // 10. Event Listeners & Setup
  // -------------------------------------------------------------------------

  function setupEventListeners() {
    // Audio Arming Toggle
    const btnAudio = E("btn-audio-toggle");
    btnAudio.addEventListener("click", async () => {
      await StaffAudio.arm();
      btnAudio.classList.add("armed");
      btnAudio.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 1 0 8"/><path d="M22 6a10 10 0 0 1 0 12"/><path d="M2 14v-4l6-2v8L2 14z"/></svg><span class="audio-label">Alarm Armed</span>`;
      showToast("Emergency siren armed. Will sound on new critical alerts.", "success");
    });

    // Test Siren Button
    E("btn-test-siren").addEventListener("click", () => {
      StaffAudio.testBeep();
      showToast("Testing 1-second alarm tone...", "info");
    });

    // Silence Siren & Acknowledge Banner Button
    E("btn-silence-siren").addEventListener("click", () => {
      StaffAudio.stopSiren();
      E("emergency-banner").classList.add("hidden");

      // Auto-acknowledge active emergencies
      const unack = _incidents.filter(
        (i) => ["sos", "medical", "security"].includes(i.category) && i.status === "received"
      );
      unack.forEach((i) => acknowledgeIncident(i.request_id));
      showToast("Emergency siren silenced and alert acknowledged.", "info");
    });

    // Filter Tabs
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
        const target = e.currentTarget;
        target.classList.add("active");
        _currentTab = target.dataset.tab;
        render();
      });
    });

    // KPI Cards Quick Filter
    document.querySelectorAll(".kpi-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        const filter = e.currentTarget.dataset.filter;
        if (filter) {
          const tabBtn = document.querySelector(`.tab[data-tab="${filter}"]`);
          if (tabBtn) tabBtn.click();
        }
      });
    });

    // Search Input
    const searchInput = E("incident-search");
    const btnClearSearch = E("btn-clear-search");

    searchInput.addEventListener("input", (e) => {
      _searchQuery = e.target.value;
      if (_searchQuery.length > 0) {
        btnClearSearch.classList.remove("hidden");
      } else {
        btnClearSearch.classList.add("hidden");
      }
      render();
    });

    btnClearSearch.addEventListener("click", () => {
      searchInput.value = "";
      _searchQuery = "";
      btnClearSearch.classList.add("hidden");
      render();
    });

    // Refresh Button
    E("btn-refresh").addEventListener("click", () => {
      fetchIncidents();
      checkSmtpStatus();
      showToast("Refreshed incidents list", "info");
    });

    // Modal: Mark Found Form Submission
    E("form-mark-found").addEventListener("submit", async (e) => {
      e.preventDefault();
      const reqId = E("found-req-id").value;
      const targetEmail = E("found-recipient-email").value.trim();
      const locationSelect = E("found-location-select").value;
      const customLoc = E("found-location-custom").value.trim();
      const foundLocation = locationSelect === "custom" ? customLoc : locationSelect;
      const instructions = E("found-instructions").value.trim();
      const staffNotes = E("found-staff-notes").value.trim();

      const btnSubmit = E("btn-submit-found");
      btnSubmit.querySelector(".btn-text").textContent = "Dispatching Email...";
      btnSubmit.querySelector(".spinner").classList.remove("hidden");
      btnSubmit.disabled = true;

      try {
        const res = await fetch(`/api/assistance/${reqId}/found`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customEmail: targetEmail,
            foundLocation,
            claimInstructions: instructions,
            staffNotes,
            sendEmail: true,
          }),
        });
        const json = await res.json();
        if (json.success) {
          _incidents = _incidents.map((i) => (i.request_id === reqId ? json.request : i));
          render();
          closeMarkFoundModal();

          if (json.emailResult?.success) {
            showToast(`✓ Email sent to ${targetEmail} and item marked found!`, "success");
          } else {
            showToast(`Marked found. Note: Email ${json.emailResult?.error || "unconfigured"}`, "warning");
          }
        } else {
          showToast(json.error || "Failed to update incident", "error");
        }
      } catch (err) {
        showToast("Error updating incident: " + err.message, "error");
      } finally {
        btnSubmit.querySelector(".btn-text").textContent = "📨 Send Email & Update Status";
        btnSubmit.querySelector(".spinner").classList.add("hidden");
        btnSubmit.disabled = false;
      }
    });

    E("found-location-select").addEventListener("change", (e) => {
      const customInput = E("found-location-custom");
      if (e.target.value === "custom") {
        customInput.classList.remove("hidden");
        customInput.focus();
      } else {
        customInput.classList.add("hidden");
      }
    });

    E("btn-close-found-modal").addEventListener("click", closeMarkFoundModal);
    E("btn-cancel-found-modal").addEventListener("click", closeMarkFoundModal);

    // Modal: Test SMTP Email
    E("btn-open-test-email").addEventListener("click", () => {
      E("modal-test-email").classList.remove("hidden");
      E("test-email-result").classList.add("hidden");
    });
    E("btn-close-test-email").addEventListener("click", () => E("modal-test-email").classList.add("hidden"));
    E("btn-cancel-test-email").addEventListener("click", () => E("modal-test-email").classList.add("hidden"));

    E("form-test-email").addEventListener("submit", async (e) => {
      e.preventDefault();
      const target = E("test-email-target").value.trim();
      const btn = E("btn-submit-test-email");
      const resultBox = E("test-email-result");

      btn.disabled = true;
      btn.querySelector(".spinner").classList.remove("hidden");

      try {
        const res = await fetch("/api/assistance/test-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toEmail: target }),
        });
        const json = await res.json();
        resultBox.classList.remove("hidden");
        if (json.success) {
          resultBox.style.color = "#34d399";
          resultBox.textContent = `✓ SUCCESS: ${json.messageId ? "MessageID: " + json.messageId : json.message}`;
          showToast("Test email sent successfully!", "success");
        } else {
          resultBox.style.color = "#f87171";
          resultBox.textContent = `✗ ERROR: ${json.error || "SMTP failed"}`;
          showToast("Test email failed: " + (json.error || "Check credentials"), "error");
        }
      } catch (err) {
        resultBox.classList.remove("hidden");
        resultBox.style.color = "#f87171";
        resultBox.textContent = `✗ NETWORK ERROR: ${err.message}`;
      } finally {
        btn.disabled = false;
        btn.querySelector(".spinner").classList.add("hidden");
      }
    });

    // Modal: Simulation
    E("btn-open-simulate").addEventListener("click", () => {
      E("modal-simulate").classList.remove("hidden");
    });
    E("btn-close-simulate").addEventListener("click", () => E("modal-simulate").classList.add("hidden"));
    E("btn-cancel-simulate").addEventListener("click", () => E("modal-simulate").classList.add("hidden"));

    document.querySelectorAll(".sim-option-card").forEach((card) => {
      card.addEventListener("click", async (e) => {
        const simType = e.currentTarget.dataset.sim;
        E("modal-simulate").classList.add("hidden");
        await simulateIncident(simType);
      });
    });
  }

  // -------------------------------------------------------------------------
  // 11. Simulation Helper
  // -------------------------------------------------------------------------

  async function simulateIncident(type) {
    let payload = {};
    if (type === "sos") {
      payload = {
        category: "sos",
        terminal_id: "KIOSK-K03",
        details: { kind: "Crowd crush / Panic at Platform 1 stairs" },
      };
    } else if (type === "medical") {
      payload = {
        category: "medical",
        terminal_id: "KIOSK-K01",
        details: { body: "Severe shortness of breath", notes: "Passenger seated at enquiry bench" },
      };
    } else if (type === "lost_person") {
      payload = {
        category: "lost_person",
        terminal_id: "KIOSK-K02",
        details: {
          n: "Kavya",
          a: "6",
          d: "Pink frock with white sandals, holding a teddy bear",
          w: "Platform 1 bench near Waiting Hall",
          dk: false,
          gn: "Meera Krishnan (Mother)",
          phone: "+91 98402 11223",
          email: "meera.krishnan.test@gmail.com",
          pin: [310, 155],
        },
      };
    } else if (type === "lost_item") {
      payload = {
        category: "lost_item",
        terminal_id: "KIOSK-K03",
        details: {
          cat: "Wallet",
          c: "Brown leather Tommy Hilfiger wallet",
          d: "Contains train ticket and SBI debit card",
          t: "12638 Pandian Exp",
          ct: "suresh.traveler.test@gmail.com",
          name: "Suresh Babu",
          phone: "+91 97908 33445",
          cs: true,
        },
      };
    }

    try {
      const res = await fetch("/api/assistance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Simulated ${type.toUpperCase()} incident created! (${json.request_id})`, "success");
      }
    } catch (err) {
      showToast("Simulation error: " + err.message, "error");
    }
  }

  // -------------------------------------------------------------------------
  // Public API attached to window for inline onclick handlers
  // -------------------------------------------------------------------------

  window.StaffApp = {
    acknowledge: acknowledgeIncident,
    resolve: resolveIncident,
    deleteIncident: deleteIncident,
    openFoundModal: (id) => {
      const inc = _incidents.find((i) => i.request_id === id);
      if (inc) openMarkFoundModal(inc);
    },
  };

  // -------------------------------------------------------------------------
  // Initial Boot
  // -------------------------------------------------------------------------

  window.addEventListener("DOMContentLoaded", () => {
    startLiveClock();
    setupEventListeners();
    fetchIncidents();
    checkSmtpStatus();
    connectWebSocket();
  });
})();
