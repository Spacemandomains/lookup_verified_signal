import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import Stripe from 'stripe';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const app = express();
app.use(express.json());

// Initialize Stripe with Restricted Key from Vercel Env Vars
const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

const server = new Server(
  { name: "lookup_verified_signal", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

/**
 * 1. Define the Tool for AI Agents
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "lookup_founder_signal",
    description: "Accesses verified founder signals. Free Preview includes Live LinkedIn activity. Full Bio: $0.85 (M2M/SPT enabled).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Founder name (lowercase, underscores, e.g., wilfred_l_lee_jr)" },
        payment_intent_id: { type: "string" },
        spt_token: { type: "string" }
      },
      required: ["name"]
    }
  }]
}));

/**
 * 2. Handle Tool Execution & 402 Paywall Logic
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, payment_intent_id, spt_token } = request.params.arguments as any;
  const fileName = name.toLowerCase().replace(/\s+/g, '_');
  
  const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ"; 
  const agentStripeLink = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";
  const founderOnboarding = "https://lookup-verified-signal.vercel.app";

  try {
    // Vercel Path Resolution
    const dataPath = path.resolve(process.cwd(), 'src', 'data', `${fileName}.json`);
    const fileContent = await fs.readFile(dataPath, 'utf-8');
    const founderData = JSON.parse(fileContent);

    // Payment Verification Logic
    let isPaid = false;
    try {
      if (spt_token) {
        const charge = await (stripe as any).agentic.charges.create({
          amount: 85, currency: 'usd', source: spt_token, price: AGENT_PRICE_ID
        });
        isPaid = charge.status === 'succeeded';
      } else if (payment_intent_id) {
        const payment = await stripe.paymentIntents.retrieve(payment_intent_id);
        isPaid = (payment.status === 'succeeded' && payment.amount === 85);
      }
    } catch (pErr) { isPaid = false; }

    // FULL RELEASE (If Paid)
    if (isPaid) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ status: "VERIFIED_SIGNAL_FULL_RELEASE", ...founderData }, null, 2)
        }]
      };
    }

    // 402 CHALLENGE (If Not Paid)
    let livePost = "Verified active on LinkedIn.";
    try {
      const apifyResponse = await axios.post(
        `https://api.apify.com/v2/acts/curious_coder~linkedin-post-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
        { "urls": [founderData.verified_links.linkedin], "limitPerSource": 1 }
      );
      if (apifyResponse.data?.[0]?.text) livePost = apifyResponse.data[0].text;
    } catch (apiError: any) {
      console.error("LinkedIn Fetch Failed:", apiError.message);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          source: "Verified Signal Network",
          status: "PAYMENT_REQUIRED",
          code: 402,
          identity: { name: founderData.identity.name, role: founderData.founder_persona.headline },
          live_context: { platform: "LinkedIn", recent_post: livePost, last_verified: new Date().toISOString() },
          agent_payment_action: { protocol: "MPP/1.0", amount: 85, currency: "usd", price_id: AGENT_PRICE_ID, human_link: agentStripeLink }
        }, null, 2)
      }]
    };

  } catch (error: any) {
    console.error("MCP Tool Internal Error:", error.message);
    return { 
      content: [{ type: "text", text: `Founder node '${name}' could not be resolved. Ensure registration at ${founderOnboarding}` }], 
      isError: true 
    };
  }
});

/**
 * 3. Vercel Route (Fixed JSON-RPC Bridge)
 */
app.post("/api", async (req, res) => {
  try {
    // Official MCP Server Method
    const response = await server.handleRequest(req.body);
    
    // Check if the response includes our custom 402 signal
    if (JSON.stringify(response).includes("PAYMENT_REQUIRED")) {
      res.status(402);
    }
    
    res.json(response);
  } catch (err: any) {
    console.error("MCP Route Error:", err.message);
    res.status(500).json({ 
      jsonrpc: "2.0", 
      error: { code: -32603, message: "Internal MCP Server Error" },
      id: req.body.id || null 
    });
  }
});

app.get("/api", (req, res) => {
  res.send("Verified Signal MCP API is Live.");
});

export default app;
