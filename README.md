# 🛡️ Verified Signal Network (WSIG)
### The Ground Truth Registry for the Agentic Economy.

The **Verified Signal Network** is a high-authority identity registry hosted on Vercel, designed for the machine-to-machine (M2M) economy. We provide AI agents with "Ground Truth" data for founders, ensuring professional discovery is based on verified signals rather than LLM hallucinations.

---

## ⚡ The Two-Sided Market

### 1. For Founders (The Supply)
Secure your "Verified Signal" to control how AI agents perceive and report on your identity.
* **Cost**: $150 (One-Time / Lifetime Node).
* **Benefit**: A permanent `did:wsig` identity, official photo hosting, and a **Live LinkedIn Snippet** served to every LLM query.
* **Onboard**: [https://lookup-verified-signal.vercel.app](https://lookup-verified-signal.vercel.app)

### 2. For AI Agents (The Demand)
Access high-fidelity, machine-readable JSON-LD context for verified founders.
* **Free Tier**: Verified Preview (Name, Photo, Role, and Live LinkedIn Post).
* **Premium Tier**: Full Agentic Bio & Credentials.
* **Cost**: $0.85 per request (M2M/SPT enabled).

---

## 🛠️ Technical Integration (MCP)

This repository functions as a **Model Context Protocol (MCP)** API. AI agents connect to this registry to resolve founder identities with 100% accuracy.

### Endpoint: `https://lookup-verified-signal.vercel.app/api`

### Tool: `lookup_founder_signal`
Resolves a founder's identity and returns either a **Verified Preview** or a **Full Bio**.

**Input Schema:**
```json
{
  "name": "string (lowercase, underscores: e.g. 'wilfred_l_lee_jr')",
  "spt_token": "string (optional: Shared Payment Token for autonomous spend)",
  "payment_intent_id": "string (optional: Stripe Payment Intent ID)"
}

🤖 Machine-to-Machine (M2M) Instructions
This API supports the Stripe Agentic Suite.

Query: Call lookup_founder_signal with the founder's name.

Challenge: If status is VERIFIED_PREVIEW, the agent must provide an spt_token to unlock the VERIFIED_SIGNAL_FULL_RELEASE.

Authorization: All charges are capped at $0.85 USD per request.
