/**
 * backend/services/emailService.js
 * ---------------------------------
 * SMTP Email Dispatcher for SignMetro Staff Dashboard using Nodemailer.
 *
 * Dispatches:
 *  - "Lost Item Found" notifications to passengers with claim instructions
 *  - "Lost Person Located" updates to guardians with safe meeting points
 *  - Test / verification emails
 *
 * Features:
 *  - Clean, responsive HTML templates + plain text fallbacks
 *  - Safe fallback/simulation mode if SMTP credentials are incomplete or invalid
 *  - Full error logging without crashing the server
 */

"use strict";

require("dotenv").config();

const nodemailer = require("nodemailer");

// Cached transporter instance
let _transporter = null;
let _transporterConfigKey = "";

/**
 * Build or retrieve the Nodemailer transporter using environment variables.
 */
function getTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  const configKey = `${host}:${port}:${secure}:${user}:${pass ? "SET" : "UNSET"}`;
  if (_transporter && _transporterConfigKey === configKey) {
    return _transporter;
  }

  // Check if credentials look real (not empty and not placeholders)
  const isConfigured =
    user &&
    pass &&
    !user.includes("your_") &&
    !pass.includes("your_") &&
    pass.trim().length > 0;

  if (!isConfigured) {
    _transporter = null;
    _transporterConfigKey = configKey;
    return null;
  }

  try {
    _transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false, // Prevents self-signed cert issues on internal relays
      },
    });
    _transporterConfigKey = configKey;
    return _transporter;
  } catch (err) {
    console.warn("[EmailService] Transporter initialization warning:", err.message);
    _transporter = null;
    return null;
  }
}

/**
 * Format date for display in email templates.
 */
function formatDateTime(isoString) {
  try {
    const d = isoString ? new Date(isoString) : new Date();
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch (_) {
    return new Date().toLocaleString();
  }
}

const emailService = {
  /**
   * Check if real SMTP credentials are configured in .env.
   */
  isConfigured() {
    return getTransporter() !== null;
  },

  /**
   * Verify SMTP connection to mail server.
   */
  async verifyConnection() {
    const transporter = getTransporter();
    if (!transporter) {
      return {
        configured: false,
        message: "SMTP credentials not configured or placeholder detected in .env.",
      };
    }
    try {
      await transporter.verify();
      return { configured: true, message: "SMTP connection verified successfully." };
    } catch (err) {
      return { configured: false, error: err.message };
    }
  },

  /**
   * Send "Lost Item Found" email to the passenger.
   */
  async sendLostItemFoundEmail({
    toEmail,
    complainantName,
    requestId,
    category,
    description,
    trainCoach,
    foundLocation,
    claimInstructions,
    staffNotes,
  }) {
    if (!toEmail) {
      return { success: false, error: "Recipient email is missing." };
    }

    const stnName = process.env.STATION_NAME || "Chennai Egmore Railway Station";
    const stnCode = process.env.STATION_CODE || "MS";
    const pickupSpot =
      foundLocation ||
      process.env.STAFF_ROOM_LOCATION ||
      "Station Master Office, Platform 1 Concourse";
    const name = complainantName || "Valued Passenger";
    const reqId = requestId || `REQ-${stnCode}-${Date.now()}`;
    const itemCat = category || "Personal Item";
    const itemDesc = description || "Matching items deposited at Lost Property Office";
    const trainInfo = trainCoach ? `Train / Coach: ${trainCoach}` : null;
    const notes = staffNotes ? `<div class="note-box"><b>Staff Note:</b> ${staffNotes}</div>` : "";
    const fromAddress =
      process.env.SMTP_FROM || `"SignMetro Station Control" <${process.env.SMTP_USER || "noreply@signmetro.railway.in"}>`;

    const instructions =
      claimInstructions ||
      "Please present this email or Reference ID along with a valid government photo ID (Aadhaar, Driving License, or Voter ID) at the Station Master Office.";

    const subject = `[SignMetro] Lost Property Update: Your ${itemCat} Has Been Found (Ref: ${reqId})`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: #ffffff; padding: 28px 24px; text-align: left; }
    .header h1 { margin: 0 0 6px 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
    .header p { margin: 0; font-size: 13px; color: #93c5fd; }
    .content { padding: 28px 24px; }
    .badge { display: inline-block; background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; margin-bottom: 16px; }
    .card { background: #f8fafc; border-left: 4px solid #10b981; padding: 16px; border-radius: 6px; margin: 16px 0; }
    .details-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
    .details-table td { padding: 8px 4px; border-bottom: 1px solid #e2e8f0; }
    .details-table td.lbl { color: #64748b; width: 35%; font-weight: 500; }
    .details-table td.val { color: #0f172a; font-weight: 600; }
    .instructions-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 14px; line-height: 1.5; color: #1e40af; }
    .instructions-box h3 { margin: 0 0 8px 0; font-size: 15px; color: #1e3a8a; }
    .note-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; font-size: 13px; color: #92400e; margin: 16px 0; }
    .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .footer strong { color: #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚉 SignMetro — Passenger Assistance</h1>
      <p>${stnName} (${stnCode}) · Southern Railway</p>
    </div>
    <div class="content">
      <span class="badge">✓ Item Located</span>
      <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">Good News! Your Lost Item Was Found</h2>
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5; color: #334155;">
        Dear <b>${name}</b>,<br>
        Station staff at <b>${stnName}</b> have safely recovered property matching your recent report.
      </p>

      <div class="card">
        <table class="details-table">
          <tr><td class="lbl">Report Reference ID</td><td class="val">${reqId}</td></tr>
          <tr><td class="lbl">Item Category</td><td class="val">${itemCat}</td></tr>
          <tr><td class="lbl">Item Description</td><td class="val">${itemDesc}</td></tr>
          ${trainInfo ? `<tr><td class="lbl">Reported Train</td><td class="val">${trainInfo}</td></tr>` : ""}
          <tr><td class="lbl">Pickup Location</td><td class="val" style="color: #047857;">${pickupSpot}</td></tr>
          <tr><td class="lbl">Status Updated At</td><td class="val">${formatDateTime()}</td></tr>
        </table>
      </div>

      ${notes}

      <div class="instructions-box">
        <h3>📋 How to Claim Your Property</h3>
        <p style="margin: 0;">${instructions}</p>
      </div>

      <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
        If you have already received your item or filed this report in error, no further action is required.
      </p>
    </div>
    <div class="footer">
      <strong>SignMetro Station Operations System</strong><br>
      Chennai Egmore Railway Station · Southern Railway<br>
      Automated notice dispatched on behalf of the Station Duty Officer.
    </div>
  </div>
</body>
</html>
`;

    const textContent = `
SignMetro — Lost Property Found Notification
--------------------------------------------
Station: ${stnName} (${stnCode})
Report Reference ID: ${reqId}

Dear ${name},

Good news! Station staff at ${stnName} have safely recovered property matching your report.

Item Category: ${itemCat}
Description: ${itemDesc}
${trainInfo ? `${trainInfo}\n` : ""}
Pickup Location: ${pickupSpot}
Status: FOUND / READY FOR CLAIM

How to Claim:
${instructions}

${staffNotes ? `Staff Note: ${staffNotes}\n` : ""}

SignMetro Station Operations System
Chennai Egmore Railway Station · Southern Railway
`;

    return this._dispatchEmail({
      to: toEmail,
      from: fromAddress,
      subject,
      html: htmlContent,
      text: textContent,
      meta: { type: "lost_item_found", requestId: reqId },
    });
  },

  /**
   * Send "Lost Person Located" update email to the Guardian / Complainant.
   */
  async sendLostPersonFoundEmail({
    toEmail,
    guardianName,
    missingPersonName,
    age,
    description,
    safeLocation,
    instructions,
    staffNotes,
    requestId,
  }) {
    if (!toEmail) {
      return { success: false, error: "Guardian email is missing." };
    }

    const stnName = process.env.STATION_NAME || "Chennai Egmore Railway Station";
    const stnCode = process.env.STATION_CODE || "MS";
    const safeSpot =
      safeLocation ||
      process.env.STAFF_ROOM_LOCATION ||
      "Station Master Office & RPF Helpdesk, Platform 1";
    const gName = guardianName || "Guardian / Family Member";
    const pName = missingPersonName || "the person mentioned in your report";
    const pAge = age ? `(${age} years)` : "";
    const reqId = requestId || `REQ-${stnCode}-${Date.now()}`;
    const fromAddress =
      process.env.SMTP_FROM || `"SignMetro Station Operations" <${process.env.SMTP_USER || "noreply@signmetro.railway.in"}>`;

    const reunionInstructions =
      instructions ||
      "Please proceed immediately to the Station Master Office / RPF Control Room on Platform 1 with valid photo identification to be reunited.";

    const notes = staffNotes ? `<div class="note-box"><b>Staff Note:</b> ${staffNotes}</div>` : "";

    const subject = `[URGENT SignMetro] Missing Person Located: ${pName} is Safe at ${stnName} (Ref: ${reqId})`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #065f46 0%, #047857 100%); color: #ffffff; padding: 28px 24px; text-align: left; }
    .header h1 { margin: 0 0 6px 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 0; font-size: 13px; color: #a7f3d0; }
    .content { padding: 28px 24px; }
    .badge { display: inline-block; background: #d1fae5; color: #065f46; font-size: 13px; font-weight: 700; padding: 5px 12px; border-radius: 20px; text-transform: uppercase; margin-bottom: 16px; }
    .card { background: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; border-radius: 6px; margin: 16px 0; }
    .details-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
    .details-table td { padding: 8px 4px; border-bottom: 1px solid #dcfce7; }
    .details-table td.lbl { color: #475569; width: 35%; font-weight: 500; }
    .details-table td.val { color: #064e3b; font-weight: 700; font-size: 15px; }
    .instructions-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 18px; margin: 20px 0; font-size: 14px; line-height: 1.5; color: #1e40af; }
    .instructions-box h3 { margin: 0 0 8px 0; font-size: 16px; color: #1e3a8a; }
    .note-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; font-size: 13px; color: #92400e; margin: 16px 0; }
    .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚉 SignMetro — Passenger Assistance</h1>
      <p>${stnName} (${stnCode}) · Station Control Room</p>
    </div>
    <div class="content">
      <span class="badge">✓ Person Located & Safe</span>
      <h2 style="margin: 0 0 12px 0; font-size: 19px; color: #065f46;">Relief Alert: Missing Person Has Been Located</h2>
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5; color: #334155;">
        Dear <b>${gName}</b>,<br>
        Station security and concourse duty staff have located <b>${pName}</b> ${pAge}. They are safe and under the active care of railway personnel.
      </p>

      <div class="card">
        <table class="details-table">
          <tr><td class="lbl">Report Reference ID</td><td class="val">${reqId}</td></tr>
          <tr><td class="lbl">Person Name</td><td class="val">${pName} ${pAge}</td></tr>
          ${description ? `<tr><td class="lbl">Reported Appearance</td><td class="val" style="font-size:13px; font-weight:normal;">${description}</td></tr>` : ""}
          <tr><td class="lbl">Current Safe Location</td><td class="val" style="color: #059669;">${safeSpot}</td></tr>
          <tr><td class="lbl">Verified Time</td><td class="val" style="font-size:13px;">${formatDateTime()}</td></tr>
        </table>
      </div>

      ${notes}

      <div class="instructions-box">
        <h3>📍 Reunion Instructions</h3>
        <p style="margin: 0;">${reunionInstructions}</p>
      </div>

      <p style="font-size: 13px; color: #475569; margin-top: 18px; line-height: 1.4;">
        <b>Station Staff are also attempting to reach you by phone.</b> If you are nearby, please head directly to the Station Master Office on Platform 1.
      </p>
    </div>
    <div class="footer">
      <strong>SignMetro Station Operations Center</strong><br>
      Chennai Egmore Railway Station · Southern Railway
    </div>
  </div>
</body>
</html>
`;

    const textContent = `
SignMetro — Missing Person Located & Safe
-----------------------------------------
Station: ${stnName} (${stnCode})
Reference ID: ${reqId}

Dear ${gName},

Relief notification: Station staff have located ${pName} ${pAge}. They are safe and under railway care.

Current Safe Location:
${safeSpot}

Reunion Instructions:
${reunionInstructions}

${staffNotes ? `Staff Note: ${staffNotes}\n` : ""}

Station staff are also contacting you by phone. Please proceed to the Station Master Office, Platform 1.

SignMetro Operations Center
`;

    return this._dispatchEmail({
      to: toEmail,
      from: fromAddress,
      subject,
      html: htmlContent,
      text: textContent,
      meta: { type: "lost_person_found", requestId: reqId },
    });
  },

  /**
   * Send a test email to verify credentials.
   */
  async sendTestEmail(toEmail) {
    if (!toEmail) return { success: false, error: "Target email required." };

    const fromAddress =
      process.env.SMTP_FROM || `"SignMetro Test" <${process.env.SMTP_USER || "test@signmetro.railway.in"}>`;

    const subject = `[SignMetro] SMTP Configuration Test — Chennai Egmore`;
    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <h2 style="color: #0f172a;">SignMetro SMTP Test Successful! 🚉</h2>
        <p>This email confirms that your SMTP settings in <code>.env</code> are functioning properly.</p>
        <p><b>Dispatched at:</b> ${new Date().toLocaleString()}</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;">
        <small style="color: #64748b;">SignMetro Station Control Operations Dashboard</small>
      </div>
    `;

    return this._dispatchEmail({
      to: toEmail,
      from: fromAddress,
      subject,
      html,
      text: "SignMetro SMTP Test was successful! Sent at " + new Date().toLocaleString(),
      meta: { type: "test_email" },
    });
  },

  /**
   * Internal dispatcher — sends via Nodemailer or simulates if unconfigured.
   */
  async _dispatchEmail({ to, from, subject, html, text, meta = {} }) {
    const transporter = getTransporter();

    // Simulation / Dev Fallback mode if SMTP is not set up
    if (!transporter) {
      console.log("=".repeat(60));
      console.log("  [EMAIL SERVICE · SIMULATION MODE]");
      console.log(`  To:      ${to}`);
      console.log(`  From:    ${from}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Type:    ${meta.type || "generic"}`);
      console.log("  Note: Set SMTP_USER & SMTP_PASS in .env for real delivery.");
      console.log("=".repeat(60));

      return {
        success: true,
        simulated: true,
        to,
        subject,
        message: "Email logged in simulation mode (SMTP credentials unconfigured).",
        dispatched_at: new Date().toISOString(),
      };
    }

    try {
      console.log(`[EmailService] Dispatching email to ${to} ("${subject}")...`);
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text,
      });

      console.log(`[EmailService] ✓ Email sent successfully! MessageID: ${info.messageId}`);
      return {
        success: true,
        simulated: false,
        messageId: info.messageId,
        to,
        subject,
        dispatched_at: new Date().toISOString(),
      };
    } catch (err) {
      console.error("[EmailService] ✗ Failed to send email via SMTP:", err.message);
      return {
        success: false,
        simulated: false,
        error: err.message,
        to,
        subject,
      };
    }
  },
};

module.exports = emailService;
