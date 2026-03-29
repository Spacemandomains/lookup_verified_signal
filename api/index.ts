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
 * Centralized constants for the Verified Signal Network.
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
 * Primary endpoint for Humans, Browsers, and Search Engines.
 */
app.get("/api", async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(200).send("Verified Signal Network: Genesis Node VSN-001 Online.");

  const slug = (name as string).toLowerCase().trim().replace(/\s+/g, '_');
  
  try {
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
  } catch (error: any) {
    console.error(`GET Fetch Failed for [${slug}]:`, error.message);
    return res.status(404).json({ error: "Node not found on the Verified Signal Network." });
  }
});

/**
 * POST /api
 * The M2M (Machine-to-Machine) Gateway for AI Agents using JSON-RPC.
 */
app.post("/api", async (req: any, res: any) => {
  const { method, params, id } = req.body;
  
  // 1. Validate Method
  if (method !== "tools/call") {
    return res.status(400).json({ error: "Invalid RPC Method. Use 'tools/call'." });
  }

  // 2. HYPER-RESILIENT EXTRACTION
  // Checks 'params.arguments', 'params' root, and top-level 'body'
  const rawName = params?.arguments?.name || params?.name || req.body?.name || "";
  const payment_intent_id = params?.arguments?.payment_intent_id || params?.payment_intent_id || req.body?.payment_intent_id;
  
  const slug = rawName.toLowerCase().trim().replace(/\s+/g, '_');

  // 3. Fail Fast if Name is Missing
  if (!slug || slug === "") {
    return res.json({ 
      jsonrpc: "2.0", 
      id, 
      result: { content: [{ type: "text", text: "Error: No 'name' argument detected. Please provide a founder name." }] } 
    });
  }

  try {
    // 4. Fetch Static Data from GitHub
    const githubUrl = `${GITHUB_RAW_BASE}/${slug}.json`;
    const githubResponse = await axios.get(githubUrl);
    const founderData = githubResponse.data;

    // 5. Fetch Live Signal from Redis
    const redis = await getRedis();
    const liveSignal = await redis.get(`signal:${slug}`);

    // 6. Paywall Verification Logic
    let isPaid = false;
    if (payment_intent_id) {
      try {
        // We retrieve the session from Stripe to verify payment_status
        const session = await stripe.checkout.sessions.retrieve(payment_intent_id);
        if (session.payment_status === 'paid') isPaid = true;
      } catch (e: any) {
        console.error(`Stripe verification failed for ${payment_intent_id}:`, e.message);
      }
    }

    // 7. Secure Payload Construction (The Gate)
    // If NOT paid, we ONLY return the identity name and payment metadata.
    const payload = isPaid 
      ? { status: "FULL_ACCESS_GRANTED", ...founderData } 
      : { 
          status: "PAYMENT_REQUIRED", 
          identity: { name: founderData.identity.name },
          verification_fee: MICRO_VERIFICATION_USD,
          price_id: AGENT_PRICE_ID,
          payment_link: AGENT_PAYMENT_LINK
        };
    
    return res.json({
      jsonrpc: "2.0",
      id,
      result: { 
        content: [{ 
          type: "text", 
          text: JSON.stringify({ ...payload, last_active_signal: liveSignal || "Active" }, null, 2) 
        }] 
      }
    });

  } catch (error: any) {
    // 8. Log the EXACT URL that failed to Vercel Logs for debugging
    console.error(`POST Fetch Failed for: ${GITHUB_RAW_BASE}/${slug}.json - Error: ${error.message}`);
    return res.json({ 
      jsonrpc: "2.0", 
      id, 
      result: { content: [{ type: "text", text: `Oracle Node '${slug}' not found. Verify the GitHub path.` }] } 
    });
  }
});

export default app;
