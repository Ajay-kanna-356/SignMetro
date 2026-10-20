/**
 * backend/services/assistanceService.js
 * ---------------------------------------
 * In-memory store for assistance requests (medical, security, SOS, lost item/person).
 *
 * ⚠ SIMULATED — No real railway staff or emergency services are notified.
 * The simulated "acknowledgement" after a timeout is NOT a real staff response.
 */

"use strict";

const { randomUUID } = require("crypto");
const notificationService = require("./notificationService");

// In-memory store (resets on server restart)
const _store = [];

const VALID_CATEGORIES = ["medical", "security", "sos", "lost_item", "lost_person"];

const assistanceService = {
  /**
   * Create a new assistance request.
   * @param {{ category: string, terminal_id?: string, details?: object }} params
   * @returns {{ success: boolean, request_id?: string, error?: string, record?: object }}
   */
  create({ category, terminal_id = process.env.KIOSK_ID || "KIOSK-K03", details = {} }) {
    if (!VALID_CATEGORIES.includes(category)) {
      return { success: false, error: `Unknown category: ${category}` };
    }

    const stnCode = process.env.STATION_CODE || "MS";
    const stnName = process.env.STATION_NAME || "Chennai Egmore";

    const record = {
      request_id:   `REQ-${stnCode}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
      category,
      terminal_id,
      station_code: stnCode,
      station_name: stnName,
      location:     "Main Concourse · Platform 1 Gate",
      details,
      status:       "received",          // received | acknowledged | resolved
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
      _sim_ack_at:  Date.now() + 30_000,
    };

    _store.push(record);

    console.log(
      `[Assistance] Created ${record.request_id} ` +
      `[${category}] at ${record.station_name}`
    );

    // Dispatch automated SMS notifications asynchronously
    if (category === "medical") {
      notificationService.sendMedicalSMS({
        location: record.location,
        details,
        kioskId: record.terminal_id,
        stationName: record.station_name,
        requestId: record.request_id,
      }).catch((err) => console.error("[Medical SMS Error]", err.message));

    } else if (category === "security") {
      notificationService.sendSecuritySMS({
        location: record.location,
        details,
        kioskId: record.terminal_id,
        stationName: record.station_name,
        requestId: record.request_id,
      }).catch((err) => console.error("[Security SMS Error]", err.message));

    } else if (category === "sos") {
      notificationService.sendSosSMS({
        location: record.location,
        details,
        kioskId: record.terminal_id,
        stationName: record.station_name,
        requestId: record.request_id,
      }).catch((err) => console.error("[SOS SMS Error]", err.message));

    } else if (category === "lost_person") {
      notificationService.sendLostPersonSMS({
        details,
        requestId: record.request_id,
        stationName: record.station_name,
        kioskId: record.terminal_id,
      }).catch((err) => console.error("[Lost Person SMS Error]", err.message));

    } else if (category === "lost_item") {
      notificationService.sendLostItemSMS({
        details,
        requestId: record.request_id,
        stationName: record.station_name,
        toPhone: details.ct || null,
      }).catch((err) => console.error("[Lost Item SMS Error]", err.message));
    }

    return { success: true, request_id: record.request_id, record };
  },

  /**
   * Retrieve all requests (for a future staff dashboard).
   */
  getAll() {
    // Update simulated acknowledgement status before returning
    const now = Date.now();
    for (const r of _store) {
      if (r.status === "received" && now >= r._sim_ack_at) {
        r.status     = "acknowledged_simulated";
        r.updated_at = new Date().toISOString();
      }
    }
    return _store;
  },

  /**
   * Retrieve a single request by ID.
   */
  getById(request_id) {
    return _store.find((r) => r.request_id === request_id) || null;
  },

  /**
   * Mark a request resolved (for future staff dashboard use).
   */
  resolve(request_id) {
    const r = this.getById(request_id);
    if (!r) return null;
    r.status     = "resolved";
    r.updated_at = new Date().toISOString();
    return r;
  },
};

module.exports = assistanceService;
