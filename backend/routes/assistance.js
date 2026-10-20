/**
 * backend/routes/assistance.js
 * -----------------------------
 * REST endpoints for assistance, SOS, and lost reports.
 *
 * ⚠ All requests are stored in-memory only.
 * No real staff or emergency services are notified.
 */

"use strict";

const express           = require("express");
const router            = express.Router();
const assistanceService = require("../services/assistanceService");

// POST /api/assistance — create a new request
router.post("/", (req, res) => {
  const { category, details } = req.body;

  if (!category) {
    return res.status(400).json({ error: "category is required" });
  }

  const result = assistanceService.create({
    category,
    terminal_id: process.env.KIOSK_ID || "KIOSK-K03",
    details: details || {},
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.status(201).json({
    success:            true,
    request_id:         result.request_id,
    status:             "received",
    staff_notified:     true,
    station:            result.record.station_name,
    kiosk:              result.record.terminal_id,
    created_at:         result.record.created_at,
  });
});

// GET /api/assistance — list all requests (future staff dashboard)
router.get("/", (req, res) => {
  res.json({
    simulated: true,
    requests:  assistanceService.getAll(),
  });
});

// GET /api/assistance/:id — single request status
router.get("/:id", (req, res) => {
  const r = assistanceService.getById(req.params.id);
  if (!r) return res.status(404).json({ error: "Request not found" });
  res.json({ simulated: true, request: r });
});

// PATCH /api/assistance/:id/resolve — mark resolved (staff use)
router.patch("/:id/resolve", (req, res) => {
  const r = assistanceService.resolve(req.params.id);
  if (!r) return res.status(404).json({ error: "Request not found" });
  res.json({ simulated: true, request: r });
});

module.exports = router;
