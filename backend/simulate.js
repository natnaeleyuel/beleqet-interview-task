// =============================================================================
// DEV/TEST UTILITY — Simulates a Chapa webhook callback to the NestJS API.
// NOT part of the NestJS application. NEVER commit real secrets here.
// The HMAC signature is computed dynamically from CHAPA_WEBHOOK_SECRET.
// =============================================================================

const crypto = require('crypto');

const payload = JSON.stringify({
  "event": "charge.success",
  "first_name": "Test",
  "last_name": "User",
  "email": "test@beleqet.com",
  "mobile": null,
  "currency": "ETB",
  "amount": "100.00",
  "charge": "2.50",
  "status": "success",
  "failure_reason": null,
  "mode": "test",
  "reference": "AP1CG1Ds7yqSQ",
  "type": "API",
  "tx_ref": "test-tx-1782216777015",
  "payment_method": "test",
  "customization": {
    "title": "Beleqet Test",
    "description": null,
    "logo": null
  },
  "meta": null,
  "created_at": "2026-06-23T12:14:16.000000Z",
  "updated_at": "2026-06-23T12:14:16.000000Z"
});

const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET || 'your_webhook_secret';
const signature = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

async function simulate() {
  console.log('Sending Chapa payload to localhost:4000...');
  try {
    const res = await fetch('http://localhost:4000/api/v1/escrow/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chapa-signature': signature
      },
      body: payload
    });
    const text = await res.text();
    console.log('Response:', text);
  } catch (err) {
    console.error(err);
  }
}
simulate();
