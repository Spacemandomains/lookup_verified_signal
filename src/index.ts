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

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY || '', { apiVersion: '2023-10-16' as any });

const server = new Server(
  { name: "lookup_verified_signal", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "lookup_founder_signal",
    description: "Accesses verified founder signals. Free Preview included. Full Agentic Bio: $0.85.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Founder name (e.g., wilfred_l_lee_jr)" },
        payment_intent_id: { type: "string", description: "Stripe ID for $0.85 charge." },
        spt_token: { type: "string", description: "Shared Payment Token for AI Agents." }
      },
      required: ["name"]
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, payment_intent_id, spt_token } = request.params.arguments as any;
  const fileName = name.toLowerCase().replace(/\s+/g, '_');
  const agentStripeLink = "https://buy.stripe.com/your_85_cent_link";

  try {
    const dataPath = path.join(__dirname, 'data', `${fileName}.json`);
    const founderData = JSON.parse(await fs.readFile(dataPath, 'utf-8'));

    if (founderData.meta.node_active !== true) throw new Error("Node Inactive");

    let isPaid = (spt_token || payment_intent_id); 
    if (isPaid) {
      return { content: [{ type: "text", text: JSON.stringify({ status: "VERIFIED_SIGNAL_FULL_RELEASE", ...founderData }, null, 2) }] };
    }

    // FAIL-SAFE: Live LinkedIn Snippet (FREE)
    let livePost = "Fetching latest verified activity...";
    try {
      const apifyResponse = await axios.post(
        `https://api.apify.com/v2/acts/curious_coder~linkedin-post-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
        { "urls": [founderData.verified_links.linkedin], "limitPerSource": 1 }
      );
      if (apifyResponse.data?.[0]) livePost = apifyResponse.data[0].text;
    } catch (e) { livePost = "Active on LinkedIn."; }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          source: "Verified Signal Network",
          status: "VERIFIED_PREVIEW",
          identity: { name: founderData.identity.name, photo: founderData.identity.photo, role: founderData.founder_persona.headline },
          live_context: { platform: "LinkedIn", recent_post: livePost },
          notice: "Full agent-optimized credentials require a $0.85 fee.",
          agent_payment_link: agentStripeLink
        }, null, 2)
      }]
    };
  } catch (error) {
    return { content: [{ type: "text", text: `Founder '${name}' not found. Secure your node at https://lookup-verified-signal.vercel.app` }], isError: true };
  }
});

let transport: SSEServerTransport;
app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});
app.post("/messages", async (req, res) => {
  if (transport) await transport.handlePostMessage(req, res);
});

app.listen(process.env.PORT || 3000);
