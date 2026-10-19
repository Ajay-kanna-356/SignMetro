/**
 * backend/services/trainService.js
 * ---------------------------------
 * Data-access layer for train information.
 * Backed by the Tambaram (TBM) dataset from kiosk_data.json.
 *
 * Data vintage: ~2016 timetable snapshot (see README in data pack).
 * Platform, coach_position and days_of_run are blank — live data unavailable.
 */

"use strict";

const { TRAINS, getRoute, STATION } = require("../data/trains");

/** Parse "HH:MM" into minutes since midnight. Returns -1 if invalid. */
function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return -1;
  const parts = hhmm.split(":");
  if (parts.length < 2) return -1;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Simulated station clock — starts at the current real time when the module loads.
 * Using real clock instead of a fixed 18:30 offset to be more useful.
 */
function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

const trainService = {
  /**
   * All trains (static timetable).
   */
  getAll() {
    return TRAINS;
  },

  /**
   * Trains that have a departure time at TBM and depart after the current time,
   * sorted by departure. Terminates-only trains (no outgoing departure) are excluded.
   */
  getUpcoming() {
    const now = nowMinutes();
    return TRAINS
      .filter(t => {
        if (!t.departure) return false;          // terminates here — no outgoing service
        const mins = toMinutes(t.departure);
        return mins >= 0 && mins >= now;
      })
      .sort((a, b) => toMinutes(a.departure) - toMinutes(b.departure));
  },

  /**
   * Search by train number, name, destination or origin (case-insensitive substring).
   * @param {string} query
   */
  search(query = "") {
    const q = query.toLowerCase().trim();
    if (!q) return TRAINS;
    return TRAINS.filter(t =>
      t.number.includes(q) ||
      t.name.toLowerCase().includes(q) ||
      (t.destination || "").toLowerCase().includes(q) ||
      (t.from || "").toLowerCase().includes(q)
    );
  },

  /**
   * Trains to (or from) a specific destination (case-insensitive substring match).
   * @param {string} dest
   */
  getByDestination(dest = "") {
    const d = dest.toLowerCase().trim();
    return TRAINS.filter(t =>
      (t.destination || "").toLowerCase().includes(d) ||
      (t.from || "").toLowerCase().includes(d)
    );
  },

  /**
   * Single train by number.
   * @param {string} number
   */
  getByNumber(number) {
    return TRAINS.find(t => t.number === String(number)) || null;
  },

  /**
   * Full ordered route stops for a train.
   * @param {string} number
   * @returns {{ train: object, route: object[] } | null}
   */
  getRoute(number) {
    const train = this.getByNumber(number);
    if (!train) return null;
    return { train, route: getRoute(number) };
  },

  /**
   * Unique sorted destination list (trains departing from TBM or passing through).
   * Excludes blank destinations.
   */
  getDestinations() {
    const seen = new Set();
    return TRAINS
      .map(t => t.destination)
      .filter(d => d && d.trim())
      .filter(d => { if (seen.has(d)) return false; seen.add(d); return true; })
      .sort();
  },

  /** Station metadata */
  getStation() {
    return STATION;
  },
};

module.exports = trainService;
