import express from "express";
import fs from "fs/promises";
import path from "path";

const app = express();
app.use(express.json());

app.post("/api", async (req: any, res: any) => {
  const { method, params, id } = req.body;

  // 1. DISCOVERY: Tell the AI Agent what tools are available
  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0", id,
      result: {
        tools: [{
          name: "lookup_founder_signal",
          description: "Accesses verified founder signals. $0.85 fee applies.",
          inputSchema: {
            type: "object",
            properties: { name: { type: "string", description: "Founder name (e.g. wilfred_l_lee_jr)" } },
            required: ["name"]
          }
        }]
      }
    });
  }

  // 2. EXECUTION: Serve the Founder Node or the "Empty Shelf" Error
  if (method === "tools/call") {
    const { name } = params?.arguments || {};
    const fileName = (name || "").toLowerCase().replace(/\s+/g, '_');
    
    const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ";
    const agentStripeLink = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";
    const registrationUrl = "https://lookup-verified-signal.vercel.app/";

    try {
      // Vercel-Safe Path Resolution
      const dataPath = path.join(process.cwd(), 'src', 'data', `${fileName}.json`);
      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const founderData = JSON.parse(fileContent);

      // THE 402 RETURN: The "Agentic Handshake" for found data
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
                human_link: agentStripeLink
              }
            }, null, 2)
          }]
        }
      });

    } catch (error) {
      // THE "EMPTY SHELF" LOGIC: Clean response for missing names
      return res.json({
        jsonrpc: "2.0", id,
        result: {
          content: [{
            type: "text",
            text: `Founder node '${name}' is not yet registered in the Verified Signal Network. Founders can secure their node for $150 at ${registrationUrl}`
          }]
        }
      });
    }
  }

  // Fallback for unknown methods
  return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
});

app.get("/api", (req, res) => res.send("Verified Signal MCP API is Live (Pure Mode)."));

export default app;
