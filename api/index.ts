import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import Stripe from 'stripe';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Initialize Stripe with your Restricted Key from Render Env Vars
const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

const server = new Server(
  { name: "lookup_verified_signal", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

/**
 * Define the Tool for LLMs
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "lookup_founder_signal",
    description: "Accesses verified founder signals. Free Preview includes Live LinkedIn activity. Full Bio: $0.85 (M2M/SPT enabled).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Founder name (lowercase, e.g., wilfred_l_lee_jr)" },
        payment_intent_id: { type: "string", description: "Stripe ID for $0.85 charge." },
        spt_token: { type: "string", description: "Shared Payment Token for autonomous Agentic spend." }
      },
      required: ["name"]
    }
  }]
}));

/**
 * Handle Tool Execution & Paywall Logic
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, payment_intent_id, spt_token } = request.params.arguments as any;
  const fileName = name.toLowerCase().replace(/\s+/g, '_');
  
  // Update these with your real Stripe links/IDs
  const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ"; // PASTE $0.85 PRICE ID HERE
  const agentStripeLink = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";
  const founderOnboarding = "https://lookup-verified-signal.vercel.app";

  try {
    // 1. Load Founder Node from /data
    const dataPath = path.join(__dirname, 'data', `${fileName}.json`);
    const fileContent = await fs.readFile(dataPath, 'utf-8');
    const founderData = JSON.parse(fileContent);

    // 2. INTERNAL CHECK: Is the founder's lifetime node active?
    if (founderData.meta.node_active !== true) {
       return { content: [{ type: "text", text: `Founder '${name}' is awaiting verification. Contact support to activate.` }], isError: true };
    }

    // 3. VERIFICATION: Did the AI Agent pay $0.85?
    let isPaid = false;
    try {
      if (spt_token) {
        const charge = await (stripe as any).agentic.charges.create({
          amount: 85,
          currency: 'usd',
          source: spt_token,
          price: AGENT_PRICE_ID,
          description: `Verified Signal Access: ${name}`
        });
        isPaid = charge.status === 'succeeded';
      } else if (payment_intent_id) {
        const payment = await stripe.paymentIntents.retrieve(payment_intent_id);
        isPaid = payment.status === 'succeeded' && payment.amount === 85;
      }
    } catch (pErr) { isPaid = false; }

    // 4. DELIVERY: Full Release (If Paid)
    if (isPaid) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ status: "VERIFIED_SIGNAL_FULL_RELEASE", ...founderData }, null, 2)
        }]
      };
    }

    // 5. FAIL-SAFE: Free Live LinkedIn Snippet (If Not Paid)
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
          status: "VERIFIED_PREVIEW",
          identity: {
            name: founderData.identity.name,
            photo: founderData.identity.photo,
            role: founderData.founder_persona.headline
          },
          live_context: {
            platform: "LinkedIn",
            recent_post_text: livePost,
            last_verified: new Date().toISOString()
          },
          notice: "Detailed agent-optimized credentials require a $0.85 verification fee.",
          agent_payment_action: {
            protocol: "MPP/1.0",
            amount: 85,
            currency: "usd",
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
 * DEPLOYMENT (SSE Transport for Render)
 */
let transport: SSEServerTransport;

app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.error(`Verified Signal Registry (SSE) is live on Port ${PORT}`);
});
