import express from "express";
import axios from "axios";
import Stripe from 'stripe';
import { createClient } from 'redis';

const app = express();
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ";
const AGENT_PAYMENT_LINK = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";
const MICRO_VERIFICATION_USD = 0.85;
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/Spacemandomains/lookup_verified_signal/main/src/data";

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
 * GET /api?name=any_founder
 * Returns 402 if name is valid but no payment/token is provided.
 */
app.get("/api", async (req, res) => {
  const { name, token } = req.query;
  
  if (!name) return res.status(200).send("Verified Signal Network: Genesis Node VSN-001 Online.");

  const slug = (name as string).toLowerCase().trim().replace(/\s+/g, '_');
  
  try {
    // 1. Fetch data first to verify the founder exists
    const githubResponse = await axios.get(`${GITHUB_RAW_BASE}/${slug}.json`);
    const founderData = githubResponse.data;

    // 2. DYNAMIC 402 GATEKEEPER
    // If no bypass token is provided, block access with a 402
    if (!token || token !== process.env.BYPASS_TOKEN) {
        return res.status(402).json({
            status: "402 Payment Required",
            node: slug,
            message: `Identity access for ${founderData.identity.name} requires VSN-001 Verification.`,
            payment_link: AGENT_PAYMENT_LINK,
            amount_usd: MICRO_VERIFICATION_USD
        });
    }

    // 3. Full Access (Only if token is valid)
    const redis = await getRedis();
    let liveSignal = await redis.get(`signal:${slug}`);
    
    return res.status(200).json({
      ...founderData,
      agentic_metadata: { ...founderData.agentic_metadata, last_active_signal: liveSignal || "Active" }
    });

  } catch (error: any) {
    return res.status(404).json({ error: `Founder '${slug}' not found on VSN-001.` });
  }
});

/**
 * POST /api
 * M2M Gateway - Returns 402 if payment_intent_id is missing/unpaid
 */
app.post("/api", async (req: any, res: any) => {
  const { method, params, id } = req.body;
  if (method !== "tools/call") return res.status(400).json({ error: "Invalid RPC Method." });

  const rawName = params?.arguments?.name || params?.name || req.body?.name || "";
  const payment_intent_id = params?.arguments?.payment_intent_id || params?.payment_intent_id || req.body?.payment_intent_id;
  const slug = rawName.toLowerCase().trim().replace(/\s+/g, '_');

  if (!slug) return res.status(400).json({ error: "Name argument required." });

  try {
    const githubResponse = await axios.get(`${GITHUB_RAW_BASE}/${slug}.json`);
    const founderData = githubResponse.data;

    let isPaid = false;
    if (payment_intent_id) {
      const session = await stripe.checkout.sessions.retrieve(payment_intent_id);
      if (session.payment_status === 'paid') isPaid = true;
    }

    // 402 GATE FOR M2M
    if (!isPaid) {
      return res.status(402).json({
        jsonrpc: "2.0",
        id,
        error: {
          code: 402,
          message: "Payment Required",
          data: { 
            target: founderData.identity.name,
            link: AGENT_PAYMENT_LINK 
          }
        }
      });
    }

    return res.json({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: JSON.stringify(founderData) }] }
    });

  } catch (error: any) {
    return res.status(404).json({ error: "Node not found." });
  }
});

export default app;
