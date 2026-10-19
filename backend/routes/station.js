/**
 * backend/routes/station.js
 * --------------------------
 * Express router for station layout and navigation data.
 */

"use strict";

const express = require("express");
const router  = express.Router();
const layout  = require("../data/egmore_layout.json");

// GET /api/station — full station metadata
router.get("/", (req, res) => {
  res.json(layout);
});

// GET /api/station/facilities — list all facilities
router.get("/facilities", (req, res) => {
  res.json({
    disclaimer: layout.disclaimer,
    facilities: Object.values(layout.facilities),
  });
});

// GET /api/station/facilities/:id — single facility with path + directions
router.get("/facilities/:id", (req, res) => {
  const fac = layout.facilities[req.params.id];
  if (!fac) return res.status(404).json({ error: "Facility not found" });
  res.json({ disclaimer: layout.disclaimer, facility: fac });
});

module.exports = router;
