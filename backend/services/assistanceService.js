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

// In-memory store (resets on server restart)
const _store = [];

const VALID_CATEGORIES = ["medical", "security", "sos", "lost_item", "lost_person"];

const assistanceService = {
  /**
   * Create a new assistance request.
   * @param {{ category: string, terminal_id?: string, details?: object }} params
   * @returns {{ success: boolean, request_id?: string, error?: string, record?: object }}
   */
  create({ category, terminal_id = "KIOSK-K03", details = {} }) {
    if (!VALID_CATEGORIES.includes(category)) {
      return { success: false, error: `Unknown category: ${category}` };
    }

    const record = {
      request_id:   `REQ-EGM-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
      category,
      terminal_id,
      station_code: "MS",
      station_name: "Chennai Egmore",
      location:     "Main Concourse · Kiosk K-03",
      details,
      status:       "received",          // received | acknowledged | resolved
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
      // Simulated acknowledgement after 30 s — NOT a real staff action
      _sim_ack_at:  Date.now() + 30_000,
    };

    _store.push(record);

    console.log(
      `[Assistance] Created ${record.request_id} ` +
      `[${category}] — SIMULATED, no real staff notified`
    );

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
