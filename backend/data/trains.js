/**
 * backend/data/trains.js
 * -----------------------
 * Simulated train timetable data for Chennai Egmore (MS).
 *
 * IMPORTANT — all times, platforms, and statuses are SIMULATED DEMO DATA.
 * They are NOT live railway information. Do not use for travel planning.
 */

"use strict";

// Intermediate stops keyed by terminal destination
const INTERMEDIATE = {
  Madurai:          ["Chengalpattu", "Villupuram", "Tiruchirappalli", "Dindigul"],
  Tirunelveli:      ["Chengalpattu", "Villupuram", "Tiruchirappalli", "Madurai", "Kovilpatti"],
  Sengottai:        ["Chengalpattu", "Villupuram", "Tiruchirappalli", "Madurai", "Rajapalayam"],
  Rameswaram:       ["Chengalpattu", "Villupuram", "Tiruchirappalli", "Karaikudi", "Ramanathapuram"],
  Mannargudi:       ["Chengalpattu", "Villupuram", "Kumbakonam", "Thanjavur"],
  Guruvayur:        ["Chengalpattu", "Villupuram", "Tiruchirappalli", "Madurai", "Kollam"],
  Tiruchirappalli:  ["Chengalpattu", "Villupuram"],
};

const TRAINS = [
  {
    number:      "12635",
    name:        "Vaigai Express",
    destination: "Madurai",
    departure:   "06:40",
    platform:    "1",
    status:      "On time",
  },
  {
    number:      "16127",
    name:        "Guruvayur Express",
    destination: "Guruvayur",
    departure:   "15:20",
    platform:    "4",
    status:      "On time",
  },
  {
    number:      "12661",
    name:        "Pothigai Express",
    destination: "Sengottai",
    departure:   "19:15",
    platform:    "6",
    status:      "Platform changed",
  },
  {
    number:      "12631",
    name:        "Nellai Express",
    destination: "Tirunelveli",
    departure:   "19:50",
    platform:    "5",
    status:      "On time",
  },
  {
    number:      "16101",
    name:        "Boat Mail",
    destination: "Rameswaram",
    departure:   "20:35",
    platform:    "8",
    status:      "On time",
  },
  {
    number:      "16179",
    name:        "Mannai Express",
    destination: "Mannargudi",
    departure:   "21:00",
    platform:    "7",
    status:      "Delayed 30 min",
  },
  {
    number:      "12637",
    name:        "Pandian Express",
    destination: "Madurai",
    departure:   "21:40",
    platform:    "3",
    status:      "Delayed 15 min",
  },
  {
    number:      "12653",
    name:        "Rockfort Express",
    destination: "Tiruchirappalli",
    departure:   "22:30",
    platform:    "2",
    status:      "On time",
  },
];

/**
 * Return full route array for a given train (origin + intermediate + destination).
 * @param {string} number - 5-digit train number
 * @returns {string[]} ordered list of stations
 */
function getRoute(number) {
  const train = TRAINS.find((t) => t.number === number);
  if (!train) return [];
  const mid = INTERMEDIATE[train.destination] || [];
  return ["Chennai Egmore", ...mid, train.destination];
}

module.exports = { TRAINS, getRoute };
