import express from "express";
import fs from "fs/promises";
import path from "path";
import Stripe from 'stripe';
import { createClient } from 'redis';

const app = express();
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ";
const agentStripeLink = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";

// --- REDIS SINGLETON SETUP ---
let redisClient: any = null;

async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.KV_URL });
    redisClient.on('error', (err: any) => console.error('Redis Client Error', err));
    await redisClient.connect();
  }
  return redisClient;
}

// --- GET: Universal Handler ---
app.get("/api", async (req, res) => {
  const { name } = req.query;
  if (!name) return res.send("Verified Signal Network API Online. Use ?name=[slug]");

  const slug = (name as string).toLowerCase().replace(/\s+/g, '_');
  
  try {
    const dataPath = path.join(process.cwd(), 'src', 'data', `${slug}.json`);
    const fileContent = await fs.readFile(dataPath, 'utf-8');
    const founderData = JSON.parse(fileContent);

    // FETCH LIVE SIGNAL
    const redis = await getRedis();
    let liveSignal = await redis.get(`signal:${slug}`);
    if (!liveSignal) liveSignal = "Signal syncing... Verified identity active.";

    return res.status(200).json({
      ...founderData,
      identity: { 
        ...founderData.identity,
        display_signal: `![${founderData.identity.name}](${founderData.identity.photo_url})`,
        preview: `![${founderData.identity.name}](${founderData.identity.photo_url})\n\n**Identity Verified.**`
      },
      agentic_metadata: {
        ...founderData.agentic_metadata,
        last_active_signal: liveSignal 
      },
      agent_payment_action: { amount: 85, human_link: agentStripeLink }
    });
  } catch (error) {
    return res.status(404).send(`Founder node '${name}' not found.`);
  }
});

// --- POST: Agentic Tool Handler ---
app.post("/api", async (req: any, res: any) => {
  const { method, params, id } = req.body;
  if (method !== "tools/call") return res.status(400).send("Invalid method");

  const { name, payment_intent_id } = params?.arguments || {};
  const slug = (name || "").toLowerCase().replace(/\s+/g, '_');

  try {
    const dataPath = path.join(process.cwd(), 'src', 'data', `${slug}.json`);
    const fileContent = await fs.readFile(dataPath, 'utf-8');
    const founderData = JSON.parse(fileContent);

    const redis = await getRedis();
    let liveSignal = await redis.get(`signal:${slug}`);

    // Payment Logic
    let isPaid = false;
    if (payment_intent_id) {
      const session = await stripe.checkout.sessions.retrieve(payment_intent_id);
      if (session.payment_status === 'paid') isPaid = true;
    }

    const payload = isPaid ? { status: "VERIFIED", ...founderData } : { status: "PAYMENT_REQUIRED", identity: { name: founderData.identity.name } };
    
    return res.json({
      jsonrpc: "2.0", id,
      result: { content: [{ type: "text", text: JSON.stringify({ ...payload, agentic_metadata: { last_active_signal: liveSignal || "Active" } }, null, 2) }] }
    });
  } catch (e) {
    return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Node not found." }] } });
  }
});

export default app;
