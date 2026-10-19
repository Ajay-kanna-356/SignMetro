/**
 * backend/services/trainService.js
 * ---------------------------------
 * Data-access layer for train information.
 * All data is simulated. Swap the internals here to connect to a real DB later.
 */

"use strict";

const { TRAINS, getRoute } = require("../data/trains");

/** Parse "HH:MM" into minutes since midnight */
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Simulated "station clock" offset from 18:30 at the time this module loaded */
const _START_MS   = Date.now();
const _START_MINS = 18 * 60 + 30;

function nowMinutes() {
  return (_START_MINS + Math.floor((Date.now() - _START_MS) / 60_000)) % 1440;
}

const trainService = {
  /**
   * All trains (static schedule).
   * @returns {{ number, name, destination, departure, platform, status }[]}
   */
  getAll() {
    return TRAINS;
  },

  /**
   * Trains departing after the current simulated time, sorted by departure.
   */
  getUpcoming() {
    const now = nowMinutes();
    return TRAINS
      .filter((t) => toMinutes(t.departure) >= now)
      .sort((a, b) => toMinutes(a.departure) - toMinutes(b.departure));
  },

  /**
   * Search by train number, name, or destination (case-insensitive substring).
   * @param {string} query
   */
  search(query = "") {
    const q = query.toLowerCase().trim();
    if (!q) return TRAINS;
    return TRAINS.filter(
      (t) =>
        t.number.includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.destination.toLowerCase().includes(q)
    );
  },

  /**
   * Trains to a specific destination (case-insensitive exact match).
   */
  getByDestination(dest = "") {
    const d = dest.toLowerCase().trim();
    return TRAINS.filter((t) => t.destination.toLowerCase() === d);
  },

  /**
   * Single train by number.
   * @param {string} number
   */
  getByNumber(number) {
    return TRAINS.find((t) => t.number === number) || null;
  },

  /**
   * Full route for a train.
   * @param {string} number
   * @returns {{ train: object, route: string[] } | null}
   */
  getRoute(number) {
    const train = this.getByNumber(number);
    if (!train) return null;
    return { train, route: getRoute(number) };
  },

  /** Unique sorted destination list */
  getDestinations() {
    return [...new Set(TRAINS.map((t) => t.destination))].sort();
  },
};

module.exports = trainService;
