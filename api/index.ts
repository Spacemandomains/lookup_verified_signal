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

app.post("/api", async (req: any, res: any) => {
  const { method, params, id } = req.body;

  // 1. DISCOVERY: Tell AI Agents what tools are available
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

  // 2. EXECUTION: The Paywall and Verification Logic
  if (method === "tools/call") {
    const { name, payment_intent_id } = params?.arguments || {};
    const fileName = (name || "").toLowerCase().replace(/\s+/g, '_');
    
    const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ";
    const agentStripeLink = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";
    const registrationUrl = "https://lookup-verified-signal.vercel.app/";

    try {
      // Find the Founder Node file
      const dataPath = path.join(process.cwd(), 'src', 'data', `${fileName}.json`);
      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const founderData = JSON.parse(fileContent);

      // --- VERIFICATION LOGIC ---
      let isPaid = false;
      if (payment_intent_id) {
        try {
          // Stripe uses 'checkout.sessions' to retrieve the status of a Payment Link purchase
          const session = await stripe.checkout.sessions.retrieve(payment_intent_id);
          if (session.payment_status === 'paid') {
            isPaid = true;
          }
        } catch (stripeErr) {
          console.error("Stripe Verification Failed:", stripeErr);
        }
      }

      // CASE A: DATA RELEASE (Payment Verified)
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

      // CASE B: 402 PAYWALL (Needs Payment)
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
      // CASE C: EMPTY SHELF (Founder not found)
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

app.get("/api", (req, res) => res.send("Verified Signal MCP API is Live (Production Mode)."));

export default app;
