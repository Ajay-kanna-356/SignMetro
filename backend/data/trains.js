/**
 * backend/data/trains.js
 * -----------------------
 * Tambaram (TBM) train data — loaded from kiosk_data.json and route_stops.csv.
 *
 * Data source: Tambaram data pack (snapshot ~2016, layout current Oct 2026).
 * IMPORTANT — timetable is a historical snapshot, NOT live railway information.
 * Platform, coach position and days_of_run fields are blank (live data not available).
 * Do not use for travel planning.
 *
 * Schema from kiosk_data.json trains[]:
 *   train_number, name, type, category, from_code, from_name, to_code, to_name,
 *   distance_km, duration_h, duration_m, tbm_event ("halts"|"terminates"|"originates"),
 *   tbm_arrival, tbm_departure, tbm_day, zone, sleeper, chair_car, first_ac,
 *   second_ac, third_ac, first_class, platform (""), coach_position (""), days_of_run (""),
 *   route: [{ train_number, seq, station_code, station_name, arrival, departure, day, lon, lat }]
 */

"use strict";

const path = require("path");
const fs   = require("fs");

// ── Load kiosk_data.json (authoritative source) ─────────────────────────────
const kioskDataPath = path.join(__dirname, "kiosk_data.json");
let _kioskData;
try {
  _kioskData = JSON.parse(fs.readFileSync(kioskDataPath, "utf8"));
} catch (err) {
  console.error("[trains.js] FATAL: Cannot load kiosk_data.json:", err.message);
  _kioskData = { station: { code: "TBM", name: "Tambaram" }, trains: [] };
}

/** Raw train array from kiosk_data.json */
const RAW_TRAINS = Array.isArray(_kioskData.trains) ? _kioskData.trains : [];

// ── Build normalised TRAINS array ────────────────────────────────────────────
// The UI expects: { number, name, destination, departure, platform, status }
// For trains that originate at TBM: use tbm_departure as the "departure" time.
// For trains that halt at TBM:      use tbm_departure if available, else tbm_arrival.
// For trains that terminate at TBM: use tbm_arrival (no outgoing departure).
// Platform is blank in the dataset — we display "Check board" instead of inventing one.

function _departureClock(t) {
  if (t.tbm_departure && t.tbm_departure.trim()) return t.tbm_departure.trim();
  if (t.tbm_arrival   && t.tbm_arrival.trim())   return t.tbm_arrival.trim();
  return null;
}

function _destination(t) {
  // From TBM's perspective: if train terminates here, "from" is the origin.
  // Passengers want to know where the train is going (to_name) unless it ends here.
  if (t.tbm_event === "terminates") return t.from_name || t.to_name;
  return t.to_name || t.from_name;
}

const TRAINS = RAW_TRAINS
  .filter(t => t.train_number && t.name) // skip malformed rows
  .map(t => ({
    number:        String(t.train_number).trim(),
    name:          t.name.trim(),
    destination:   _destination(t),
    from:          t.from_name || "",
    departure:     _departureClock(t),   // null for terminates-only
    platform:      t.platform || "",     // blank — live data not in dataset
    status:        "Scheduled",          // static timetable, no live status
    tbm_event:     t.tbm_event || "",
    tbm_arrival:   t.tbm_arrival  || null,
    tbm_departure: t.tbm_departure || null,
    category:      t.category || "",
    type:          t.type || "",
    zone:          t.zone || "",
    distance_km:   t.distance_km || null,
    duration_h:    t.duration_h  || 0,
    duration_m:    t.duration_m  || 0,
    sleeper:       !!t.sleeper,
    chair_car:     !!t.chair_car,
    first_ac:      !!t.first_ac,
    second_ac:     !!t.second_ac,
    third_ac:      !!t.third_ac,
    first_class:   !!t.first_class,
    // Route stops are embedded in kiosk_data.json
    _route: Array.isArray(t.route) ? t.route : [],
  }));

// ── Route helper ────────────────────────────────────────────────────────────

/**
 * Return the ordered route stop list for a train number.
 * Uses the embedded route from kiosk_data.json (authoritative).
 * @param {string} number - train number string
 * @returns {{ station_code, station_name, arrival, departure, day }[]}
 */
function getRoute(number) {
  const raw = RAW_TRAINS.find(t => String(t.train_number) === String(number));
  if (!raw || !Array.isArray(raw.route)) return [];
  return raw.route
    .slice()
    .sort((a, b) => (a.seq || 0) - (b.seq || 0))
    .map(s => ({
      seq:           s.seq,
      station_code:  s.station_code || "",
      station_name:  s.station_name || "",
      arrival:       s.arrival    || null,
      departure:     s.departure  || null,
      day:           s.day        || 1,
      lat:           s.lat        || null,
      lon:           s.lon        || null,
    }));
}

/** Station metadata from kiosk_data.json */
const STATION = _kioskData.station || { code: "TBM", name: "Tambaram" };

module.exports = { TRAINS, RAW_TRAINS, getRoute, STATION };
