// src/agent/pulseOpsAgent.ts

import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import { Incident, PlanResult } from "../lib/models";
import { findRelevantCaseStudies } from "../lib/caseStudies";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

// System prompt for the AI
const SYSTEM_PROMPT = `
You are PulseOps, an AI incident command assistant for a public transit control center.
Your job is to review live disruptions, decide on the best operational responses,
and draft clear communications for staff and riders.

You are conservative, safety-aware, and aligned with agency playbooks.
Never invent routes, stops, people, or resources that are not in the provided data.

You are also given real-world incident case_studies from other transit agencies.
You MUST:
- Compare the current incident to those historical cases
- Prefer patterns that led to \"good\" outcomes
- Call out which case IDs you are drawing from when relevant

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

Do not wrap JSON in backticks or markdown.
Do not include any other top-level keys besides "actions" and "reasoning".
`;

/**
 * Get incident context from the flow (or fake flow)
 */
async function getIncidentContext(incident: Incident): Promise<any> {
  try {
    const flowUrl = process.env.POSTMAN_FLOW_URL || "http://localhost:3000/fake-flow";
    
    const res = await axios.post(
      flowUrl,
      {
        route_id: incident.route_ids[0],
        segment_start_stop_id: incident.segment_start_stop_id,
        segment_end_stop_id: incident.segment_end_stop_id,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      }
    );

    return res.data;
  } catch (error: any) {
    console.error("⚠️  Failed to get incident context:", error.message);
    return {
      route_id: incident.route_ids[0],
      avg_delay_minutes_live: incident.avg_delay_minutes,
      weather_summary: "unknown",
      suggested_cause: "UNKNOWN",
    };
  }
}

function inferTimeOfDay(date: Date): string {
  const hour = date.getHours();
  if (hour < 10) return "am_peak";
  if (hour < 16) return "midday";
  if (hour < 22) return "pm_peak";
  return "overnight";
}

function inferWeekday(date: Date): string {
  const day = date.getDay();
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

/**
 * Main function to plan incident response using Claude
 */
export async function planIncident(incident: Incident): Promise<PlanResult> {
  try {
    console.log("🤖 Starting planIncident for:", incident.id);
    console.log("📝 API Key present:", !!process.env.ANTHROPIC_API_KEY);

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    // Get additional context
    console.log("🔍 Fetching incident context from flow...");
    const context = await getIncidentContext(incident);
    console.log("✅ Got context:", context);

    // Build a simple case study query from the incident
    const baseDate = incident.start_time
      ? new Date(incident.start_time)
      : new Date();
    const time_of_day = inferTimeOfDay(baseDate);
    const weekday = inferWeekday(baseDate);

    let mode = "bus";
    let corridor_type = "urban_trunk";
    const routeId = incident.route_ids[0]?.toLowerCase() || "";

    if (routeId.includes("green")) {
      mode = "light_rail";
      corridor_type = "core_subway";
    } else if (
      routeId.includes("red") ||
      routeId.includes("orange") ||
      routeId.includes("blue")
    ) {
      mode = "subway";
      corridor_type = "core_subway";
    }

    const scenario_type = "service_delay";

    const relatedCaseStudies = findRelevantCaseStudies({
      mode,
      corridor_type,
      time_of_day,
      weekday,
      scenario_type,
    }).slice(0, 5);

    console.log(
      "📚 Selected related case studies for planning:",
      relatedCaseStudies.map((c) => c.id)
    );

    // Build the user prompt
    const userPrompt = `
You are handling a new transit incident. Here is the incident data:

<incident_json>
${JSON.stringify(incident, null, 2)}
</incident_json>

<additional_context>
${JSON.stringify(context, null, 2)}
</additional_context>

<case_studies>
${JSON.stringify(relatedCaseStudies, null, 2)}
</case_studies>

Based on this information, generate a response plan with appropriate actions.
Output ONLY the JSON response as specified in your system prompt.
`;

    console.log("📡 Calling Claude API...");
    
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    console.log("✅ Got response from Claude");

    // Extract the text content
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    const responseText = textContent.text;
    console.log("📄 Response text length:", responseText.length);

    // Parse JSON (handle markdown code blocks if present)
    let jsonText = responseText.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```json?\n?/g, "").replace(/```\n?$/g, "").trim();
    }

    console.log("🔍 Parsing JSON response...");
    const parsed: PlanResult = JSON.parse(jsonText);

    console.log(`✅ Successfully parsed plan with ${parsed.actions?.length || 0} actions`);

    // Validate the response structure
    if (!parsed.actions || !Array.isArray(parsed.actions)) {
      throw new Error("Invalid response: missing or invalid 'actions' array");
    }

    if (!parsed.reasoning || typeof parsed.reasoning !== "string") {
      throw new Error("Invalid response: missing or invalid 'reasoning' string");
    }

    return parsed;
  } catch (error: any) {
    console.error("❌ planIncident error:", error.message);
    console.error("❌ Full error:", error);
    console.error("❌ Stack:", error.stack);
    throw new Error(`AI planning failed: ${error.message}`);
  }
}
