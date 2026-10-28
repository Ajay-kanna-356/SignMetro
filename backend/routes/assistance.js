/**
 * backend/routes/assistance.js
 * -----------------------------
 * REST endpoints for Assistance, Emergencies, and Staff Dashboard management.
 */

"use strict";

const express           = require("express");
const router            = express.Router();
const assistanceService = require("../services/assistanceService");
const emailService      = require("../services/emailService");

// POST /api/assistance — create a new request (from Kiosk)
router.post("/", (req, res) => {
  const { category, details, terminal_id, request_id } = req.body;

  if (!category && !request_id) {
    return res.status(400).json({ error: "category or request_id is required" });
  }

  const result = assistanceService.create({
    category,
    terminal_id: terminal_id || process.env.KIOSK_ID || "KIOSK-K03",
    details: details || {},
    request_id: request_id || null,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.status(result.updated ? 200 : 201).json({
    success:            true,
    request_id:         result.request_id,
    updated:            result.updated,
    status:             result.record.status,
    staff_notified:     true,
    station:            result.record.station_name,
    kiosk:              result.record.terminal_id,
    created_at:         result.record.created_at,
    record:             result.record,
  });
});

// PATCH /api/assistance/:id/details — update details of an existing ticket
router.patch("/:id/details", (req, res) => {
  const r = assistanceService.updateDetails(req.params.id, req.body.details || req.body);
  if (!r) return res.status(404).json({ error: "Request not found" });
  res.json({ success: true, request: r, message: "Details updated." });
});

// GET /api/assistance — list all requests (with optional filters)
router.get("/", (req, res) => {
  const { category, status } = req.query;
  const requests = assistanceService.getAll({ category, status });
  res.json({
    success: true,
    count: requests.length,
    requests,
  });
});

// GET /api/assistance/smtp-status — check if SMTP is configured
router.get("/smtp-status", async (_req, res) => {
  const check = await emailService.verifyConnection();
  res.json({
    isConfigured: emailService.isConfigured(),
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    user: process.env.SMTP_USER ? process.env.SMTP_USER.replace(/(.{2})(.*)(@.*)/, "$1***$3") : "Not Set",
    port: process.env.SMTP_PORT || "587",
    ...check,
  });
});

// GET /api/assistance/:id — single request status
router.get("/:id", (req, res) => {
  const r = assistanceService.getById(req.params.id);
  if (!r) return res.status(404).json({ error: "Request not found" });
  res.json({ success: true, request: r });
});

// PATCH /api/assistance/:id/acknowledge — staff acknowledges alert (silences alarm)
router.patch("/:id/acknowledge", (req, res) => {
  const { staffNotes, staffName } = req.body || {};
  const r = assistanceService.acknowledge(req.params.id, { staffNotes, staffName });
  if (!r) return res.status(404).json({ error: "Request not found" });
  res.json({ success: true, request: r, message: "Alert acknowledged by staff." });
});

// POST /api/assistance/:id/found — staff marks lost item or person found and triggers email
router.post("/:id/found", async (req, res) => {
  const {
    foundLocation,
    claimInstructions,
    staffNotes,
    staffName,
    sendEmail = true,
    customEmail = "",
  } = req.body || {};

  const result = await assistanceService.markFound(req.params.id, {
    foundLocation,
    claimInstructions,
    staffNotes,
    staffName,
    sendEmail,
    customEmail,
  });

  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }

  res.json({
    success: true,
    request: result.record,
    emailResult: result.emailResult,
    message: "Item / person marked as found. Email notification processed.",
  });
});

// PATCH /api/assistance/:id/resolve — mark resolved
router.patch("/:id/resolve", (req, res) => {
  const { staffNotes, staffName } = req.body || {};
  const r = assistanceService.resolve(req.params.id, { staffNotes, staffName });
  if (!r) return res.status(404).json({ error: "Request not found" });
  res.json({ success: true, request: r, message: "Incident resolved." });
});

// DELETE /api/assistance/:id — remove an incident
router.delete("/:id", (req, res) => {
  const ok = assistanceService.delete(req.params.id);
  if (!ok) return res.status(404).json({ error: "Request not found" });
  res.json({ success: true, message: "Incident deleted." });
});

// POST /api/assistance/test-email — send a test email to verify SMTP
router.post("/test-email", async (req, res) => {
  const { toEmail } = req.body;
  if (!toEmail) {
    return res.status(400).json({ error: "toEmail is required." });
  }
  const result = await emailService.sendTestEmail(toEmail);
  res.json(result);
});

module.exports = router;
