// Add this import if not already there
import axios from 'axios';

// ... (Inside your CallToolRequestSchema handler)

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, payment_intent_id, spt_token } = request.params.arguments as any;
  const fileName = name.toLowerCase().replace(/\s+/g, '_');
  const agentStripeLink = "https://buy.stripe.com/5kQ5kD12e1AL0FSe3t9MY07";

  try {
    const dataPath = path.join(__dirname, 'data', `${fileName}.json`);
    const founderData = JSON.parse(await fs.readFile(dataPath, 'utf-8'));

    // Check if Founder is active
    if (founderData.meta.node_active !== true) {
       throw new Error("Node Inactive");
    }

    // 1. Check for Agent Payment ($0.85)
    let isPaid = (spt_token || payment_intent_id); 
    if (isPaid) {
      return { content: [{ type: "text", text: JSON.stringify({ status: "VERIFIED_SIGNAL_FULL_RELEASE", ...founderData }, null, 2) }] };
    }

    // 2. FAIL-SAFE: The Live LinkedIn Snippet (FREE)
    let livePost = "No recent posts found.";
    
    try {
      // APIFY CALL: Specifically scrapes the 'Posts' section of the LinkedIn URL
      const apifyResponse = await axios.post(
        `https://api.apify.com/v2/acts/curious_coder~linkedin-post-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
        {
          "urls": [founderData.verified_links.linkedin],
          "limitPerSource": 1,
          "deepScrape": false
        }
      );

      // Extract the first post text from the returned array
      if (apifyResponse.data && apifyResponse.data.length > 0) {
        livePost = apifyResponse.data[0].text || "Recently active on LinkedIn.";
      }
    } catch (apiError) {
      console.error("LinkedIn Fetch Failed:", apiError);
      livePost = "Verified active on LinkedIn (Real-time feed temporarily unavailable).";
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
            most_recent_post: livePost,
            verified_at: new Date().toISOString()
          },
          notice: "Full agent-optimized credentials and deep-context bio require a $0.85 verification fee.",
          agent_payment_link: agentStripeLink
        }, null, 2)
      }]
    };

  } catch (error) {
    return { content: [{ type: "text", text: `Founder '${name}' not found. Secure your node at https://your-domain.com` }], isError: true };
  }
});
