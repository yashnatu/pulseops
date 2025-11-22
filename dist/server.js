"use strict";
// src/server.ts
// Express HTTP server for PulseOps backend
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const store_1 = require("./lib/store");
const pulseOpsAgent_1 = require("./agent/pulseOpsAgent");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(express_1.default.json());
// --- Routes ---
/**
 * GET /incidents
 * Returns all incidents from the store
 */
app.get("/incidents", (req, res) => {
    const incidents = store_1.store.getAllIncidents();
    res.json({ incidents });
});
/**
 * GET /incidents/:id
 * Returns a specific incident
 */
app.get("/incidents/:id", (req, res) => {
    const incident = store_1.store.getIncident(req.params.id);
    if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
    }
    res.json({ incident });
});
/**
 * POST /incidents/:id/plan
 * Loads an incident, calls the AI agent to plan actions, saves them, and returns the result
 */
app.post("/incidents/:id/plan", async (req, res) => {
    try {
        const incident = store_1.store.getIncident(req.params.id);
        if (!incident) {
            return res.status(404).json({ error: "Incident not found" });
        }
        // Call the AI agent
        console.log(`Planning actions for incident ${incident.id}...`);
        const planResult = await (0, pulseOpsAgent_1.planIncident)(incident);
        // Save the actions to the store
        store_1.store.addActionsForIncident(incident.id, planResult.actions);
        // Return the full plan result
        res.json({
            incident_id: incident.id,
            plan: planResult,
            actions_saved: planResult.actions.length,
        });
    }
    catch (error) {
        console.error("Error planning incident:", error);
        res.status(500).json({
            error: "Failed to plan incident",
            message: error.message,
        });
    }
});
/**
 * GET /incidents/:id/actions
 * Returns all actions for a specific incident
 */
app.get("/incidents/:id/actions", (req, res) => {
    const actions = store_1.store.getActionsForIncident(req.params.id);
    res.json({ incident_id: req.params.id, actions });
});
/**
 * POST /debug/create-incident
 * Creates a fake incident for testing
 */
app.post("/debug/create-incident", (req, res) => {
    const timestamp = Date.now();
    const fakeIncident = {
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
    };
    store_1.store.createIncident(fakeIncident);
    console.log(`Created fake incident: ${fakeIncident.id}`);
    res.json({
        message: "Fake incident created",
        incident: fakeIncident,
    });
});
/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Start server
app.listen(PORT, () => {
    console.log(`🚀 PulseOps backend running on http://localhost:${PORT}`);
    console.log(`\nAvailable endpoints:`);
    console.log(`  GET  /health`);
    console.log(`  GET  /incidents`);
    console.log(`  GET  /incidents/:id`);
    console.log(`  GET  /incidents/:id/actions`);
    console.log(`  POST /incidents/:id/plan`);
    console.log(`  POST /debug/create-incident`);
    console.log(`\n💡 Try: curl -X POST http://localhost:${PORT}/debug/create-incident\n`);
});
//# sourceMappingURL=server.js.map