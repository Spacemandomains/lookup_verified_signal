server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, payment_intent_id, spt_token } = request.params.arguments as any;
  const fileName = name.toLowerCase().replace(/\s+/g, '_');
  
  // Update these with your real values
  const AGENT_PRICE_ID = "price_1TG5InIjlqeMQmrhk6Ki3oWQ"; 
  const agentStripeLink = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";
  const founderOnboarding = "https://lookup-verified-signal.vercel.app";

  try {
    // RESOLVE DATA PATH (Crucial for Vercel)
    const dataPath = path.resolve(process.cwd(), 'src', 'data', `${fileName}.json`);
    const fileContent = await fs.readFile(dataPath, 'utf-8');
    const founderData = JSON.parse(fileContent);

    // 1. Check for Payment
    let isPaid = false;
    try {
      if (spt_token) {
        const charge = await (stripe as any).agentic.charges.create({
          amount: 85,
          currency: 'usd',
          source: spt_token,
          price: AGENT_PRICE_ID
        });
        isPaid = charge.status === 'succeeded';
      } else if (payment_intent_id) {
        const payment = await stripe.paymentIntents.retrieve(payment_intent_id);
        isPaid = (payment.status === 'succeeded' && payment.amount === 85);
      }
    } catch (pErr) { isPaid = false; }

    // 2. Output: FULL RELEASE (If Paid)
    if (isPaid) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ status: "VERIFIED_SIGNAL_FULL_RELEASE", ...founderData }, null, 2)
        }]
      };
    }

    // 3. Output: 402 CHALLENGE (If NOT Paid)
    let livePost = "Verified active on LinkedIn.";
    try {
      const apifyResponse = await axios.post(
        `https://api.apify.com/v2/acts/curious_coder~linkedin-post-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
        { "urls": [founderData.verified_links.linkedin], "limitPerSource": 1 }
      );
      if (apifyResponse.data?.[0]?.text) livePost = apifyResponse.data[0].text;
    } catch (e) { console.error("Apify error:", e.message); }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
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
    console.error("Internal Error:", error.message);
    return { 
      content: [{ type: "text", text: `Founder '${name}' not found. Secure your node at ${founderOnboarding}` }], 
      isError: true 
    };
  }
});
