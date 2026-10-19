/**
 * backend/routes/station.js
 * --------------------------
 * Express router for Tambaram station layout and navigation data.
 * Source: backend/data/egmore_layout.json (derived from layout_graph.json TBM data pack).
 */

"use strict";

const express = require("express");
const router  = express.Router();
const layout  = require("../data/egmore_layout.json");

// GET /api/station — full station metadata + layout
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

// GET /api/station/platforms — platform list with group info
router.get("/platforms", (req, res) => {
  res.json({
    disclaimer: layout.disclaimer,
    platforms:  layout.platforms || [],
  });
});

module.exports = router;
