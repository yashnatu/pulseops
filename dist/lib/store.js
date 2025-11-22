"use strict";
// src/lib/store.ts
// Simple in-memory store for incidents and actions
Object.defineProperty(exports, "__esModule", { value: true });
exports.store = void 0;
class InMemoryStore {
    constructor() {
        this.incidents = new Map();
        this.actions = new Map();
    }
    // --- Incidents ---
    getAllIncidents() {
        return Array.from(this.incidents.values());
    }
    getIncident(id) {
        return this.incidents.get(id);
    }
    createIncident(incident) {
        this.incidents.set(incident.id, incident);
        return incident;
    }
    updateIncident(id, updates) {
        const existing = this.incidents.get(id);
        if (!existing)
            return undefined;
        const updated = { ...existing, ...updates };
        this.incidents.set(id, updated);
        return updated;
    }
    // --- Actions ---
    getActionsForIncident(incidentId) {
        return this.actions.get(incidentId) || [];
    }
    addActionsForIncident(incidentId, actions) {
        const existing = this.actions.get(incidentId) || [];
        const withMetadata = actions.map((action, idx) => ({
            ...action,
            id: `${incidentId}-action-${existing.length + idx}`,
            incident_id: incidentId,
            created_at: new Date().toISOString(),
        }));
        this.actions.set(incidentId, [...existing, ...withMetadata]);
    }
    getAllActions() {
        const allActions = [];
        for (const actions of this.actions.values()) {
            allActions.push(...actions);
        }
        return allActions;
    }
}
// Export a singleton instance
exports.store = new InMemoryStore();
//# sourceMappingURL=store.js.map