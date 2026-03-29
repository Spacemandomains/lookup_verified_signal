import express from "express";
import fs from "fs/promises";
import path from "path";
import Stripe from 'stripe';

const app = express();
app.use(express.json());

// Initialize Stripe with your Restricted Key from Vercel Environment Variables
const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

// --- POST: Handles AI Agent requests (JSON-RPC) ---
app.post("/api", async (req: any, res: any) => {
  const { method, params, id } = req.body;

  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0", id,
      result: {
        tools: [{
          name: "lookup_founder_signal",
          description: "Accesses high-fidelity verified founder signals. $0.85 fee applies via Stripe.",
          inputSchema: {
            type: "object",
            properties: { 
              name: { type: "string", description: "Founder name (e.g. wilfred_l_lee_jr)" },
              payment_intent_id: { type: "string", description: "Optional: Stripe Checkout Session ID to unlock data" }
            },
            required: ["name"]
          }
        }]
      }
    });
  }

  if (method === "tools/call") {
    const { name, payment_intent_id } = params?.arguments || {};
    const fileName = (name || "").toLowerCase().replace(/\s+/g, '_');
    
    const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ";
    const agentStripeLink = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";
    const registrationUrl = "https://lookup-verified-signal.vercel.app/";

    try {
      const dataPath = path.join(process.cwd(), 'src', 'data', `${fileName}.json`);
      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const founderData = JSON.parse(fileContent);

      let isPaid = false;
      if (payment_intent_id) {
        try {
          const session = await stripe.checkout.sessions.retrieve(payment_intent_id);
          if (session.payment_status === 'paid') isPaid = true;
        } catch (stripeErr) {
          console.error("Stripe Verification Failed:", stripeErr);
        }
      }

      if (isPaid) {
        return res.json({
          jsonrpc: "2.0", id,
          result: {
            content: [{
              type: "text",
              text: JSON.stringify({ 
                status: "VERIFIED_SIGNAL_RELEASED", 
                message: "Payment confirmed. Full signal access granted.",
                ...founderData 
              }, null, 2)
            }]
          }
        });
      }

      return res.status(402).json({
        jsonrpc: "2.0", id,
        result: {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "PAYMENT_REQUIRED",
              code: 402,
              identity: { 
                name: founderData.identity.name, 
                role: founderData.founder_persona.headline 
              },
              agent_payment_action: {
                protocol: "MPP/1.0",
                amount: 85,
                currency: "usd",
                price_id: AGENT_PRICE_ID,
                human_link: agentStripeLink,
                instruction: "To unlock full signal, pay via human_link and resubmit with session_id."
              }
            }, null, 2)
          }]
        }
      });

    } catch (error) {
      return res.json({
        jsonrpc: "2.0", id,
        result: {
          content: [{
            type: "text",
            text: `Founder node '${name}' is not yet registered. Founders can secure their node for $150 at ${registrationUrl}`
          }]
        }
      });
    }
  }

  return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
});

// --- GET: Handles Human Browser clicks (B14 Link) ---
app.get("/api", async (req, res) => {
  const { name } = req.query;

  if (name) {
    const fileName = (name as string).toLowerCase().replace(/\s+/g, '_');
    try {
      const dataPath = path.join(process.cwd(), 'src', 'data', `${fileName}.json`);
      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const founderData = JSON.parse(fileContent);

      // Return the paywall JSON directly to the browser
      return res.status(402).json({
        status: "PAYMENT_REQUIRED",
        code: 402,
        identity: { 
          name: founderData.identity.name, 
          role: founderData.founder_persona.headline 
        },
        agent_payment_action: {
          protocol: "MPP/1.0",
          amount: 85,
          currency: "usd",
          price_id: "price_1TG5InIjlqeMQmrhk6Ki3oWQ",
          human_link: "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07"
        }
      });
    } catch (error) {
      return res.status(404).send(`Founder node '${name}' not found in the Verified Signal Network.`);
    }
  }

  res.send("Verified Signal Network API is Online. Use ?name=[slug] to view a listing.");
});

export default app;
