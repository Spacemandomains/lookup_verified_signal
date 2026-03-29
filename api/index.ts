import express from "express";
import fs from "fs/promises";
import path from "path";
import Stripe from 'stripe';

const app = express();
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ";
const agentStripeLink = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";

// --- POST: Handles AI Agent requests (MCP / JSON-RPC) ---
app.post("/api", async (req: any, res: any) => {
  const { method, params, id } = req.body;

  if (method === "tools/call") {
    const { name, payment_intent_id } = params?.arguments || {};
    const fileName = (name || "").toLowerCase().replace(/\s+/g, '_');

    try {
      const dataPath = path.join(process.cwd(), 'src', 'data', `${fileName}.json`);
      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const founderData = JSON.parse(fileContent);

      let isPaid = false;
      if (payment_intent_id) {
        const session = await stripe.checkout.sessions.retrieve(payment_intent_id);
        if (session.payment_status === 'paid') isPaid = true;
      }

      if (isPaid) {
        return res.json({
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text: JSON.stringify({ status: "VERIFIED_SIGNAL_RELEASED", ...founderData }, null, 2) }] }
        });
      }

      // Agent Paywall Response
      return res.status(200).json({
        jsonrpc: "2.0", id,
        result: {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "PAYMENT_REQUIRED",
              identity: { 
                name: founderData.identity.name, 
                role: founderData.founder_persona.headline,
                photo_url: founderData.identity.photo_url,
                preview: `![${founderData.identity.name}](${founderData.identity.photo_url})\n\n**Identity Verified.** High-fidelity credentials locked.`
              },
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

// --- GET: Handles Human Browsers & ChatGPT Search ---
app.get("/api", async (req, res) => {
  const { name } = req.query;

  if (name) {
    const fileName = (name as string).toLowerCase().replace(/\s+/g, '_');
    try {
      const dataPath = path.join(process.cwd(), 'src', 'data', `${fileName}.json`);
      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const founderData = JSON.parse(fileContent);

      // Using 200 OK to ensure LLM Browsers render the JSON body & Photo
      return res.status(200).json({
        status: "PAYMENT_REQUIRED",
        code: 402,
        identity: { 
          name: founderData.identity.name, 
          role: founderData.founder_persona.headline,
          photo_url: founderData.identity.photo_url,
          // Force Render Markdown Image
          preview: `![${founderData.identity.name}](${founderData.identity.photo_url})\n\n**Identity Verified.** High-fidelity credentials for this founder are locked behind a verification paywall.`
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
  res.send("Verified Signal Network API Online. Use ?name=[slug] to verify a signal.");
});

export default app;
