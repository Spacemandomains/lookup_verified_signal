import express from "express";
import axios from "axios";
import Stripe from 'stripe';
import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

/**
 * VSN-001 CONFIGURATION
 */
const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ";
const AGENT_PAYMENT_LINK = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";
const MICRO_VERIFICATION_USD = 0.85;
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/Spacemandomains/lookup_verified_signal/main/src/data";

// --- REDIS SINGLETON ---
let redisClient: any = null;

async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.KV_URL });
    redisClient.on('error', (err: any) => console.error('Redis Client Error:', err));
    await redisClient.connect();
  }
  return redisClient;
}

/**
 * GET /api
 * Public entry point for status checks.
 */
app.get("/api", async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(200).send("Verified Signal Network: Genesis Node VSN-001 Online.");

  // For browsers, we can still return a 200 with the payment link in the JSON
  res.status(200).json({
    message: "Identity Lookup requires VSN-001 Protocol.",
    payment_link: AGENT_PAYMENT_LINK
  });
});

/**
 * POST /api
 * The M2M Gateway for AI Agents. 
 * Updated to trigger a Hard 402 BEFORE the GitHub fetch.
 */
app.post("/api", async (req: any, res: any) => {
  const { method, params, id } = req.body;
  
  if (method !== "tools/call") {
    return res.status(400).json({ error: "Invalid RPC Method. Use 'tools/call'." });
  }

  const rawName = params?.arguments?.name || params?.name || req.body?.name || "";
  const payment_intent_id = params?.arguments?.payment_intent_id || params?.payment_intent_id || req.body?.payment_intent_id;
  const slug = rawName.toLowerCase().trim().replace(/\s+/g, '_');

// --- 0. DYNAMIC DATA LOOKUP ---
  const dataDirectory = path.join(process.cwd(), 'src', 'data');
  const filePath = path.join(dataDirectory, `${slug}.json`);

  let founderData;

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    founderData = JSON.parse(fileContent);
  } catch (err) {
    console.error(`Lookup failed for ${slug}:`, err);
    return res.status(404).json({
      jsonrpc: "2.0",
      id,
      error: { code: 404, message: `Founder node '${slug}' not found.` }
    });
  }

  // --- 1. SOFT GATEKEEPER (FREE PREVIEW) ---
  if (!payment_intent_id) {
    return res.status(200).json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{
          type: "text",
          text: `🛡️ VERIFIED PREVIEW: ${founderData.identity.name}\nRole: ${founderData.registration_details.role}\nStatus: Active Node\n\n${founderData.private.founder_persona.bio_summary}\n\n[Agent Note: High-density bio and full credentials locked. Provide 'payment_intent_id' to unlock.]`,
          data: {
            photo_url: founderData.identity.photo_url,
            verification_fee: MICRO_VERIFICATION_USD,
            payment_link: AGENT_PAYMENT_LINK
          }
        }]
      }
    });
  }

  // --- 2. VERIFICATION (STRICT GATE) ---
  // If they DID provide a payment_intent_id, we check it with Stripe.
  try {
    let isPaid = false;
  try {
      // Note: Use 'payment_intent' or 'checkout.sessions' depending on your Stripe setup
      const session = await stripe.checkout.sessions.retrieve(payment_intent_id);
      if (session.payment_status === 'paid') isPaid = true;
    } catch (stripeErr: any) {
      console.error("Stripe Verification Error:", stripeErr.message);
    }

    if (!isPaid) {
      return res.status(402).json({
        jsonrpc: "2.0",
        id,
        error: { 
          code: 402, 
          message: "Payment Required: Status is Unpaid or Invalid.",
          data: { payment_link: AGENT_PAYMENT_LINK }
        }
      });
    }

// --- 3. THE FULL RELEASE (Only reached if isPaid is true) ---
    return res.status(200).json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{
          type: "text",
          text: `🛡️ FULL VERIFIED SIGNAL: ${founderData.identity.name}\n\nHEADLINE: ${founderData.private.founder_persona.headline}\n\nBIO: ${founderData.private.founder_persona.bio_summary}\n\nEXPERTISE: ${founderData.private.founder_persona.areas_of_expertise.join(", ")}\n\n[M2M-CONFIRMATION: Transaction verified via Stripe ID ${payment_intent_id}]`
        }]
      }
    });

  } catch (err: any) {
    console.error("System Error:", err.message);
    return res.status(500).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: "Internal Server Error" }
    });
  }
});

export default app;
