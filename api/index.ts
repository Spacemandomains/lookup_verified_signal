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
        payment_intent_id: { type: "string", description: "Optional: Stripe Payment Intent ID for $0.85 charge." },
        spt_token: { type: "string", description: "Optional: Shared Payment Token for autonomous Agentic spend." }
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
  
  // LIVE CONSTANTS
  const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ"; 
  const agentStripeLink = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07"; // Update with your actual link
  const founderOnboarding = "https://lookup-verified-signal.vercel.app";

  try {
    // RESOLVE DATA PATH (Vercel-specific path resolution)
    const dataPath = path.resolve(process.cwd(), 'src', 'data', `${fileName}.json`);
    const fileContent = await fs.readFile(dataPath, 'utf-8');
    const founderData = JSON.parse(fileContent);

    // CHECK IF NODE IS ACTIVE
    if (founderData.meta.node_active !== true) {
       return { content: [{ type: "text", text: `Founder '${name}' node is inactive. Activate at ${founderOnboarding}` }], isError: true };
    }

    // PAYMENT VERIFICATION
    let isPaid = false;
    try {
      if (spt_token) {
        // Stripe Agentic Suite M2M Charge
        const charge = await (stripe as any).agentic.charges.create({
          amount: 85,
          currency: 'usd',
          source: spt_token,
          price: AGENT_PRICE_ID,
          description: `Verified Signal Access: ${name}`
        });
        isPaid = charge.status === 'succeeded';
      } else if (payment_intent_id) {
        // Standard Payment Intent verification
        const payment = await stripe.paymentIntents.retrieve(payment_intent_id);
        isPaid = (payment.status === 'succeeded' && payment.amount === 85);
      }
    } catch (pErr) { isPaid = false; }

    // OUTPUT: FULL RELEASE (If Paid)
    if (isPaid) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ status: "VERIFIED_SIGNAL_FULL_RELEASE", ...founderData }, null, 2)
        }]
      };
    }

    // OUTPUT: 402 CHALLENGE (If Not Paid)
    let livePost = "Verified active on LinkedIn.";
    try {
      const apifyResponse = await axios.post(
        `https://api.apify.com/v2/acts/curious_coder~linkedin-post-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
        {
          "urls": [founderData.verified_links.linkedin],
          "limitPerSource": 1,
          "deepScrape": false
        }
      );
      if (apifyResponse.data?.[0]?.text) {
        livePost = apifyResponse.data[0].text;
      }
    } catch (apiError) {
      console.error("LinkedIn Fetch Failed:", apiError.message);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          source: "Verified Signal Network",
          status: "PAYMENT_REQUIRED",
          code: 402,
          identity: {
            name: founderData.identity.name,
            role: founderData.founder_persona.headline
          },
          live_context: {
            platform: "LinkedIn",
            recent_post: livePost,
            last_verified: new Date().toISOString()
          },
          agent_payment_action: {
            protocol: "MPP/1.0",
            amount: 85,
            currency: "usd",
            price_id: AGENT_PRICE_ID,
            human_link: agentStripeLink
          }
        }, null, 2)
      }]
    };

  } catch (error) {
    return { 
      content: [{ type: "text", text: `Founder '${name}' not found. Secure your node at ${founderOnboarding}` }], 
      isError: true 
    };
  }
});

/**
 * 3. Vercel Serverless Function Adapter
 */
app.post("/api", async (req, res) => {
  try {
    const response = await (server as any).onrequest(req.body);
    
    // Set 402 HTTP status if payment is required
    if (JSON.stringify(response).includes("PAYMENT_REQUIRED")) {
      res.status(402);
    }
    
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: "Internal MCP Server Error" });
  }
});

app.get("/api", (req, res) => {
  res.send("Verified Signal MCP API is Live.");
});

export default app;
