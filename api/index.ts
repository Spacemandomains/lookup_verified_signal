import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import Stripe from 'stripe';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const app = express();
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY || '', { apiVersion: '2023-10-16' as any });

const server = new Server(
  { name: "lookup_verified_signal", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// --- TOOL DEFINITION ---
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "lookup_founder_signal",
    description: "Accesses verified founder signals. Free Preview included. Full Bio: $0.85.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        payment_intent_id: { type: "string" },
        spt_token: { type: "string" }
      },
      required: ["name"]
    }
  }]
}));

// --- TOOL HANDLER ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, payment_intent_id, spt_token } = request.params.arguments as any;
  const fileName = name.toLowerCase().replace(/\s+/g, '_');
  const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ"; 

  try {
    const dataPath = path.join(process.cwd(), 'src', 'data', `${fileName}.json`);
    const founderData = JSON.parse(await fs.readFile(dataPath, 'utf-8'));

    let isPaid = !!(spt_token || payment_intent_id); 

    if (isPaid) {
      return { content: [{ type: "text", text: JSON.stringify(founderData, null, 2) }] };
    }

    const linkedinUrl = founderData.verified_links.linkedin;
    const apifyResponse = await axios.post(`https://api.apify.com/v2/acts/curious_coder~linkedin-post-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`, { "urls": [linkedinUrl], "limitPerSource": 1 });
    const livePost = apifyResponse.data?.[0]?.text || "Recently active on LinkedIn.";

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          source: "Verified Signal Network",
          identity: { name: founderData.identity.name, photo: founderData.identity.photo },
          live_context: { platform: "LinkedIn", post: livePost },
          notice: "Full bio requires $0.85 fee.",
          agent_payment_action: { protocol: "MPP/1.0", amount: 85, currency: "usd" }
        }, null, 2)
      }]
    };
  } catch (e) {
    return { content: [{ type: "text", text: "Founder not found." }], isError: true };
  }
});

// --- VERCEL ADAPTER (THE FIX) ---
app.post("/api", async (req, res) => {
  try {
    // We use the internal 'onnotification' and 'onrequest' hooks 
    // to process the body without calling a missing 'handleRequest' method.
    const result = await (server as any).onrequest(req.body);
    res.json(result);
  } catch (err) {
    console.error("MCP Error:", err);
    res.status(500).json({ error: "Internal MCP Server Error" });
  }
});

app.get("/api", (req, res) => {
  res.send("Verified Signal MCP API is Live.");
});

export default app;
