// src/server.ts
// Express HTTP server for PulseOps backend

import "dotenv/config";
import express, { Request, Response } from "express";
import path from "path";
import { store } from "./lib/store";
import { Incident } from "./lib/models";
import { planIncident } from "./agent/pulseOpsAgent";
import {
  getWorldStatus,
  triggerDisruption,
  decayDelay,
  recordWorldStatus,
  getWorldHistory,
} from "./lib/world";
import { computeHealthMetrics } from "./lib/health";
import { findRelevantCaseStudies } from "./lib/caseStudies";
import {
  getAllMbtaTestScenarios,
  getMbtaTestScenarioById,
} from "./lib/mbtaTestScenarios";
import { maybeAutoCreateIncident } from "./lib/autoIncidents";
import { computeRiskForRoute } from "./lib/risk";
import { getWeatherSummary, getUpcomingEvents } from "./lib/externalData";
import { analyzeWithBrain } from "./lib/transitBrain";
import { getLearningLog } from "./lib/learningLog";
import { summarizeDay } from "./lib/summary";
import { simulateImpact } from "./lib/simulation";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "../public")));

// --- Routes ---

/**
 * GET /incidents
 * Returns all incidents from the store
 */
app.get("/incidents", (req: Request, res: Response) => {
  const incidents = store.getAllIncidents();
  res.json({ incidents });
});

/**
 * GET /incidents/:id
 * Returns a specific incident
 */
app.get("/incidents/:id", (req: Request, res: Response) => {
  const incident = store.getIncident(req.params.id);
  if (!incident) {
    return res.status(404).json({ error: "Incident not found" });
  }
  res.json({ incident });
});

/**
 * POST /incidents/:id/plan
 * Loads an incident, calls the AI agent to plan actions, saves them, and returns the result
 */
app.post("/incidents/:id/plan", async (req: Request, res: Response) => {
  try {
    const incident = store.getIncident(req.params.id);
    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    // Check if API key is set
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("❌ ANTHROPIC_API_KEY is not set!");
      return res.status(500).json({
        error: "AI service not configured",
        message: "ANTHROPIC_API_KEY environment variable is not set. Please add it to your .env file.",
      });
    }

    // Call the AI agent
    console.log(`🤖 Planning actions for incident ${incident.id}...`);
    const planResult = await planIncident(incident);

    // Save the actions to the store
    store.addActionsForIncident(incident.id, planResult.actions);

    console.log(`✅ Successfully planned ${planResult.actions.length} actions`);

    // Return the full plan result
    res.json({
      incident_id: incident.id,
      plan: planResult,
      actions_saved: planResult.actions.length,
    });
  } catch (error: any) {
    console.error("❌ Error planning incident:", error);
    console.error("Error details:", error.stack);
    res.status(500).json({
      error: "Failed to plan incident",
      message: error.message,
      details: error.stack,
    });
  }
});

/**
 * GET /incidents/:id/actions
 * Returns all actions for a specific incident
 */
app.get("/incidents/:id/actions", (req: Request, res: Response) => {
  const actions = store.getActionsForIncident(req.params.id);
  res.json({ incident_id: req.params.id, actions });
});

/**
 * POST /fake-flow
 * Fake Postman Flow endpoint that mimics the real flow response
 * This allows the agent to work without a real Postman Flow
 */
app.post("/fake-flow", (req: Request, res: Response) => {
  console.log("Fake flow called with body:", req.body);
  
  res.json({
    route_id: req.body?.route_id || "10",
    avg_delay_minutes_live: 18,
    weather_summary: "heavy rain",
    suggested_cause: "WEATHER",
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /debug/trigger-disruption
 * Manually trigger a disruption in the simulated world
 */
app.post("/debug/trigger-disruption", async (req: Request, res: Response) => {
  triggerDisruption();
  const worldStatus = await getWorldStatus();
  console.log("🚨 Disruption triggered manually via API");
  res.json({ ok: true, worldStatus });
});

/**
 * POST /agent/tick
 * Autonomous system tick: evolve world, detect issues, auto-create incidents, and plan actions
 */
app.post("/agent/tick", async (req: Request, res: Response) => {
  try {
    // 1. Evolve the world (decay delays in simulation)
    decayDelay();
    
    // 2. Get world status (GTFS-RT or simulated)
    const worldStatus = await getWorldStatus();

    // 3. Record this status snapshot to history for health monitoring
    recordWorldStatus(worldStatus);

    console.log(`🔄 Agent tick: delay=${worldStatus.avg_delay_minutes} min, source=${worldStatus.source}`);

    // 4. Check if we need to create an incident (simulation mode only)
    if (worldStatus.source === "simulated" && worldStatus.avg_delay_minutes > 10) {
      // Check if there's already an open incident for this route/segment
      const existingIncidents = store.getAllIncidents();
      const hasOpenIncident = existingIncidents.some(
        (inc) =>
          inc.status === "open" &&
          inc.route_ids.includes(worldStatus.route_id) &&
          inc.segment_start_stop_id === worldStatus.segment_start_stop_id &&
          inc.segment_end_stop_id === worldStatus.segment_end_stop_id
      );

      if (!hasOpenIncident) {
        // Check if API key is set before creating incident
        if (!process.env.ANTHROPIC_API_KEY) {
          console.warn("⚠️  Skipping incident creation - ANTHROPIC_API_KEY not set");
          return res.json({ 
            ok: true, 
            worldStatus, 
            incidentCreated: null,
            warning: "API key not configured"
          });
        }

        // Create a new incident with data source
        const incident: Incident = {
          id: `incident-${Date.now()}`,
          status: "open",
          severity: worldStatus.avg_delay_minutes >= 20 ? "major" : "minor",
          type: "corridor_blockage",
          route_ids: [worldStatus.route_id],
          segment_start_stop_id: worldStatus.segment_start_stop_id,
          segment_end_stop_id: worldStatus.segment_end_stop_id,
          start_time: new Date().toISOString(),
          avg_delay_minutes: worldStatus.avg_delay_minutes,
          trips_impacted: worldStatus.trips_impacted,
          riders_estimated: worldStatus.riders_estimated,
          data_source: worldStatus.source,
        };

        store.createIncident(incident);
        console.log(`✨ Auto-created incident: ${incident.id} (source: ${worldStatus.source})`);

        // 5. Auto-plan actions using AI
        console.log(`🤖 Planning actions for ${incident.id}...`);
        const planResult = await planIncident(incident);

        // 6. Store the actions
        store.addActionsForIncident(incident.id, planResult.actions);
        console.log(`✅ Saved ${planResult.actions.length} actions for ${incident.id}`);

        return res.json({
          ok: true,
          worldStatus,
          incidentCreated: incident.id,
          actionsPlanned: planResult.actions.length,
        });
      }
    }

    // No incident needed
    res.json({ ok: true, worldStatus, incidentCreated: null });
  } catch (error: any) {
    console.error("❌ Agent tick error:", error);
    console.error("Error details:", error.stack);
    res.status(500).json({
      ok: false,
      error: "Agent tick failed",
      message: error.message,
      details: error.stack,
    });
  }
});

/**
 * POST /debug/create-incident
 * Creates a fake incident for testing (deprecated - use create-custom-incident)
 */
app.post("/debug/create-incident", (req: Request, res: Response) => {
  const timestamp = Date.now();
  const fakeIncident: Incident = {
    id: `incident-${timestamp}`,
    status: "open",
    severity: "major",
    type: "corridor_blockage",
    route_ids: ["10"],
    segment_start_stop_id: "stop-100",
    segment_end_stop_id: "stop-120",
    start_time: new Date().toISOString(),
    avg_delay_minutes: 15,
    trips_impacted: 8,
    riders_estimated: 240,
    data_source: "simulated",
  };

  store.createIncident(fakeIncident);
  console.log(`Created fake incident: ${fakeIncident.id}`);

  res.json({
    message: "Fake incident created",
    incident: fakeIncident,
  });
});

/**
 * POST /debug/create-custom-incident
 * Creates a custom incident with user-specified parameters
 */
app.post("/debug/create-custom-incident", (req: Request, res: Response) => {
  try {
    const {
      route_id,
      severity,
      segment_start_stop_id,
      segment_end_stop_id,
      avg_delay_minutes,
      trips_impacted,
      riders_estimated,
    } = req.body;

    // Validate inputs
    if (!route_id || !severity || !segment_start_stop_id || !segment_end_stop_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (severity !== "minor" && severity !== "major") {
      return res.status(400).json({ error: "Severity must be 'minor' or 'major'" });
    }

    const timestamp = Date.now();
    const customIncident: Incident = {
      id: `incident-${timestamp}`,
      status: "open",
      severity: severity as "minor" | "major",
      type: "corridor_blockage",
      route_ids: [route_id],
      segment_start_stop_id,
      segment_end_stop_id,
      start_time: new Date().toISOString(),
      avg_delay_minutes: Number(avg_delay_minutes) || 15,
      trips_impacted: Number(trips_impacted) || 5,
      riders_estimated: Number(riders_estimated) || 150,
      data_source: "simulated",
    };

    store.createIncident(customIncident);
    console.log(`✨ Created custom incident: ${customIncident.id} - Route ${route_id}, ${avg_delay_minutes}min delay`);

    res.json({
      message: "Custom incident created",
      incident: customIncident,
    });
  } catch (error: any) {
    console.error("Error creating custom incident:", error);
    res.status(500).json({ error: "Failed to create incident", message: error.message });
  }
});

/**
 * GET /health
 * Corridor health metrics endpoint with live monitoring data
 */
app.get("/health", async (req: Request, res: Response) => {
  try {
    // Ensure we have at least one recent snapshot
    const latest = await getWorldStatus();
    recordWorldStatus(latest);

    const history = getWorldHistory();
    const metrics = computeHealthMetrics(history);

    // Build a compact history for the frontend sparkline
    const sparkline = history.map((h) => ({
      timestamp: h.timestamp,
      avg_delay_minutes: h.avg_delay_minutes,
    }));

    res.json({
      ok: true,
      worldStatus: latest,
      health: metrics,
      history: sparkline,
    });
  } catch (err: any) {
    console.error("❌ Error in /health:", err);
    res.status(500).json({ ok: false, error: "Health computation failed" });
  }
});

/**
 * GET /risk
 * Simple risk assessment for the next ~15 minutes
 */
app.get("/risk", (req: Request, res: Response) => {
  try {
    const history = getWorldHistory();
    const risk = computeRiskForRoute(history);
    res.json({ ok: true, risk });
  } catch (err: any) {
    console.error("[risk] error", err);
    res.status(500).json({ ok: false, error: "Failed to compute risk" });
  }
});

/**
 * GET /context
 * Returns current external context (weather + events) if configured
 */
app.get("/context", async (req: Request, res: Response) => {
  try {
    const [weather, events] = await Promise.all([
      getWeatherSummary(),
      getUpcomingEvents(),
    ]);
    res.json({ ok: true, weather, events });
  } catch (err: any) {
    console.error("[context] error", err);
    res.status(500).json({ ok: false, error: "Failed to load external context" });
  }
});

/**
 * GET /brain/insights
 * Returns knowledge-graph insights about current corridors
 */
app.get("/brain/insights", async (req: Request, res: Response) => {
  try {
    const history = getWorldHistory();
    const [weather, events] = await Promise.all([
      getWeatherSummary(),
      getUpcomingEvents(),
    ]);
    const external = { weather, events };
    const insights = analyzeWithBrain(history, external);
    res.json({ ok: true, insights, external });
  } catch (err: any) {
    console.error("[brain/insights] error", err);
    res.status(500).json({ ok: false, error: "Failed to compute brain insights" });
  }
});

/**
 * GET /learning-log
 * Returns recent learning log entries
 */
app.get("/learning-log", (req: Request, res: Response) => {
  try {
    const entries = getLearningLog(30);
    res.json({ ok: true, entries });
  } catch (err: any) {
    console.error("[learning-log] error", err);
    res.status(500).json({ ok: false, error: "Failed to load learning log" });
  }
});

/**
 * GET /summary/daily
 * Returns a simple daily summary built from world history
 */
app.get("/summary/daily", (req: Request, res: Response) => {
  try {
    const history = getWorldHistory();
    const summary = summarizeDay(history);
    res.json({ ok: true, summary });
  } catch (err: any) {
    console.error("[summary/daily] error", err);
    res.status(500).json({ ok: false, error: "Failed to build summary" });
  }
});

/**
 * POST /simulate
 * Performs a simple what-if rider impact simulation
 */
app.post("/simulate", (req: Request, res: Response) => {
  try {
    const { delay_minutes, riders_estimated, duration_minutes } = req.body || {};
    const result = simulateImpact({
      delay_minutes: Number(delay_minutes) || 0,
      riders_estimated: Number(riders_estimated) || 0,
      duration_minutes: Number(duration_minutes) || 0,
    });
    res.json({ ok: true, result });
  } catch (err: any) {
    console.error("[simulate] error", err);
    res.status(500).json({ ok: false, error: "Failed to simulate impact" });
  }
});

/**
 * GET /test-scenarios/mbta
 * Returns list of MBTA test scenarios for realistic incident testing
 */
app.get("/test-scenarios/mbta", (req: Request, res: Response) => {
  try {
    const scenarios = getAllMbtaTestScenarios();
    res.json({ ok: true, scenarios });
  } catch (error: any) {
    console.error("Error loading MBTA test scenarios:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to load MBTA test scenarios",
      message: error.message,
    });
  }
});

/**
 * POST /test-scenarios/mbta/:id/create-incident
 * Creates an incident from an MBTA test scenario
 */
app.post("/test-scenarios/mbta/:id/create-incident", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const scenario = getMbtaTestScenarioById(id);
    
    if (!scenario) {
      return res.status(404).json({ ok: false, error: "Scenario not found" });
    }

    // Create incident from scenario
    const incident: Incident = {
      id: `incident-${Date.now()}`,
      status: "open",
      severity: scenario.severity,
      type: "corridor_blockage",
      route_ids: [scenario.route_id],
      segment_start_stop_id: scenario.segment_start_stop_id,
      segment_end_stop_id: scenario.segment_end_stop_id,
      start_time: new Date().toISOString(),
      avg_delay_minutes: scenario.expected_delay_minutes,
      trips_impacted: Math.ceil(scenario.riders_estimated / 30),
      riders_estimated: scenario.riders_estimated,
      data_source: "simulated",
    };

    store.createIncident(incident);
    console.log(`✨ Created MBTA scenario incident: ${scenario.label}`);

    // Try to auto-plan with AI
    let planResult = null;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        console.log(`🤖 Auto-planning incident ${incident.id}...`);
        planResult = await planIncident(incident);
        store.addActionsForIncident(incident.id, planResult.actions);
        console.log(`✅ Saved ${planResult.actions.length} actions for ${incident.id}`);
      } catch (planError: any) {
        console.error(`⚠️  Failed to auto-plan incident: ${planError.message}`);
      }
    }

    res.status(201).json({
      ok: true,
      incident,
      scenario_info: {
        label: scenario.label,
        description: scenario.short_description,
        default_actions: scenario.default_actions,
      },
      plan: planResult,
    });
  } catch (error: any) {
    console.error("[mbtaTestScenarios] create incident error", error);
    res.status(500).json({
      ok: false,
      error: "Failed to create MBTA test incident",
      message: error.message,
    });
  }
});

/**
 * GET /case-studies/recommendations
 * Returns case studies based on current world status and time context
 * (used for the \"Incident Intelligence\" cards)
 */
app.get("/case-studies/recommendations", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    const time_of_day =
      hour < 10 ? "am_peak" :
      hour < 16 ? "midday" :
      hour < 22 ? "pm_peak" :
      "overnight";

    const weekday = day === 0 || day === 6 ? "weekend" : "weekday";

    // Default assumptions
    let mode = "bus";
    let corridor_type = "urban_trunk";

    try {
      const worldStatus = await getWorldStatus();

      if (worldStatus.route_id?.toLowerCase().includes("green")) {
        mode = "light_rail";
        corridor_type = "core_subway";
      } else if (
        worldStatus.route_id?.toLowerCase().includes("red") ||
        worldStatus.route_id?.toLowerCase().includes("orange") ||
        worldStatus.route_id?.toLowerCase().includes("blue")
      ) {
        mode = "subway";
        corridor_type = "core_subway";
      }
    } catch (err) {
      console.warn("[case-studies] getWorldStatus failed, using defaults");
    }

    const cases = findRelevantCaseStudies({
      mode,
      corridor_type,
      time_of_day,
      weekday,
    });

    res.json({ ok: true, cases });
  } catch (error: any) {
    console.error("[case-studies] recommendations error", error);
    res.status(500).json({
      ok: false,
      error: "Failed to get case studies",
      message: error.message,
    });
  }
});

/**
 * GET /debug/routes
 * List all registered routes
 */
app.get("/debug/routes", (req: Request, res: Response) => {
  const routes: any[] = [];
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods).join(', ').toUpperCase()
      });
    }
  });
  res.json({ routes });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PulseOps backend running on http://localhost:${PORT}`);
  console.log(`\n📡 Available endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /incidents`);
  console.log(`  GET  /incidents/:id`);
  console.log(`  GET  /incidents/:id/actions`);
  console.log(`  POST /incidents/:id/plan`);
  console.log(`  POST /debug/create-incident`);
  console.log(`  POST /debug/trigger-disruption (NEW - simulate disruption)`);
  console.log(`  POST /agent/tick (NEW - autonomous system tick)`);
  console.log(`  POST /fake-flow (mimics Postman Flow)`);
  console.log(`\n💡 Try the UI: http://localhost:${PORT}`);
  console.log(`\n🌍 Environment:`);
  console.log(`  POSTMAN_FLOW_URL: ${process.env.POSTMAN_FLOW_URL || "http://localhost:3000/fake-flow (default)"}`);
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "✓ set" : "✗ NOT SET"}\n`);

  // Background auto-incident creation loop for live MBTA status
  setInterval(() => {
    maybeAutoCreateIncident().catch((err) =>
      console.error("[autoIncident] error in background loop:", err)
    );
  }, 30_000); // every 30 seconds
});

