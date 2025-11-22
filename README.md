# PulseOps - AI Incident Command Assistant

An AI-powered backend for managing transit incidents using Claude Agent SDK.

## Overview

PulseOps is an intelligent incident management system that uses AI to analyze transit disruptions and recommend operational responses. It integrates real-time data from multiple sources to help transit operations teams make faster, better-informed decisions.

## Features

- 🎨 **Beautiful Web UI**: Modern, responsive dashboard for managing incidents
- 🤖 **AI-Powered Planning**: Uses Claude Agent SDK to analyze incidents and recommend actions
- 🌍 **Autonomous System**: Simulated transit world with automatic disruption detection and response
- 🔄 **Auto-Tick Loop**: System autonomously monitors, detects, and responds to disruptions every 10 seconds
- 📊 **Live Health Dashboard**: Real-time corridor health monitoring with risk assessment and trend visualization
- 🔧 **Multi-Tool Integration**: Connects to Postman Flow, RedisVL, Parallel API, and Skyflow
- 💾 **In-Memory Store**: Simple data store for incidents and planned actions
- 🚀 **REST API**: Easy-to-use HTTP endpoints for incident management
- 📱 **Real-time Updates**: Dynamic UI updates with toast notifications and loading states

## Prerequisites

- Node.js 18+ 
- npm or yarn
- An Anthropic API key (set as `ANTHROPIC_API_KEY` environment variable)

## Installation

```bash
# Install dependencies
npm install
```

## Configuration

### ⚠️ IMPORTANT: Set Your API Key First!

The AI agent requires an Anthropic API key. Create a `.env` file in the project root:

```bash
# Quick setup command:
echo "ANTHROPIC_API_KEY=sk-ant-your-actual-key-here" > .env
echo "POSTMAN_FLOW_URL=http://localhost:3000/fake-flow" >> .env
echo "PORT=3000" >> .env
```

Or manually create `.env` with:

```env
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
POSTMAN_FLOW_URL=http://localhost:3000/fake-flow
PORT=3000
```

**Get your API key:** https://console.anthropic.com/

**See detailed setup instructions:** Check [SETUP.md](SETUP.md) for troubleshooting.

**Note:** The project includes a `/fake-flow` endpoint that mimics the Postman Flow response, so you can test the full agent workflow without needing a real Postman Flow. When you have a real Postman Flow webhook, just update `POSTMAN_FLOW_URL` to point to it.

### 🎓 Incident Intelligence with Parallel API (Optional)

PulseOps can fetch real historical transit disruption case studies using the Parallel FindAll API. Add to your `.env`:

```env
# Optional: Parallel API for building case studies (offline tool)
PARALLEL_API_KEY=your_parallel_api_key_here
```

**Build case studies once:**
```bash
npm run build:case-studies
```

This generates `src/data/case_studies.json` with real transit disruption incidents from across the web. The data is then available via `/case-studies/recommendations` for the "Incident Intelligence" feature.

**See detailed guide:** [PARALLEL-CASE-STUDIES.md](PARALLEL-CASE-STUDIES.md)

### 📡 GTFS-Realtime Integration (Optional)

PulseOps can connect to real GTFS-Realtime feeds! Add these to your `.env`:

```env
# GTFS-Realtime feed URL (trip updates protobuf)
GTFS_RT_URL=https://api.511.org/transit/tripupdates?api_key=YOUR_KEY&agency=SF

# Optional: Filter to specific route
GTFS_RT_ROUTE_FILTER=Red Line

# Stop IDs for the corridor segment to monitor
GTFS_RT_SEGMENT_START_STOP_ID=stop-100
GTFS_RT_SEGMENT_END_STOP_ID=stop-120
```

**How it works:**
- System fetches GTFS-RT protobuf feed and decodes trip updates
- Extracts `delay` from `StopTimeEvent` (arrival or departure)
- Only positive delays are considered "late" (negative = early, clamped to 0)
- Aggregates delays across trips to calculate incident metrics
- **Automatic fallback:** If GTFS-RT unavailable or returns no delays, seamlessly falls back to simulation
- Incidents show badges: "📡 Live GTFS-RT" vs "🎮 Simulated"

## Running the Server

### Development Mode (with auto-reload)

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

**Open the UI:** Navigate to `http://localhost:3000` in your browser to access the PulseOps dashboard.

### Production Mode

```bash
# Build TypeScript to JavaScript
npm run build

# Start the server
npm start
```

## API Endpoints

### Case Studies & Incident Intelligence (NEW! 🆕)
```bash
GET /case-studies/recommendations
```

Returns historical case studies of similar transit disruptions for learning and recommendations.

**Query Parameters:**
- `scenario_type`: Filter by scenario (e.g., `weather_blockage`, `signal_failure`)
- `mode`: Filter by transit mode (e.g., `bus`, `subway`)
- `limit`: Maximum number of results (default: 5)

**Example:**
```bash
curl "http://localhost:3000/case-studies/recommendations?scenario_type=weather_blockage&limit=3"
```

**Response:**
```json
{
  "ok": true,
  "case_studies": [
    {
      "id": "weather_bus_trunk_0",
      "city": "Boston",
      "agency": "MBTA",
      "mode": "bus",
      "scenario_type": "weather_blockage",
      "peak_delay_minutes": 25,
      "duration_minutes": 120,
      "riders_impacted": 450,
      "actions_taken": ["detours", "rider alerts"],
      "outcome_quality": "mixed",
      "summary": "Major snowstorm caused significant delays...",
      "source_url": "https://example.com/article"
    }
  ],
  "total_available": 35
}
```

**Build case studies:** See [PARALLEL-CASE-STUDIES.md](PARALLEL-CASE-STUDIES.md) for how to generate real case studies using Parallel FindAll API.

### Corridor Health Monitoring (NEW! 🆕)
```bash
GET /health
```

Returns comprehensive corridor health metrics including:
- **Health Score** (0-100): Overall corridor health indicator
- **Risk Level**: Low/Medium/High based on recent performance
- **Avg Delay (15m)**: Rolling 15-minute average delay
- **Volatility**: Standard deviation of delays
- **Near Misses**: Number of delays above concern threshold but below incident threshold
- **History**: Last 60 snapshots for sparkline visualization

**Example:**
```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "ok": true,
  "worldStatus": {
    "route_id": "10",
    "segment_start_stop_id": "S2",
    "segment_end_stop_id": "S3",
    "avg_delay_minutes": 5.3,
    "trips_impacted": 3,
    "riders_estimated": 90,
    "source": "simulated"
  },
  "health": {
    "health_score": 56,
    "avg_delay_15m": 5.3,
    "delay_volatility": 5.9,
    "risk_level": "medium",
    "near_miss_count_30m": 0
  },
  "history": [
    { "timestamp": 1763763022787, "avg_delay_minutes": 0 },
    { "timestamp": 1763763032774, "avg_delay_minutes": 15 }
  ]
}
```

**Features:**
- Updates every 10 seconds via autonomous tick loop
- 60-snapshot rolling history (10 minutes @ 10s intervals)
- Metrics computed from 15-30 minute windows
- Works with both GTFS-RT and simulated data
- UI shows live sparkline visualization

### Fake Postman Flow Endpoint
```bash
POST /fake-flow
```

Mimics a Postman Flow webhook that returns merged transit + weather context. This allows you to test the full agent workflow without setting up a real Postman Flow.

**Example:**
```bash
curl -X POST http://localhost:3000/fake-flow \
  -H "Content-Type: application/json" \
  -d '{"route_id":"10","segment_start_stop_id":"stop-100","segment_end_stop_id":"stop-120"}'
```

**Response:**
```json
{
  "route_id": "10",
  "avg_delay_minutes_live": 18,
  "weather_summary": "heavy rain",
  "suggested_cause": "WEATHER",
  "timestamp": "2025-11-21T..."
}
```

### Create a Test Incident
```bash
POST /debug/create-incident
```

Returns a fake incident with sample data for testing.

**Example:**
```bash
curl -X POST http://localhost:3000/debug/create-incident
```

### List All Incidents
```bash
GET /incidents
```

### Get Specific Incident
```bash
GET /incidents/:id
```

### Plan Actions for an Incident (AI Agent)
```bash
POST /incidents/:id/plan
```

This endpoint:
1. Loads the incident from the store
2. Calls the Claude AI agent to analyze and plan actions
3. Saves the planned actions to the store
4. Returns the complete plan with reasoning

**Example:**
```bash
# First, create a test incident
INCIDENT_ID=$(curl -X POST http://localhost:3000/debug/create-incident | jq -r '.incident.id')

# Then, have the AI plan actions for it
curl -X POST http://localhost:3000/incidents/$INCIDENT_ID/plan
```

### Get Actions for an Incident
```bash
GET /incidents/:id/actions
```

## Quick Start Guide

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your `.env` file** with your Anthropic API key.
   
   Create a `.env` file in the project root:
   ```bash
   echo "ANTHROPIC_API_KEY=your-api-key-here" > .env
   echo "POSTMAN_FLOW_URL=http://localhost:3000/fake-flow" >> .env
   echo "PORT=3000" >> .env
   ```
   
   Or manually create `.env` with these contents:
   ```
   ANTHROPIC_API_KEY=your-api-key-here
   POSTMAN_FLOW_URL=http://localhost:3000/fake-flow
   PORT=3000
   ```
   
   **Replace `your-api-key-here` with your actual Anthropic API key.**

3. **Start the dev server:**
   ```bash
   npm run dev
   ```

4. **Open the UI in your browser:**
   ```
   http://localhost:3000
   ```
   
   You can now:
   - Click "Create Test Incident" to generate a fake incident
   - Click "Plan Actions with AI" on any incident to have Claude analyze it
   - View the AI-generated action plans with reasoning

5. **Or test the API directly with the fake flow endpoint:**
   ```bash
   curl -X POST http://localhost:3000/fake-flow \
     -H "Content-Type: application/json" \
     -d '{"route_id":"10"}'
   ```
   
   You should see a JSON response with weather data and delays.

6. **Create a test incident via API:**
   ```bash
   curl -X POST http://localhost:3000/debug/create-incident
   ```
   
   This will return an incident object with an `id` field. Copy the ID for the next step.

7. **Have the AI plan actions via API:**
   ```bash
   # Replace <incident-id> with the ID from step 5
   curl -X POST http://localhost:3000/incidents/<incident-id>/plan
   ```
   
   The agent will use the fake flow endpoint to gather context and then generate action recommendations.

8. **View the planned actions via API:**
   ```bash
   curl http://localhost:3000/incidents/<incident-id>/actions
   ```

## Project Structure

```
project_pyn/
├── src/
│   ├── agent/
│   │   └── pulseOpsAgent.ts    # Claude Agent SDK integration
│   ├── lib/
│   │   ├── models.ts            # TypeScript types/interfaces
│   │   ├── store.ts             # In-memory data store
│   │   ├── world.ts             # Transit world simulator with history tracking
│   │   ├── health.ts            # Health metrics computation
│   │   ├── gtfsAdapter.ts       # GTFS-Realtime integration
│   │   └── caseStudies.ts       # Case study data models (NEW)
│   ├── data/
│   │   └── case_studies.json    # Historical incident data (NEW)
│   └── server.ts                # Express HTTP server
├── scripts/
│   └── buildCaseStudiesFromParallel.ts  # Offline data builder (NEW)
├── public/
│   ├── index.html               # Web UI (main page)
│   ├── styles.css               # Modern, responsive styling
│   └── app.js                   # Frontend JavaScript
├── .env                         # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## Architecture

### Autonomous System

PulseOps operates as a **live autonomous system** with these components:

1. **World Simulator** (`src/lib/world.ts`)
   - Simulates a transit corridor with dynamic delays
   - Models disruptions and gradual recovery
   - Provides real-time status updates
   - **NEW**: Tracks 60-snapshot rolling history for health monitoring
   - Integrates with GTFS-Realtime feeds when configured

2. **Health Monitoring System** (`src/lib/health.ts`) 🆕
   - Computes real-time health metrics from rolling history
   - Calculates health score (0-100) based on delays, volatility, and near misses
   - Determines risk level (Low/Medium/High)
   - Provides early warning before incidents occur
   - Visualized in dashboard with sparkline charts

3. **Agent Tick Loop** (`POST /agent/tick`)
   - Runs every 10 seconds automatically
   - Evolves the world (delays decay over time)
   - **NEW**: Records world status to history buffer
   - Detects when delays exceed threshold (>10 min)
   - Auto-creates incidents when needed
   - Calls AI to plan actions automatically
   - Stores actions in the database

4. **Manual Controls**
   - `POST /debug/trigger-disruption` - Simulate a sudden 15-min delay
   - Frontend button triggers disruption + immediate AI response

### Agent Tools

The AI agent has access to four tools:

1. **get_incident_context** - Fetches real-time transit and weather data via Postman Flow (defaults to local `/fake-flow`)
2. **get_similar_incidents** - Retrieves historical incidents from RedisVL for pattern matching (stubbed)
3. **get_external_context** - Looks up external events (crashes, protests) via Parallel API (stubbed)
4. **get_operator_contacts** - Fetches operator contact info from Skyflow (stubbed)

### Data Models

- **Incident**: Represents a transit disruption with severity, location, and impact metrics
- **PlannedAction**: An AI-recommended response (alert, detour, or shuttle)
- **PlanResult**: Complete analysis with actions and reasoning
- **WorldStatus**: Current state of the transit corridor (GTFS-RT or simulated)
- **TimedWorldStatus**: WorldStatus with timestamp for history tracking 🆕
- **HealthMetrics**: Computed health indicators (score, volatility, risk) 🆕

## Development

### Type Checking

```bash
npx tsc --noEmit
```

### Hot Reload

The dev server uses `ts-node-dev` for automatic reloading when files change.

## Notes

- The current implementation uses **stub data** for RedisVL, Parallel API, and Skyflow integrations
- The Postman Flow integration requires a valid webhook URL in your `.env` file
- All data is stored **in-memory** and will be lost when the server restarts
- For production use, connect to a real database and implement the external API integrations

## Future Enhancements

- [ ] Persistent database (PostgreSQL/Redis)
- [ ] Authentication and authorization
- [ ] WebSocket support for real-time updates
- [x] ✅ Case studies with Parallel FindAll API (offline build)
- [ ] Complete RedisVL and Skyflow integrations
- [ ] Unit and integration tests
- [ ] Docker containerization
- [ ] Historical incident analytics dashboard

## License

ISC

---

Built with ❤️ using Claude Agent SDK


# pulseops