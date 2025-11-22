// PulseOps Frontend Application

const API_BASE = '';

// State
let incidents = [];
let currentActionPlan = null;
let currentMode = 'simulated'; // 'simulated' or 'gtfs_realtime'

// DOM Elements
const elements = {
    mbtaScenarioSelect: document.getElementById('mbta-scenario-select'),
    createMbtaScenarioBtn: document.getElementById('create-mbta-scenario-btn'),
    triggerDisruption: document.getElementById('triggerDisruption'),
    refreshIncidents: document.getElementById('refreshIncidents'),
    refreshIncidentsLive: document.getElementById('refreshIncidentsLive'),
    incidentsList: document.getElementById('incidentsList'),
    actionPlanSection: document.getElementById('actionPlanSection'),
    actionPlanContent: document.getElementById('actionPlanContent'),
    closeActionPlan: document.getElementById('closeActionPlan'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    toastContainer: document.getElementById('toastContainer'),
    totalIncidents: document.getElementById('totalIncidents'),
    openIncidents: document.getElementById('openIncidents'),
    totalActions: document.getElementById('totalActions'),
    tabSimulated: document.getElementById('tab-simulated'),
    tabLive: document.getElementById('tab-live'),
    modeDescription: document.getElementById('mode-description'),
    controlPanelTitle: document.getElementById('control-panel-title'),
    simulatedControls: document.getElementById('simulated-controls'),
    liveControls: document.getElementById('live-controls'),
    modeInfo: document.getElementById('mode-info'),
    incidentsTitle: document.getElementById('incidents-title'),
    emptyMessage: document.getElementById('empty-message'),
    createIncidentModal: document.getElementById('createIncidentModal'),
    createIncidentForm: document.getElementById('createIncidentForm'),
    closeModal: document.getElementById('closeModal'),
    cancelModal: document.getElementById('cancelModal'),
    snapshotOntime: document.getElementById('snapshot-ontime'),
    snapshotAvgDelay: document.getElementById('snapshot-avg-delay'),
    snapshotRiderDelay: document.getElementById('snapshot-rider-delay'),
    snapshotSevere: document.getElementById('snapshot-severe'),
    riskPredictedDelay: document.getElementById('risk-predicted-delay'),
    riskCurrentDelay: document.getElementById('risk-current-delay'),
    riskScore: document.getElementById('risk-score'),
    riskTags: document.getElementById('risk-tags'),
    incidentIntelBody: document.getElementById('incident-intel-body'),
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadIncidents();
    loadServiceSnapshot();
    loadRisk();
    loadMbtaTestScenarios();
    loadIncidentIntel();
    startAutonomousMode();

    setInterval(loadServiceSnapshot, 15000);
    setInterval(loadRisk, 15000);
    setInterval(loadIncidentIntel, 60000);
});

// Event Listeners
function setupEventListeners() {
    if (elements.createMbtaScenarioBtn) {
        elements.createMbtaScenarioBtn.addEventListener('click', handleCreateMbtaScenario);
    }
    elements.triggerDisruption.addEventListener('click', handleTriggerDisruption);
    elements.refreshIncidents.addEventListener('click', loadIncidents);
    elements.refreshIncidentsLive.addEventListener('click', loadIncidents);
    elements.closeActionPlan.addEventListener('click', closeActionPlan);
    
    // Mode tabs
    elements.tabSimulated.addEventListener('click', () => switchMode('simulated'));
    elements.tabLive.addEventListener('click', () => switchMode('gtfs_realtime'));
    
    // Modal
    elements.closeModal.addEventListener('click', closeCreateIncidentModal);
    elements.cancelModal.addEventListener('click', closeCreateIncidentModal);
    elements.createIncidentForm.addEventListener('submit', handleCreateCustomIncident);
    
    // Close modal on outside click
    elements.createIncidentModal.addEventListener('click', (e) => {
        if (e.target === elements.createIncidentModal) {
            closeCreateIncidentModal();
        }
    });
}

// Switch between simulated and live modes
function switchMode(mode) {
    currentMode = mode;
    
    // Update tab styles
    elements.tabSimulated.classList.toggle('active', mode === 'simulated');
    elements.tabLive.classList.toggle('active', mode === 'gtfs_realtime');
    
    // Update description
    if (mode === 'simulated') {
        elements.modeDescription.innerHTML = '<strong>Simulated Mode:</strong> Test environment with controllable disruptions and delays';
        elements.controlPanelTitle.textContent = '🎯 Simulation Controls';
        elements.simulatedControls.style.display = 'flex';
        elements.liveControls.style.display = 'none';
        elements.modeInfo.innerHTML = '<strong>🤖 Autonomous Mode:</strong> The system automatically checks for disruptions every 10 seconds';
        elements.incidentsTitle.textContent = '🚨 Simulated Incidents';
        elements.emptyMessage.textContent = 'No simulated incidents yet. Create one to get started!';
    } else {
        elements.modeDescription.innerHTML = '<strong>Live GTFS-RT:</strong> Real-time data from MBTA transit feeds';
        elements.controlPanelTitle.textContent = '📡 Live Data Controls';
        elements.simulatedControls.style.display = 'none';
        elements.liveControls.style.display = 'flex';
        elements.modeInfo.innerHTML = '<strong>📡 Live Feed:</strong> Monitoring real MBTA delays and automatically creating incidents';
        elements.incidentsTitle.textContent = '📡 Live GTFS-RT Incidents';
        elements.emptyMessage.textContent = 'No live incidents detected. MBTA is running smoothly! 🎉';
    }
    
    // Re-render incidents for new mode
    renderIncidents();
    updateStats();
}

// API Calls
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }

        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

async function loadIncidents() {
    try {
        const data = await apiCall('/incidents');
        incidents = data.incidents || [];
        
        // Load actions count for each incident
        for (const incident of incidents) {
            const actionsData = await apiCall(`/incidents/${incident.id}/actions`);
            incident.actionsCount = actionsData.actions?.length || 0;
        }
        
        renderIncidents();
        updateStats();
    } catch (error) {
        showToast('Failed to load incidents', 'error');
    }
}

async function loadMbtaTestScenarios() {
    if (!elements.mbtaScenarioSelect) return;
    
    try {
        const res = await fetch('/test-scenarios/mbta');
        if (!res.ok) throw new Error('Failed to load MBTA test scenarios');
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Scenarios not ok');
        
        const scenarios = data.scenarios || [];
        elements.mbtaScenarioSelect.innerHTML = '';
        
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a scenario…';
        elements.mbtaScenarioSelect.appendChild(placeholder);
        
        scenarios.forEach((s) => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.label;
            elements.mbtaScenarioSelect.appendChild(opt);
        });
        
        console.log(`✅ Loaded ${scenarios.length} MBTA test scenarios`);
    } catch (err) {
        console.error('Failed to load MBTA test scenarios', err);
        elements.mbtaScenarioSelect.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Could not load scenarios';
        elements.mbtaScenarioSelect.appendChild(opt);
    }
}

async function handleCreateMbtaScenario() {
    const id = elements.mbtaScenarioSelect?.value;
    if (!id) {
        showToast('Please select a scenario first.', 'error');
        return;
    }
    
    try {
        showToast('Creating MBTA scenario incident…', 'info');
        showLoading(true);
        
        const res = await fetch(`/test-scenarios/mbta/${id}/create-incident`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        
        if (!res.ok) throw new Error('Failed to create scenario incident');
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Scenario incident failed');
        
        showLoading(false);
        showToast('MBTA scenario incident created and planned!', 'success');
        
        // Reset selector
        if (elements.mbtaScenarioSelect) {
            elements.mbtaScenarioSelect.value = '';
        }
        
        // Reload incidents
        await loadIncidents();
    } catch (err) {
        showLoading(false);
        console.error('Failed to create MBTA scenario incident', err);
        showToast('Could not create scenario incident.', 'error');
    }
}

async function loadServiceSnapshot() {
    if (
        !elements.snapshotOntime ||
        !elements.snapshotAvgDelay ||
        !elements.snapshotRiderDelay ||
        !elements.snapshotSevere
    ) {
        return;
    }

    try {
        const res = await fetch('/health');
        if (!res.ok) throw new Error('Failed to load health');
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Health not ok');

        const { health } = data;
        if (!health) return;

        const {
            avg_delay_30m,
            total_rider_delay_minutes_30m,
            percent_time_minor,
            percent_time_severe,
        } = health;

        // On-time share = percent of time with minor delays (≤2 min)
        elements.snapshotOntime.textContent =
            percent_time_minor != null ? `${percent_time_minor.toFixed(0)}%` : '--%';

        elements.snapshotAvgDelay.textContent =
            avg_delay_30m != null ? `${avg_delay_30m.toFixed(1)} min` : '-- min';

        if (typeof total_rider_delay_minutes_30m === 'number') {
            // Format large numbers with separators, e.g. 12,345
            const formatted = Math.round(total_rider_delay_minutes_30m).toLocaleString();
            elements.snapshotRiderDelay.textContent = formatted;
        } else {
            elements.snapshotRiderDelay.textContent = '--';
        }

        elements.snapshotSevere.textContent =
            percent_time_severe != null ? `${percent_time_severe.toFixed(0)}%` : '--%';
    } catch (err) {
        console.error('Failed to load service snapshot', err);
    }
}

async function loadRisk() {
    if (!elements.riskPredictedDelay || !elements.riskScore) return;

    try {
        const res = await fetch('/risk');
        if (!res.ok) throw new Error('Failed to load risk');
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Risk not ok');

        const risk = data.risk;
        if (!risk) return;

        elements.riskPredictedDelay.textContent =
            typeof risk.predicted_delay_15m === 'number'
                ? `${risk.predicted_delay_15m.toFixed(1)} min`
                : '-- min';

        if (elements.riskCurrentDelay) {
            elements.riskCurrentDelay.textContent =
                typeof risk.current_delay_minutes === 'number'
                    ? `${risk.current_delay_minutes.toFixed(1)} min`
                    : '-- min';
        }

        elements.riskScore.textContent =
            typeof risk.predicted_risk_score === 'number'
                ? `${risk.predicted_risk_score.toFixed(0)}/100`
                : '--';

        if (elements.riskTags) {
            elements.riskTags.innerHTML = '';
            if (Array.isArray(risk.risk_factors) && risk.risk_factors.length) {
                risk.risk_factors.forEach((tag) => {
                    const span = document.createElement('span');
                    span.className = 'chip';
                    span.textContent = tag.replace(/_/g, ' ');
                    elements.riskTags.appendChild(span);
                });
            }
        }
    } catch (err) {
        console.error('Failed to load risk', err);
    }
}

async function loadIncidentIntel() {
    const container = elements.incidentIntelBody;
    if (!container) return;

    try {
        const res = await fetch('/case-studies/recommendations');
        if (!res.ok) throw new Error('Failed to load case study recommendations');
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Case study response not ok');

        const cases = data.cases || [];
        container.innerHTML = '';

        if (!cases.length) {
            const p = document.createElement('p');
            p.className = 'incident-intel-empty';
            p.textContent = 'No incident intelligence available yet. Build case studies with npm run build:case-studies.';
            container.appendChild(p);
            return;
        }

        cases.forEach((cs) => {
            const card = document.createElement('article');
            card.className = 'incident-intel-item';

            const header = document.createElement('div');
            header.className = 'incident-intel-header';

            const title = document.createElement('h3');
            title.textContent = `${cs.scenario_type.replace(/_/g, ' ')} • ${cs.city}, ${cs.agency}`;
            header.appendChild(title);

            const chips = document.createElement('div');
            chips.className = 'incident-intel-chips';

            const addChip = (text) => {
                const span = document.createElement('span');
                span.className = 'chip';
                span.textContent = text;
                chips.appendChild(span);
            };

            if (cs.mode) addChip(cs.mode);
            if (cs.corridor_type) addChip(cs.corridor_type.replace(/_/g, ' '));
            if (cs.time_of_day) addChip(cs.time_of_day.replace(/_/g, ' '));
            if (cs.weekday) addChip(cs.weekday);
            if (typeof cs.peak_delay_minutes === 'number') addChip(`Peak ${cs.peak_delay_minutes} min`);
            if (typeof cs.duration_minutes === 'number') addChip(`Duration ${cs.duration_minutes} min`);
            if (typeof cs.riders_impacted === 'number') addChip(`${cs.riders_impacted.toLocaleString()} riders`);

            const outcome = document.createElement('span');
            outcome.className = `chip outcome outcome-${cs.outcome_quality || 'mixed'}`;
            outcome.textContent = `Outcome: ${cs.outcome_quality || 'mixed'}`;
            chips.appendChild(outcome);

            const summary = document.createElement('p');
            summary.className = 'incident-intel-summary';
            summary.textContent = cs.summary;

            const footer = document.createElement('div');
            footer.className = 'incident-intel-footer';

            const actions = document.createElement('div');
            actions.className = 'incident-intel-actions';
            if (Array.isArray(cs.actions_taken)) {
                cs.actions_taken.forEach((act) => {
                    const pill = document.createElement('span');
                    pill.className = 'pill';
                    pill.textContent = act;
                    actions.appendChild(pill);
                });
            }
            footer.appendChild(actions);

            if (cs.source_url) {
                const link = document.createElement('a');
                link.href = cs.source_url;
                link.target = '_blank';
                link.rel = 'noreferrer';
                link.className = 'incident-intel-link';
                link.textContent = 'View source';
                footer.appendChild(link);
            }

            card.appendChild(header);
            card.appendChild(chips);
            card.appendChild(summary);
            card.appendChild(footer);
            container.appendChild(card);
        });
    } catch (err) {
        console.error('Failed to load incident intelligence', err);
        container.innerHTML = '<p class=\"incident-intel-empty\">Could not load incident intelligence.</p>';
    }
}

// Modal functions
function openCreateIncidentModal() {
    elements.createIncidentModal.style.display = 'flex';
}

function closeCreateIncidentModal() {
    elements.createIncidentModal.style.display = 'none';
    elements.createIncidentForm.reset();
}

async function handleCreateCustomIncident(e) {
    e.preventDefault();
    
    try {
        const formData = new FormData(elements.createIncidentForm);
        
        const incidentData = {
            route_id: formData.get('routeId'),
            severity: formData.get('severity'),
            segment_start_stop_id: formData.get('startStop'),
            segment_end_stop_id: formData.get('endStop'),
            avg_delay_minutes: parseInt(formData.get('delayMinutes')),
            trips_impacted: parseInt(formData.get('tripsImpacted')),
            riders_estimated: parseInt(formData.get('ridersEstimated'))
        };
        
        const data = await apiCall('/debug/create-custom-incident', { 
            method: 'POST',
            body: JSON.stringify(incidentData)
        });
        
        closeCreateIncidentModal();
        showToast('Custom incident created successfully!', 'success');
        await loadIncidents();
    } catch (error) {
        showToast('Failed to create custom incident', 'error');
    }
}

async function handleTriggerDisruption() {
    try {
        showToast('🚨 Triggering simulated disruption...', 'info');
        
        // Trigger the disruption in the world
        await apiCall('/debug/trigger-disruption', { method: 'POST' });
        
        // Run an immediate agent tick to detect and plan
        showLoading(true);
        const tickData = await apiCall('/agent/tick', { method: 'POST' });
        showLoading(false);
        
        // Reload incidents to show the new one
        await loadIncidents();
        
        if (tickData.incidentCreated) {
            showToast(`🤖 Autonomous system detected disruption and created incident: ${tickData.incidentCreated}`, 'success');
        } else if (tickData.warning) {
            showToast(`⚠️ ${tickData.warning} - Set ANTHROPIC_API_KEY in .env to enable AI`, 'error');
        } else {
            showToast('Disruption triggered. AI will respond when threshold is reached.', 'success');
        }
    } catch (error) {
        showLoading(false);
        
        // Check if it's an API key error
        if (error.message.includes('not configured') || error.message.includes('API key')) {
            showToast('⚠️ ANTHROPIC_API_KEY not set! Check SETUP.md for instructions.', 'error');
        } else {
            showToast(`Failed to trigger disruption: ${error.message}`, 'error');
        }
        
        console.error('Disruption error details:', error);
    }
}

async function handlePlanIncident(incidentId) {
    try {
        showLoading(true);
        const data = await apiCall(`/incidents/${incidentId}/plan`, { method: 'POST' });
        showLoading(false);
        
        currentActionPlan = {
            incidentId,
            ...data.plan,
        };
        
        showActionPlan();
        showToast('AI action plan generated!', 'success');
        await loadIncidents(); // Refresh to update action counts
    } catch (error) {
        showLoading(false);
        
        // Check if it's an API key error
        if (error.message.includes('not configured') || error.message.includes('API key')) {
            showToast('⚠️ ANTHROPIC_API_KEY not set! Check SETUP.md for instructions.', 'error');
        } else {
            showToast(`Failed to generate plan: ${error.message}`, 'error');
        }
        
        console.error('Plan error details:', error);
    }
}

// Render Functions
function renderIncidents() {
    // Filter incidents based on current mode
    const filteredIncidents = incidents.filter(incident => {
        const source = incident.data_source || 'simulated';
        return source === currentMode;
    });

    if (filteredIncidents.length === 0) {
        if (currentMode === 'simulated') {
            elements.incidentsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <p>No simulated incidents yet. Create one to get started!</p>
                </div>
            `;
        } else {
            // Live GTFS-RT mode - show green checkmark for all clear
            elements.incidentsList.innerHTML = `
                <div class="empty-state all-clear">
                    <div class="checkmark-circle">
                        <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                            <circle class="checkmark-circle-path" cx="26" cy="26" r="25" fill="none"/>
                            <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                        </svg>
                    </div>
                    <h3 class="all-clear-title">All routes operational!</h3>
                    <p class="all-clear-subtitle">No live incidents detected. Transit is running smoothly.</p>
                </div>
            `;
        }
        return;
    }

    elements.incidentsList.innerHTML = filteredIncidents
        .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
        .map(incident => createIncidentCard(incident))
        .join('');

    // Attach event listeners to plan buttons
    filteredIncidents.forEach(incident => {
        const planBtn = document.getElementById(`plan-${incident.id}`);
        if (planBtn) {
            planBtn.addEventListener('click', () => handlePlanIncident(incident.id));
        }
    });
}

function createIncidentCard(incident) {
    const startTime = new Date(incident.start_time).toLocaleString();
    const hasActions = incident.actionsCount > 0;
    const dataSource = incident.data_source || 'simulated';
    const dataSourceLabel = dataSource === 'gtfs_realtime' ? '📡 Live GTFS-RT' : '🎮 Simulated';
    const dataSourceClass = dataSource === 'gtfs_realtime' ? 'badge-gtfs' : 'badge-simulated';

    return `
        <div class="incident-card">
            <div class="incident-header">
                <div class="incident-title">
                    <div class="incident-id">${incident.id}</div>
                    <span class="badge badge-${incident.severity}">${incident.severity}</span>
                    <span class="badge badge-${incident.status}">${incident.status}</span>
                    <span class="badge ${dataSourceClass}">${dataSourceLabel}</span>
                </div>
            </div>
            
            <div class="incident-details">
                <div class="detail-item">
                    <div class="detail-label">Route(s)</div>
                    <div class="detail-value">${incident.route_ids.join(', ')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Avg Delay</div>
                    <div class="detail-value">${incident.avg_delay_minutes} min</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Trips Impacted</div>
                    <div class="detail-value">${incident.trips_impacted}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Riders Estimated</div>
                    <div class="detail-value">${incident.riders_estimated.toLocaleString()}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Start Time</div>
                    <div class="detail-value">${startTime}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Segment</div>
                    <div class="detail-value">${incident.segment_start_stop_id} → ${incident.segment_end_stop_id}</div>
                </div>
            </div>

            <div class="incident-actions">
                <button id="plan-${incident.id}" class="btn btn-success">
                    🤖 ${hasActions ? 'Re-plan with AI' : 'Plan Actions with AI'}
                </button>
                ${hasActions ? `<span style="color: var(--success); font-size: 0.875rem;">✓ ${incident.actionsCount} action(s) planned</span>` : ''}
            </div>
        </div>
    `;
}

function showActionPlan() {
    if (!currentActionPlan) return;

    const { reasoning, actions } = currentActionPlan;

    elements.actionPlanContent.innerHTML = `
        <div class="reasoning-section">
            <h3>🧠 AI Reasoning</h3>
            <p>${reasoning}</p>
        </div>

        <div class="actions-grid">
            ${actions.map((action, index) => createActionCard(action, index + 1)).join('')}
        </div>
    `;

    elements.actionPlanSection.style.display = 'block';
    elements.actionPlanSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function createActionCard(action, number) {
    return `
        <div class="action-item">
            <div class="action-header">
                <span style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">
                    #${number}
                </span>
                <span class="action-category category-${action.category}">
                    ${action.category.replace('_', ' ').toUpperCase()}
                </span>
            </div>

            <div class="action-summary">${action.summary}</div>

            <div class="action-details">
                <div class="action-detail">
                    <div class="action-detail-label">📱 Rider Alert Header</div>
                    <div class="action-detail-content">${action.rider_alert_header}</div>
                </div>

                <div class="action-detail">
                    <div class="action-detail-label">📢 Rider Alert Body</div>
                    <div class="action-detail-content">${action.rider_alert_body}</div>
                </div>

                <div class="action-detail">
                    <div class="action-detail-label">👮 Operations Script</div>
                    <div class="action-detail-content">${action.ops_script}</div>
                </div>

                <div class="action-detail">
                    <div class="action-detail-label">🐦 Social Media Post</div>
                    <div class="action-detail-content">${action.social_post}</div>
                </div>
            </div>
        </div>
    `;
}

function closeActionPlan() {
    elements.actionPlanSection.style.display = 'none';
    currentActionPlan = null;
}

function updateStats() {
    // Filter stats based on current mode
    const filteredIncidents = incidents.filter(incident => {
        const source = incident.data_source || 'simulated';
        return source === currentMode;
    });
    
    elements.totalIncidents.textContent = filteredIncidents.length;
    elements.openIncidents.textContent = filteredIncidents.filter(i => i.status === 'open').length;
    
    const totalActions = filteredIncidents.reduce((sum, i) => sum + (i.actionsCount || 0), 0);
    elements.totalActions.textContent = totalActions;
}

// UI Helper Functions
function showLoading(show) {
    elements.loadingOverlay.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `
        <span style="font-size: 1.25rem;">${icon}</span>
        <span>${message}</span>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Autonomous Mode
function startAutonomousMode() {
    console.log('🤖 Starting autonomous mode - ticking every 10 seconds');
    
    // Run agent tick every 10 seconds
    setInterval(async () => {
        try {
            const tickData = await apiCall('/agent/tick', { method: 'POST' });
            
            // Refresh service snapshot after each tick
            await loadServiceSnapshot();
            await loadRisk();
            await loadIncidentIntel();
            
            // If a new incident was created, refresh the UI
            if (tickData.incidentCreated) {
                console.log(`✨ Autonomous system created incident: ${tickData.incidentCreated}`);
                await loadIncidents();
                showToast('🤖 Autonomous system detected and handled a new incident', 'success');
            }
        } catch (error) {
            // Silently log background tick errors to avoid noisy UI
            console.error('Background tick failed:', error);
        }
    }, 10000); // 10 seconds
}

