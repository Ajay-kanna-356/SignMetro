/**
 * backend/routes/trains.js
 * -------------------------
 * Express router for train enquiry endpoints.
 * All responses include a "simulated" flag — this is NOT live railway data.
 */

"use strict";

const express      = require("express");
const router       = express.Router();
const trainService = require("../services/trainService");

// GET /api/trains              — all trains
// GET /api/trains?q=<query>    — search by number/name/destination
router.get("/", (req, res) => {
  const { q } = req.query;
  const trains = q ? trainService.search(q) : trainService.getAll();
  res.json({ simulated: true, trains });
});

// GET /api/trains/upcoming — trains yet to depart (simulated clock)
router.get("/upcoming", (req, res) => {
  res.json({ simulated: true, trains: trainService.getUpcoming() });
});

// GET /api/trains/destinations — unique destination list
router.get("/destinations", (req, res) => {
  res.json({ simulated: true, destinations: trainService.getDestinations() });
});

// GET /api/trains/destination/:dest — trains to a destination
router.get("/destination/:dest", (req, res) => {
  const trains = trainService.getByDestination(req.params.dest);
  res.json({ simulated: true, destination: req.params.dest, trains });
});

// GET /api/trains/:number — train detail
router.get("/:number", (req, res) => {
  const train = trainService.getByNumber(req.params.number);
  if (!train) return res.status(404).json({ error: "Train not found" });
  res.json({ simulated: true, train });
});

// GET /api/trains/:number/route — full station stops
router.get("/:number/route", (req, res) => {
  const result = trainService.getRoute(req.params.number);
  if (!result) return res.status(404).json({ error: "Train not found" });
  res.json({ simulated: true, ...result });
});

module.exports = router;
