import express from "express";
import axios from "axios";
import Stripe from 'stripe';
import { createClient } from 'redis';

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

  // --- 1. SOFT GATEKEEPER (FREE PREVIEW) ---
  // If no payment_intent_id is provided, return the Free Tier Preview instead of a 402.
  if (!payment_intent_id) {
    return res.status(200).json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{
          type: "text",
          text: `🛡️ VERIFIED PREVIEW: ${slug || "Founder"}\nStatus: Active Node\n\n[Agent Note: This is a restricted preview. To unlock the full high-density bio and professional credentials, provide a 'payment_intent_id' from the link below.]`,
          data: {
            verification_fee: MICRO_VERIFICATION_USD,
            payment_link: AGENT_PAYMENT_LINK
          }
        }]
      }
    });
  }

  // --- 2. VERIFICATION & DATA FETCHING ---
  try {
    // Verify payment with Stripe
    let isPaid = false;
    try {
      const session = await stripe.checkout.sessions.retrieve(payment_intent_id);
      if (session.payment_status === 'paid') isPaid = true;
    } catch (stripeErr: any) {
      console.error("Stripe Verification Error:", stripeErr.message);
    }

    if (!isPaid) {
      return res.status(402).json({
        jsonrpc: "2.0",
        id,
        error: { code: 402, message: "Payment status: Unpaid or Invalid." }
      });
    }

    // Fetch from GitHub
    const githubResponse = await axios.get(`${GITHUB_RAW_BASE}/${slug}.json`);
    const founderData = githubResponse.data;

    const redis = await getRedis();
    const liveSignal = await redis.get(`signal:${slug}`);

    return res.json({
      jsonrpc: "2.0",
      id,
      result: { 
        content: [{ 
          type: "text", 
          text: JSON.stringify({ status: "FULL_ACCESS", ...founderData, last_active_signal: liveSignal || "Active" }, null, 2) 
        }] 
      }
    });

  } catch (error: any) {
    return res.status(404).json({ 
      jsonrpc: "2.0", 
      id, 
      error: { code: 404, message: `Node '${slug}' not found on the network.` } 
    });
  }
});

export default app;
