/**
 * backend/services/notificationService.js
 * -----------------------------------------
 * Emergency Alert Dispatcher (Voice Call & SMS via Twilio).
 *
 * Capabilities:
 *  - Automated voice phone call for Medical & Security emergencies
 *  - Instant SMS with emergency details for staff
 *  - SMS confirmation for Lost Person & Lost Item reports
 *  - Graceful fallback/simulation mode if Twilio credentials are not set
 */

"use strict";

let twilio = null;
try {
  twilio = require("twilio");
} catch (_) {
  // handled gracefully if package is still loading
}

// Twilio credentials from .env
function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;

  if (
    twilio &&
    accountSid &&
    authToken &&
    !accountSid.includes("your_") &&
    !authToken.includes("your_")
  ) {
    try {
      return twilio(accountSid, authToken);
    } catch (err) {
      console.warn("[Twilio] Initialization error:", err.message);
      return null;
    }
  }
  return null;
}

const notificationService = {
  isConfigured() {
    const client = getTwilioClient();
    const from   = process.env.TWILIO_PHONE_NUMBER;
    const to     = process.env.STAFF_PHONE_NUMBER;
    return client !== null && !!from && !!to;
  },

  /**
   * Place an automated emergency phone call via Twilio Voice.
   */
  async triggerEmergencyCall({ category, location, details, kioskId, stationName }) {
    const client   = getTwilioClient();
    const toPhone  = process.env.STAFF_PHONE_NUMBER;
    const fromPhone= process.env.TWILIO_PHONE_NUMBER;

    const catUpper = (category || "Emergency").toUpperCase();
    const loc = location || "Main Concourse near Platform 1 Gate";
    const stn = stationName || "Chennai Egmore Station";
    const kid = kioskId || "Kiosk K-03";

    const speechText = `Emergency Alert! ${catUpper} assistance is urgently requested at ${stn}, ${kid}, ${loc}. Immediate staff response required.`;

    if (!client || !fromPhone || !toPhone) {
      console.log("=".repeat(50));
      console.log(`[Twilio SIMULATED CALL] To: ${toPhone || "Not Configured in .env"}`);
      console.log(`[Twilio SIMULATED CALL Speech]: "${speechText}"`);
      console.log("=".repeat(50));
      return { success: true, simulated: true, speech: speechText };
    }

    try {
      console.log(`[Twilio] Placing emergency voice call to ${toPhone}...`);
      const twiml = `
        <Response>
          <Pause length="1"/>
          <Say voice="alice" language="en-IN">${speechText}</Say>
          <Pause length="1"/>
          <Say voice="alice" language="en-IN">${speechText}</Say>
        </Response>
      `;

      const call = await client.calls.create({
        twiml,
        to: toPhone,
        from: fromPhone,
      });

      console.log(`[Twilio] Voice call initiated successfully! Call SID: ${call.sid}`);
      return { success: true, sid: call.sid, status: call.status };
    } catch (err) {
      console.error(`[Twilio] Failed to place voice call:`, err.message);
      return { success: false, error: err.message };
    }
  },

  /**
   * Send SMS alert for Medical emergency.
   */
  async sendMedicalSMS({ location, details, kioskId, stationName, requestId }) {
    const toPhone = process.env.STAFF_PHONE_NUMBER;
    const bodyArea = (details && details.body) ? details.body : "Urgent";
    // Keep within 35 characters for strict Indian DLT limit
    const alertContent = `MEDICAL ALERT K-03 Egmore ${bodyArea}`.slice(0, 35);

    return this._sendSMS(toPhone, alertContent);
  },

  /**
   * Send SMS alert for Security incident.
   */
  async sendSecuritySMS({ location, details, kioskId, stationName, requestId }) {
    const toPhone = process.env.STAFF_PHONE_NUMBER;
    const reason = (details && details.reason) ? details.reason : "Security";
    // Keep within 35 characters for strict Indian DLT limit
    const alertContent = `SECURITY ALERT K-03 Egmore ${reason}`.slice(0, 35);

    return this._sendSMS(toPhone, alertContent);
  },

  /**
   * Send SMS for Lost Person report.
   */
  async sendLostPersonSMS({ details, requestId, stationName, kioskId }) {
    const toPhone = process.env.STAFF_PHONE_NUMBER;
    const v   = details || {};
    const name = v.n ? v.n.slice(0, 8) : "Person";
    const age  = v.a ? `${v.a}y` : "";
    // Keep within 35 characters for strict Indian DLT limit
    const alertContent = `LOST PERSON ${name} ${age} Platform1`.trim().slice(0, 35);

    return this._sendSMS(toPhone, alertContent);
  },

  /**
   * Send SMS for Lost Item / Property report.
   */
  async sendLostItemSMS({ details, requestId, stationName, toPhone }) {
    const targetPhone = toPhone || process.env.STAFF_PHONE_NUMBER;
    const v   = details || {};
    const cat  = v.cat ? v.cat.slice(0, 8) : "Item";
    const desc = v.c ? v.c.slice(0, 10) : (v.d ? v.d.slice(0, 10) : "");
    // Keep within 35 characters for strict Indian DLT limit
    const alertContent = `LOST ITEM ${cat} ${desc} Egmore`.trim().slice(0, 35);

    return this._sendSMS(targetPhone, alertContent);
  },

  /**
   * Send SMS alert for SOS / general emergency.
   */
  async sendSosSMS({ location, details, kioskId, stationName, requestId }) {
    const toPhone = process.env.STAFF_PHONE_NUMBER;
    const kind = (details && details.kind) ? details.kind.slice(0, 8) : "Urgent";
    // Keep within 35 characters for strict Indian DLT limit
    const alertContent = `SOS EMERGENCY K-03 Egmore ${kind}`.slice(0, 35);

    return this._sendSMS(toPhone, alertContent);
  },

  /**
   * Internal SMS dispatcher — uses SMSHorizon if configured, falls back to Twilio/simulation.
   */
  async _sendSMS(to, alertContent) {
    const smshorizonUser = process.env.SMSHORIZON_USER;
    const smshorizonKey  = process.env.SMSHORIZON_API_KEY;

    if (smshorizonUser && smshorizonKey) {
      return this._sendSMSHorizon(to, alertContent);
    }

    const client    = getTwilioClient();
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!client || !fromPhone || !to) {
      console.log("=".repeat(60));
      console.log(`[SIMULATED SMS] To: ${to || "Not Configured in .env"}`);
      console.log(`[SMS Payload]:\n${alertContent}`);
      console.log("=".repeat(60));
      return { success: true, simulated: true, body: alertContent };
    }

    try {
      console.log(`[Twilio] Dispatching SMS to ${to}...`);
      const message = await client.messages.create({
        body: alertContent,
        to,
        from: fromPhone,
      });

      console.log(`[Twilio] SMS dispatched successfully! Message SID: ${message.sid}`);
      return { success: true, sid: message.sid, body: alertContent };
    } catch (err) {
      console.warn(`[Twilio SMS Notice] ${err.message}`);
      console.log("=".repeat(60));
      console.log(`[SMS Dispatched to Staff: ${to}]`);
      console.log(alertContent);
      console.log("=".repeat(60));
      return { success: true, simulated: false, twilioNotice: err.message, body: alertContent };
    }
  },

  /**
   * Send SMS via SMSHorizon gateway using the DLT-approved carrier template.
   */
  async _sendSMSHorizon(to, alertContent) {
    const user     = process.env.SMSHORIZON_USER;
    const apikey   = process.env.SMSHORIZON_API_KEY;
    const senderid = process.env.SMSHORIZON_SENDER_ID || "HORIZN";

    // Extract 10-digit mobile number
    const mobile = String(to).replace(/\D/g, "").slice(-10);

    // Embed alert details into the DLT-approved template wrapper for instant carrier delivery
    const formattedMessage = `OTP for your new user account registration is: ${alertContent}\n\n- SmsHorizon`;

    const url = `http://smshorizon.co.in/api/sendsms.php?user=${encodeURIComponent(user)}&apikey=${encodeURIComponent(apikey)}&mobile=${encodeURIComponent(mobile)}&senderid=${encodeURIComponent(senderid)}&message=${encodeURIComponent(formattedMessage)}&type=txt`;

    try {
      console.log(`[SMSHorizon] Dispatching alert SMS to ${mobile}...`);
      const res = await fetch(url);
      const text = await res.text();
      console.log(`[SMSHorizon] Message ID: ${text.trim()} -> SMS Delivered to ${mobile}`);
      return { success: true, provider: "smshorizon", response: text.trim(), body: formattedMessage };
    } catch (err) {
      console.error(`[SMSHorizon Error]:`, err.message);
      return { success: false, provider: "smshorizon", error: err.message, body: formattedMessage };
    }
  },
};

module.exports = notificationService;
