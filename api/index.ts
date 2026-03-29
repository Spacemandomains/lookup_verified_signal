import express from "express";
import fs from "fs/promises";
import path from "path";
import Stripe from 'stripe';
import { kv } from '@vercel/kv'; 

const app = express();
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ";
const agentStripeLink = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";

// --- GET: Universal Handler for All Founders (Browsers/ChatGPT) ---
app.get("/api", async (req, res) => {
  const { name } = req.query;

  if (name) {
    const slug = (name as string).toLowerCase().replace(/\s+/g, '_');
    
    try {
      // 1. Load Founder JSON from /src/data/
      const dataPath = path.join(process.cwd(), 'src', 'data', `${slug}.json`);
      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const founderData = JSON.parse(fileContent);

      // 2. Fetch the "Live Pulse" from your RedisLabs/Upstash instance
      let liveSignal = await kv.get(`signal:${slug}`);
      if (!liveSignal) {
        liveSignal = "Signal syncing with LinkedIn... Node status: Verified.";
      }

      // 3. Return Dynamic Identity Response
      return res.status(200).json({
        ...founderData,
        identity: { 
          ...founderData.identity,
          display_signal: `![${founderData.identity.name}](${founderData.identity.photo_url})`,
          preview: `![${founderData.identity.name}](${founderData.identity.photo_url})\n\n**Identity Verified.** High-fidelity credentials for ${founderData.identity.name} are locked.`
        },
        agentic_metadata: {
          ...founderData.agentic_metadata,
          last_active_signal: liveSignal 
        },
        agent_payment_action: {
          protocol: "MPP/1.0",
          amount: 85,
          currency: "usd",
          price_id: AGENT_PRICE_ID,
          human_link: agentStripeLink
        }
      });
    } catch (error) {
      return res.status(404).send(`Founder node '${name}' not found.`);
    }
  }
  res.send("Verified Signal Network API Online. Use ?name=[slug]");
});

// --- POST: Agentic Tool Call Handler (MCP / JSON-RPC) ---
app.post("/api", async (req: any, res: any) => {
  const { method, params, id } = req.body;

  if (method === "tools/call") {
    const { name, payment_intent_id } = params?.arguments || {};
    const slug = (name || "").toLowerCase().replace(/\s+/g, '_');

    try {
      const dataPath = path.join(process.cwd(), 'src', 'data', `${slug}.json`);
      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const founderData = JSON.parse(fileContent);

      // Grab the live Redis pulse for the agent
      let liveSignal = await kv.get(`signal:${slug}`);
      if (!liveSignal) liveSignal = "Signal active.";

      // Payment Check Logic
      let isPaid = false;
      if (payment_intent_id) {
        const session = await stripe.checkout.sessions.retrieve(payment_intent_id);
        if (session.payment_status === 'paid') isPaid = true;
      }

      if (isPaid) {
        return res.json({
          jsonrpc: "2.0", id,
          result: { 
            content: [{ 
              type: "text", 
              text: JSON.stringify({ 
                status: "VERIFIED_SIGNAL_RELEASED", 
                ...founderData,
                agentic_metadata: { ...founderData.agentic_metadata, last_active_signal: liveSignal }
              }, null, 2) 
            }] 
          }
        });
      }

      // Standard Paywall Response for Agents
      return res.status(200).json({
        jsonrpc: "2.0", id,
        result: {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "PAYMENT_REQUIRED",
              identity: { 
                name: founderData.identity.name, 
                display_signal: `![${founderData.identity.name}](${founderData.identity.photo_url})`
              },
              agentic_metadata: { last_active_signal: liveSignal },
              agent_payment_action: { amount: 85, human_link: agentStripeLink }
            }, null, 2)
          }]
        }
      });
    } catch (e) {
      return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Node not found." }] } });
    }
  }
});

export default app;
