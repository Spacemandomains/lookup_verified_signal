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
    await redisClient.connect();
  }
  return redisClient;
}

/**
 * GET /api?name=slug
 * THE FREEMIUM PROOF: Allows humans to view Wilfred's Genesis Node for free.
 */
app.get("/api", async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(200).json({ status: "VSN-001 Online", proof_of_concept: "wilfred_l_lee_jr" });

  const slug = (name as string).toLowerCase().trim().replace(/\s+/g, '_');
  
  try {
    const githubResponse = await axios.get(`${GITHUB_RAW_BASE}/${slug}.json`);
    const founderData = githubResponse.data;

    const redis = await getRedis();
    const liveSignal = await redis.get(`signal:${slug}`);

    // Public Preview Mode
    return res.status(200).json({
      ...founderData,
      agentic_metadata: {
        ...founderData.agentic_metadata,
        last_active_signal: liveSignal || "Signal Active"
      },
      vsn_protocol: "VSN-001-PREVIEW",
      m2m_status: "HUMAN_READABLE_ONLY"
    });
  } catch (error: any) {
    return res.status(404).json({ error: "Node Not Found", hint: "Try ?name=wilfred_l_lee_jr" });
  }
});

/**
 * POST /api
 * THE AGENTIC GATE: This is ALWAYS locked. Machines must pay $0.85.
 */
app.post("/api", async (req: any, res: any) => {
  const { method, params, id } = req.body;
  if (method !== "tools/call") return res.status(400).send("Invalid RPC Method");

  const rawName = params?.arguments?.name || params?.name || req.body?.name || "";
  const payment_intent_id = params?.arguments?.payment_intent_id || params?.payment_intent_id;
  const slug = rawName.toLowerCase().trim().replace(/\s+/g, '_');

  if (!slug) return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Error: No name provided." }] } });

  try {
    const githubResponse = await axios.get(`${GITHUB_RAW_BASE}/${slug}.json`);
    const founderData = githubResponse.data;

    let isPaid = false;
    if (payment_intent_id) {
      try {
        const session = await stripe.checkout.sessions.retrieve(payment_intent_id);
        if (session.payment_status === 'paid') isPaid = true;
      } catch (e) { isPaid = false; }
    }

    const payload = isPaid 
      ? { status: "FULL_ACCESS_GRANTED", ...founderData } 
      : { 
          status: "PAYMENT_REQUIRED", 
          identity: { name: founderData.identity.name },
          verification_fee: 0.85,
          payment_link: AGENT_PAYMENT_LINK 
        };
    
    return res.json({
      jsonrpc: "2.0", id,
      result: { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] }
    });
  } catch (e) {
    return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Node Offline." }] } });
  }
});

export default app;
