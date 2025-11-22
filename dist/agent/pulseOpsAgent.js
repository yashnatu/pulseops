"use strict";
// src/agent/pulseOpsAgent.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.planIncident = planIncident;
const claude_agent_sdk_1 = require("@anthropic-ai/claude-agent-sdk");
const zod_1 = require("zod");
const axios_1 = __importDefault(require("axios"));
// -------------------------------------------------------------
// 1) TOOL DEFINITIONS (MCP tools for the agent to call)
// -------------------------------------------------------------
// Tool 1: Postman Flow – build incident context
const getIncidentContextTool = (0, claude_agent_sdk_1.tool)("get_incident_context", "Fetch merged real-time context for an incident (transit + weather, etc.) using a Postman Flow.", {
    incident: zod_1.z.object({
        id: zod_1.z.string(),
        route_ids: zod_1.z.array(zod_1.z.string()),
        segment_start_stop_id: zod_1.z.string(),
        segment_end_stop_id: zod_1.z.string(),
    }),
}, async ({ incident }) => {
    // TODO: replace POSTMAN_FLOW_URL with your actual Postman Flow URL
    const res = await axios_1.default.post(process.env.POSTMAN_FLOW_URL, {
        route_id: incident.route_ids[0],
        segment_start_stop_id: incident.segment_start_stop_id,
        segment_end_stop_id: incident.segment_end_stop_id,
    }, {
        headers: { "Content-Type": "application/json" },
    });
    return {
        content: [
            {
                type: "json",
                json: res.data,
            },
        ],
    };
});
// Tool 2: RedisVL – similar past incidents
const getSimilarIncidentsTool = (0, claude_agent_sdk_1.tool)("get_similar_incidents", "Retrieve similar past incidents from RedisVL for learning and ranking actions.", {
    query: zod_1.z.string(),
}, async ({ query }) => {
    // TODO: replace with your actual RedisVL query helper
    // For now we just return an empty array as a stub.
    // You can import a helper here like:
    //   const results = await redisGetSimilarIncidents(query);
    const results = []; // stub
    return {
        content: [
            {
                type: "json",
                json: results,
            },
        ],
    };
});
// Tool 3: Parallel – external news / event context
const getExternalContextTool = (0, claude_agent_sdk_1.tool)("get_external_context", "Look up external events (crashes, protests, etc.) that may explain a major incident.", {
    query: zod_1.z.string(),
}, async ({ query }) => {
    // TODO: wire to Parallel API.
    // Example stub that just returns empty context.
    // const res = await axios.post("https://api.parallel.ai/search", { query, ... });
    const externalContext = []; // stub
    return {
        content: [
            {
                type: "json",
                json: externalContext,
            },
        ],
    };
});
// Tool 4: Skyflow – operator contacts
const getOperatorContactsTool = (0, claude_agent_sdk_1.tool)("get_operator_contacts", "Fetch contact info (name, phone, role) for relevant operations staff from Skyflow.", {
    role: zod_1.z.string().optional(), // e.g. 'Duty Manager'
}, async ({ role }) => {
    // TODO: replace with your actual Skyflow call.
    // For now we stub with a fake duty manager.
    const contacts = [
        {
            name: "Duty Manager Example",
            role: role ?? "Duty Manager",
            phone: "+1-555-0100",
        },
    ];
    return {
        content: [
            {
                type: "json",
                json: contacts,
            },
        ],
    };
});
// -------------------------------------------------------------
// 2) MCP SERVER CONFIG
// -------------------------------------------------------------
const pulseOpsMcpServer = (0, claude_agent_sdk_1.createSdkMcpServer)({
    name: "pulseops-tools",
    version: "0.1.0",
    tools: [
        getIncidentContextTool,
        getSimilarIncidentsTool,
        getExternalContextTool,
        getOperatorContactsTool,
    ],
});
// -------------------------------------------------------------
// 3) SYSTEM PROMPT (from our earlier design, slightly abridged)
// -------------------------------------------------------------
const SYSTEM_PROMPT = `
You are PulseOps, an AI incident command assistant for a public transit control center.
Your job is to review live disruptions, decide on the best operational responses,
and draft clear communications for staff and riders.

You must always be conservative, safety-aware, and aligned with agency playbooks.
Never invent routes, stops, people, or resources that are not in the provided data.

You can call tools to:
- get_incident_context: fetch merged real-time context (transit + weather, etc.)
- get_similar_incidents: see how similar incidents were handled and how effective they were
- get_external_context: check for external events like crashes or protests
- get_operator_contacts: pull contact info for ops staff to reference in scripts

You MUST output ONLY valid JSON with this shape:

{
  "actions": [
    {
      "category": "alert_only" | "detour" | "shuttle",
      "summary": "short one-sentence summary for operators",
      "rider_alert_header": "short rider-facing title",
      "rider_alert_body": "2–3 sentence rider-friendly message",
      "ops_script": "internal instructions referencing real routes/stops and staff",
      "social_post": "update text, <= 240 characters"
    }
  ],
  "reasoning": "1–5 sentences explaining why you ranked the actions this way."
}

Do not wrap JSON in backticks.
Do not include any other top-level keys besides "actions" and "reasoning".
`;
// -------------------------------------------------------------
// 4) MAIN ENTRYPOINT: planIncident
// -------------------------------------------------------------
/**
 * planIncident
 *
 * Call this from your backend when a new incident is detected.
 * It runs the Claude Agent SDK with our tools and returns planned actions.
 */
async function planIncident(incident) {
    // This string is the "user" part of the prompt.
    const userPrompt = `
You are handling a new transit incident. Here is the incident JSON:

<incident_json>
${JSON.stringify(incident, null, 2)}
</incident_json>

Use your tools as needed to gather more context, then output the final JSON plan.
`;
    const messages = (0, claude_agent_sdk_1.query)({
        prompt: userPrompt,
        options: {
            systemPrompt: SYSTEM_PROMPT,
            model: "claude-3-5-sonnet-20241022", // adjust to whatever model they give you
            env: {
                ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
            },
            mcpServers: {
                pulseops: pulseOpsMcpServer,
            },
            // Optional: restrict to only our tools
            allowedTools: [
                "get_incident_context",
                "get_similar_incidents",
                "get_external_context",
                "get_operator_contacts",
            ],
            // We’ll keep permissions simple for hackathon:
            permissionMode: "bypassPermissions",
        },
    });
    let finalJsonText = null;
    for await (const msg of messages) {
        // We only care about the *final* assistant/result message.
        // Note: Using 'any' here because the SDK types don't fully match runtime behavior
        const msgAny = msg;
        if (msgAny.type === "assistant" && msgAny.content) {
            // msg.content is an array of content blocks; we expect final to be a single text block.
            const textBlocks = msgAny.content.filter((c) => c.type === "text");
            if (textBlocks.length > 0) {
                finalJsonText = textBlocks[textBlocks.length - 1].text;
            }
        }
        if (msg.type === "result" && msgAny.result) {
            // The result message contains the final output as a string
            finalJsonText = msgAny.result;
        }
    }
    if (!finalJsonText) {
        throw new Error("PulseOps agent did not return a final JSON message.");
    }
    // Try to parse the JSON. You can add more robust cleaning if needed.
    let parsed;
    try {
        parsed = JSON.parse(finalJsonText);
    }
    catch (err) {
        console.error("Failed to parse agent JSON:", finalJsonText);
        throw err;
    }
    return parsed;
}
//# sourceMappingURL=pulseOpsAgent.js.map