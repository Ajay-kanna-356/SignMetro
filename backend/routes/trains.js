/**
 * backend/routes/trains.js
 * -------------------------
 * Express router for train enquiry endpoints.
 * Data: Tambaram (TBM) dataset — historical timetable snapshot (~2016).
 * Platform and live status fields are blank. Not for travel planning.
 */

"use strict";

const express      = require("express");
const router       = express.Router();
const trainService = require("../services/trainService");

// Common disclaimer added to every response
const DISCLAIMER = {
  data_source:  "Tambaram (TBM) historical timetable snapshot (~2016). Not live railway data.",
  platform_note: "Platform and coach-position fields are blank — check station display boards.",
};

// GET /api/trains              — all trains
// GET /api/trains?q=<query>    — search by number / name / destination
router.get("/", (req, res) => {
  const { q } = req.query;
  const trains = q ? trainService.search(q) : trainService.getAll();
  res.json({ ...DISCLAIMER, count: trains.length, trains });
});

// GET /api/trains/upcoming — trains yet to depart, sorted by departure time
router.get("/upcoming", (req, res) => {
  const trains = trainService.getUpcoming();
  res.json({ ...DISCLAIMER, count: trains.length, trains });
});

// GET /api/trains/destinations — unique destination list
router.get("/destinations", (req, res) => {
  const destinations = trainService.getDestinations();
  res.json({ ...DISCLAIMER, count: destinations.length, destinations });
});

// GET /api/trains/station — Tambaram station metadata
router.get("/station", (req, res) => {
  res.json(trainService.getStation());
});

// GET /api/trains/destination/:dest — trains to/from a destination
router.get("/destination/:dest", (req, res) => {
  const trains = trainService.getByDestination(req.params.dest);
  res.json({ ...DISCLAIMER, destination: req.params.dest, count: trains.length, trains });
});

// GET /api/trains/:number — single train detail
router.get("/:number", (req, res) => {
  const train = trainService.getByNumber(req.params.number);
  if (!train) return res.status(404).json({ error: "Train not found" });
  res.json({ ...DISCLAIMER, train });
});

// GET /api/trains/:number/route — full ordered station stops
router.get("/:number/route", (req, res) => {
  const result = trainService.getRoute(req.params.number);
  if (!result) return res.status(404).json({ error: "Train not found" });
  res.json({ ...DISCLAIMER, ...result });
});

module.exports = router;
