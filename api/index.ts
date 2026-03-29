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
 * Centralized constants for easy scaling to VSN-011.
 */
const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ";
const AGENT_PAYMENT_LINK = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";
const MICRO_VERIFICATION_USD = 0.85;
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/Spacemandomains/lookup_verified_signal/main/src/data";

// --- REDIS SINGLETON (Prevents Connection Exhaustion) ---
let redisClient: any = null;

async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.KV_URL });
    redisClient.on('error', (err) => console.error('Redis Client Error:', err));
    await redisClient.connect();
  }
  return redisClient;
}

/**
 * GET /api?name=slug
 * Used by Humans and Search Engines to preview the Identity Node.
 */
app.get("/api", async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(200).send("Verified Signal Network: Genesis Node VSN-001 Online.");

  const slug = (name as string).toLowerCase().replace(/\s+/g, '_');
  
  try {
    // Deploy Trigger: VSN-001-Final
    // 1. Fetch Static Bio from GitHub
    const githubResponse = await axios.get(`${GITHUB_RAW_BASE}/${slug}.json`);
    const founderData = githubResponse.data;

    // 2. Fetch Live Pulse from Redis
    const redis = await getRedis();
    let liveSignal = await redis.get(`signal:${slug}`);
    if (!liveSignal) liveSignal = "Signal active. Awaiting manual pulse update.";

    // 3. Assemble the Full Oracle Response
    return res.status(200).json({
      ...founderData,
      identity: { 
        ...founderData.identity,
        display_signal: `![${founderData.identity.name}](${founderData.identity.photo_url})`,
        status_preview: "Identity Verified via VSN-001 Protocol."
      },
      agentic_metadata: {
        ...founderData.agentic_metadata,
        last_active_signal: liveSignal 
      },
      payment_action: {
        amount: MICRO_VERIFICATION_USD,
        price_id: AGENT_PRICE_ID,
        link: AGENT_PAYMENT_LINK
      }
    });
  } catch (error) {
    console.error(`Error fetching node [${slug}]:`, error.message);
    return res.status(404).json({ error: "Node not found on the Verified Signal Network." });
  }
});

/**
 * POST /api
 * The M2M (Machine-to-Machine) Gateway for AI Agents.
 */
app.post("/api", async (req: any, res: any) => {
  const { method, params, id } = req.body;
  if (method !== "tools/call") return res.status(400).send("Invalid RPC Method");

  const { name, payment_intent_id } = params?.arguments || {};
  const slug = (name || "").toLowerCase().replace(/\s+/g, '_');

  try {
    const githubResponse = await axios.get(`${GITHUB_RAW_BASE}/${slug}.json`);
    const founderData = githubResponse.data;

    const redis = await getRedis();
    let liveSignal = await redis.get(`signal:${slug}`);

    // Stripe Verification Logic
    let isPaid = false;
    if (payment_intent_id) {
      const session = await stripe.checkout.sessions.retrieve(payment_intent_id);
      if (session.payment_status === 'paid') isPaid = true;
    }

    const payload = isPaid 
      ? { status: "FULL_ACCESS_GRANTED", ...founderData } 
      : { 
          status: "PAYMENT_REQUIRED", 
          identity: { name: founderData.identity.name },
          verification_fee: MICRO_VERIFICATION_USD,
          price_id: AGENT_PRICE_ID 
        };
    
    return res.json({
      jsonrpc: "2.0",
      id,
      result: { 
        content: [{ 
          type: "text", 
          text: JSON.stringify({ ...payload, live_signal: liveSignal || "Active" }, null, 2) 
        }] 
      }
    });
  } catch (e) {
    return res.json({ 
      jsonrpc: "2.0", 
      id, 
      result: { content: [{ type: "text", text: "Oracle Node Offline or Not Found." }] } 
    });
  }
});

export default app;
