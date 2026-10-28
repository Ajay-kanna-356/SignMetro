/**
 * backend/services/assistanceService.js
 * ---------------------------------------
 * Incident Store & Dispatcher for SignMetro.
 * Handles Medical, Security, SOS emergencies, Lost Person, and Lost Property reports.
 *
 * Persistence:
 *  - Automatically loads and persists incidents to backend/data/incidents.json
 *
 * Real-Time & Communications:
 *  - Broadcasts live WebSocket events to all connected Staff Dashboards & Kiosks
 *  - Dispatches SMS alerts via notificationService
 *  - Sends professional HTML confirmation emails via emailService on item/person found
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const notificationService = require("./notificationService");
const emailService = require("./emailService");
const wsManager = require("../wsManager");

const DATA_FILE = path.join(__dirname, "..", "data", "incidents.json");
const VALID_CATEGORIES = ["medical", "security", "sos", "lost_item", "lost_person"];

// In-memory cache synced with disk
let _store = [];

/**
 * Load incidents from disk on startup.
 */
function _loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      _store = JSON.parse(raw);
      console.log(`[AssistanceService] Loaded ${_store.length} incidents from disk.`);
    } else {
      _store = _getInitialSeedData();
      _saveStore();
      console.log(`[AssistanceService] Initialized incident store with demo seed data.`);
    }
  } catch (err) {
    console.error("[AssistanceService] Error reading incidents.json:", err.message);
    _store = _getInitialSeedData();
  }
}

/**
 * Persist in-memory store to disk safely.
 */
function _saveStore() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(_store, null, 2), "utf-8");
  } catch (err) {
    console.error("[AssistanceService] Failed to save incidents.json:", err.message);
  }
}

/**
 * Initial seed incidents for demonstration and testing.
 */
function _getInitialSeedData() {
  const now = Date.now();
  return [
    {
      request_id: "REQ-MS-20261028-A4F1",
      category: "lost_item",
      terminal_id: "KIOSK-K03",
      station_code: "MS",
      station_name: "Chennai Egmore",
      location: "Platform 1 · Near Enquiry Counter",
      details: {
        cat: "Bag",
        c: "Black HP Backpack with orange strap",
        d: "Contains college notebooks and a blue water bottle",
        t: "12637 Vaigai SF Exp (Coach S4)",
        ct: "kanna.station.test@gmail.com",
        name: "R. Kannan",
        phone: "+91 98401 23456",
        cs: true,
      },
      status: "received",
      created_at: new Date(now - 12 * 60 * 1000).toISOString(),
      updated_at: new Date(now - 12 * 60 * 1000).toISOString(),
    },
    {
      request_id: "REQ-MS-20261028-B8D2",
      category: "lost_person",
      terminal_id: "KIOSK-K01",
      station_code: "MS",
      station_name: "Chennai Egmore",
      location: "Main Concourse Entrance Gate 2",
      details: {
        n: "Aarav",
        a: "7",
        d: "Wearing yellow t-shirt and blue jeans, carrying a Spiderman water bottle",
        w: "Platform 1 bench near Waiting Hall",
        dk: false,
        gn: "Priya Sharma (Mother)",
        phone: "+91 94441 87654",
        email: "priya.sharma.test@gmail.com",
        pin: [280, 140],
      },
      status: "received",
      created_at: new Date(now - 6 * 60 * 1000).toISOString(),
      updated_at: new Date(now - 6 * 60 * 1000).toISOString(),
    },
    {
      request_id: "REQ-MS-20261028-C9E3",
      category: "medical",
      terminal_id: "KIOSK-K03",
      station_code: "MS",
      station_name: "Chennai Egmore",
      location: "Platform 1 Concourse",
      details: {
        body: "Dizziness & Chest tightness",
        notes: "Senior citizen requested immediate wheelchair assistance",
      },
      status: "acknowledged",
      acknowledged_at: new Date(now - 25 * 60 * 1000).toISOString(),
      created_at: new Date(now - 30 * 60 * 1000).toISOString(),
      updated_at: new Date(now - 25 * 60 * 1000).toISOString(),
    },
  ];
}

// Initialize on module load
_loadStore();

const assistanceService = {
  /**
   * Create or update an assistance request.
   * If request_id is supplied and exists, updates the existing request instead of creating a duplicate.
   */
  create({ category, terminal_id = process.env.KIOSK_ID || "KIOSK-K03", details = {}, request_id = null }) {
    if (request_id) {
      const existing = this.getById(request_id);
      if (existing) {
        const updated = this.updateDetails(request_id, details);
        return { success: true, request_id: existing.request_id, updated: true, record: updated };
      }
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return { success: false, error: `Unknown category: ${category}` };
    }

    const stnCode = process.env.STATION_CODE || "MS";
    const stnName = process.env.STATION_NAME || "Chennai Egmore";

    const record = {
      request_id:   `REQ-${stnCode}-${Date.now().toString().slice(-6)}-${randomUUID().slice(0, 4).toUpperCase()}`,
      category,
      terminal_id,
      station_code: stnCode,
      station_name: stnName,
      location:     details.location || "Main Concourse · Platform 1 Gate",
      details,
      status:       "received", // received | acknowledged | found | resolved
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    };

    // Prepend so newest is first
    _store.unshift(record);
    _saveStore();

    console.log(`[Assistance] Created ${record.request_id} [${category}] at ${record.station_name}`);

    // Broadcast in real-time to all connected Staff Dashboards & Kiosks
    wsManager.broadcastToBrowsers({
      type: "ASSISTANCE_NEW",
      data: record,
    });

    // Asynchronously dispatch emergency SMS / calls
    this._dispatchSMSNotifications(record);

    return { success: true, request_id: record.request_id, updated: false, record };
  },

  /**
   * Update details of an active incident without creating a duplicate.
   */
  updateDetails(request_id, newDetails = {}) {
    const r = this.getById(request_id);
    if (!r) return null;

    r.details = { ...r.details, ...newDetails };
    r.updated_at = new Date().toISOString();

    _saveStore();

    console.log(`[Assistance] Updated ${request_id} details:`, newDetails);

    wsManager.broadcastToBrowsers({
      type: "ASSISTANCE_UPDATED",
      data: r,
    });

    return r;
  },

  /**
   * Retrieve all requests with optional filtering.
   */
  getAll({ category = null, status = null } = {}) {
    return _store.filter((r) => {
      if (category && category !== "all") {
        if (category === "emergency") {
          if (!["sos", "medical", "security"].includes(r.category)) return false;
        } else if (r.category !== category) {
          return false;
        }
      }
      if (status && status !== "all") {
        if (status === "active") {
          if (["resolved", "found"].includes(r.status)) return false;
        } else if (r.status !== status) {
          return false;
        }
      }
      return true;
    });
  },

  /**
   * Retrieve single request by ID.
   */
  getById(request_id) {
    return _store.find((r) => r.request_id === request_id) || null;
  },

  /**
   * Acknowledge an incident (silences alarm on staff dashboard and marks under staff review).
   */
  acknowledge(request_id, { staffNotes = "", staffName = "Station Duty Officer" } = {}) {
    const r = this.getById(request_id);
    if (!r) return null;

    r.status          = "acknowledged";
    r.acknowledged_at = new Date().toISOString();
    r.updated_at      = new Date().toISOString();
    r.acknowledged_by = staffName;
    if (staffNotes) r.staff_notes = staffNotes;

    _saveStore();

    wsManager.broadcastToBrowsers({
      type: "ASSISTANCE_ACKNOWLEDGED",
      data: r,
    });

    return r;
  },

  /**
   * Mark Lost Item or Lost Person as Found/Located.
   * Dispatches automated email to the complainant / guardian via Nodemailer.
   */
  async markFound(
    request_id,
    {
      foundLocation = "",
      claimInstructions = "",
      staffNotes = "",
      staffName = "Station Duty Officer",
      sendEmail = true,
      customEmail = "",
    } = {}
  ) {
    const r = this.getById(request_id);
    if (!r) return { success: false, error: "Incident not found" };

    const isPerson = r.category === "lost_person";
    r.status      = "found";
    r.resolved_at = new Date().toISOString();
    r.updated_at  = new Date().toISOString();
    r.resolution  = {
      type: isPerson ? "person_located" : "item_found",
      found_location: foundLocation || process.env.STAFF_ROOM_LOCATION || "Station Master Office, Platform 1",
      claim_instructions: claimInstructions,
      staff_notes: staffNotes,
      resolved_by: staffName,
      timestamp: new Date().toISOString(),
    };

    let emailResult = null;

    if (sendEmail) {
      // Find complainant/guardian email address
      const targetEmail =
        customEmail ||
        (r.details && (r.details.email || r.details.gm)) ||
        (r.details && r.details.ct && r.details.ct.includes("@") ? r.details.ct : null);

      if (targetEmail) {
        if (isPerson) {
          emailResult = await emailService.sendLostPersonFoundEmail({
            toEmail: targetEmail,
            guardianName: r.details.gn || r.details.name || "Guardian",
            missingPersonName: r.details.n || "Missing Person",
            age: r.details.a || "",
            description: r.details.d || "",
            safeLocation: r.resolution.found_location,
            instructions: claimInstructions,
            staffNotes,
            requestId: r.request_id,
          });
        } else {
          emailResult = await emailService.sendLostItemFoundEmail({
            toEmail: targetEmail,
            complainantName: r.details.name || r.details.gn || "Valued Passenger",
            requestId: r.request_id,
            category: r.details.cat || "Personal Item",
            description: [r.details.c, r.details.d].filter(Boolean).join(" · "),
            trainCoach: r.details.t || "",
            foundLocation: r.resolution.found_location,
            claimInstructions,
            staffNotes,
          });
        }

        r.email_dispatch = {
          sent: emailResult.success,
          simulated: emailResult.simulated || false,
          to: targetEmail,
          timestamp: new Date().toISOString(),
          error: emailResult.error || null,
        };
      } else {
        r.email_dispatch = {
          sent: false,
          reason: "No email address was provided in the report.",
        };
      }
    }

    _saveStore();

    wsManager.broadcastToBrowsers({
      type: "ASSISTANCE_FOUND",
      data: r,
      emailResult,
    });

    return { success: true, record: r, emailResult };
  },

  /**
   * Mark an incident fully resolved.
   */
  resolve(request_id, { staffNotes = "", staffName = "Station Duty Officer" } = {}) {
    const r = this.getById(request_id);
    if (!r) return null;

    r.status      = "resolved";
    r.resolved_at = new Date().toISOString();
    r.updated_at  = new Date().toISOString();
    r.resolved_by = staffName;
    if (staffNotes) r.staff_notes = staffNotes;

    _saveStore();

    wsManager.broadcastToBrowsers({
      type: "ASSISTANCE_RESOLVED",
      data: r,
    });

    return r;
  },

  /**
   * Delete or clear an incident (for testing / cleanup).
   */
  delete(request_id) {
    const idx = _store.findIndex((r) => r.request_id === request_id);
    if (idx === -1) return false;
    _store.splice(idx, 1);
    _saveStore();
    wsManager.broadcastToBrowsers({ type: "ASSISTANCE_DELETED", request_id });
    return true;
  },

  /**
   * Internal helper to dispatch automated SMS notifications.
   */
  _dispatchSMSNotifications(record) {
    const { category, location, details, terminal_id, station_name, request_id } = record;

    if (category === "medical") {
      notificationService.sendMedicalSMS({
        location,
        details,
        kioskId: terminal_id,
        stationName: station_name,
        requestId: request_id,
      }).catch((err) => console.error("[Medical SMS Error]", err.message));
    } else if (category === "security") {
      notificationService.sendSecuritySMS({
        location,
        details,
        kioskId: terminal_id,
        stationName: station_name,
        requestId: request_id,
      }).catch((err) => console.error("[Security SMS Error]", err.message));
    } else if (category === "sos") {
      notificationService.sendSosSMS({
        location,
        details,
        kioskId: terminal_id,
        stationName: station_name,
        requestId: request_id,
      }).catch((err) => console.error("[SOS SMS Error]", err.message));
    } else if (category === "lost_person") {
      notificationService.sendLostPersonSMS({
        details,
        requestId: request_id,
        stationName: station_name,
        kioskId: terminal_id,
      }).catch((err) => console.error("[Lost Person SMS Error]", err.message));
    } else if (category === "lost_item") {
      notificationService.sendLostItemSMS({
        details,
        requestId: request_id,
        stationName: station_name,
        toPhone: (details && details.phone) || (details && details.ct) || null,
      }).catch((err) => console.error("[Lost Item SMS Error]", err.message));
    }
  },
};

module.exports = assistanceService;
