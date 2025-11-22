# Building Case Studies with Parallel FindAll API

This guide explains how to use the Parallel FindAll API to automatically generate real transit disruption case studies for the "Incident Intelligence" feature.

## Overview

The `scripts/buildCaseStudiesFromParallel.ts` script uses Parallel's FindAll API to search the web for real transit disruption incidents and extract structured data. This data is saved to `src/data/case_studies.json` and served via the `/case-studies/recommendations` endpoint.

## Setup

### 1. Get a Parallel API Key

1. Sign up at [Parallel.ai](https://parallel.ai) (or your Parallel provider)
2. Generate an API key from your dashboard
3. Copy the API key

### 2. Add API Key to .env

Add the following to your `.env` file:

```env
# Parallel API for building case studies
PARALLEL_API_KEY=your_parallel_api_key_here
PARALLEL_API_BASE_URL=https://api.parallel.ai  # Optional, defaults to this
```

**Important:** The Parallel API key is only needed for building case studies offline. It is NOT used by the main server.

## Usage

### Build Case Studies (Offline)

Run the build script to fetch real transit disruption data:

```bash
npm run build:case-studies
```

**What it does:**
1. Searches the web for 5 different types of transit disruptions:
   - Weather blockages (snow/ice causing bus detours)
   - Signal failures (subway delays)
   - Event crowding (stadium games causing capacity issues)
   - Infrastructure failures (track damage, etc.)
   - Vehicle breakdowns (disabled buses blocking lanes)

2. For each theme, it calls Parallel FindAll with targeted search queries

3. Extracts structured data from web sources:
   - City and transit agency
   - Mode of transit (bus, subway, rail)
   - Delay duration and impact
   - Actions taken by operators
   - Outcome quality

4. Normalizes and saves to `src/data/case_studies.json`

### Expected Output

```
🚀 Building case studies from Parallel FindAll API...

API Base URL: https://api.parallel.ai
Themes to process: 5

📡 Fetching theme: weather_bus_trunk
   Query: "city bus service disruption snow detour shuttle..."
  → Calling Parallel FindAll API...
   ✅ Got 8 case studies for theme weather_bus_trunk

📡 Fetching theme: signal_subway
   Query: "subway signal failure major delays service..."
  → Calling Parallel FindAll API...
   ✅ Got 7 case studies for theme signal_subway

...

✅ SUCCESS!
📁 Wrote 35 case studies to /Users/you/project/src/data/case_studies.json

Breakdown by theme:
  - weather_bus_trunk: 8 cases
  - signal_subway: 7 cases
  - event_crowding: 6 cases
  - infrastructure_failure: 9 cases
  - vehicle_breakdown: 5 cases

💡 Next steps:
   1. Start your server: npm run dev
   2. Test the endpoint: curl http://localhost:3000/case-studies/recommendations
```

### View Case Studies in the App

Once you've built the case studies, start your server:

```bash
npm run dev
```

Then test the endpoint:

```bash
# Get all case studies (limited to 5 by default)
curl http://localhost:3000/case-studies/recommendations

# Filter by scenario type
curl http://localhost:3000/case-studies/recommendations?scenario_type=weather_blockage

# Filter by mode
curl http://localhost:3000/case-studies/recommendations?mode=bus

# Get more results
curl http://localhost:3000/case-studies/recommendations?limit=10
```

**Response format:**
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
      "corridor_type": "urban_trunk",
      "time_of_day": "am_peak",
      "weekday": "weekday",
      "peak_delay_minutes": 25,
      "duration_minutes": 120,
      "riders_impacted": 450,
      "actions_taken": [
        "detours",
        "rider alerts",
        "real-time updates"
      ],
      "outcome_quality": "mixed",
      "summary": "Major snowstorm caused significant delays...",
      "source_url": "https://example.com/article"
    }
  ],
  "total_available": 35
}
```

## Customization

### Add More Search Themes

Edit `scripts/buildCaseStudiesFromParallel.ts` and add to the `THEMES` array:

```typescript
const THEMES: ThemeConfig[] = [
  // ... existing themes ...
  {
    id: "power_outage",
    query: "transit power outage service disruption backup generators emergency",
    scenario_type: "power_outage",
    mode: "rail",
    corridor_type: "urban_trunk",
  },
];
```

### Adjust Extraction Instructions

Modify the `extraction_instructions` in `callParallelFindAll()` to extract different fields or provide more specific guidance to the AI.

### Change Result Limits

Adjust `max_items` in the Parallel API call (currently set to 10 per theme).

## Data Schema

Each case study has the following structure:

```typescript
type CaseStudy = {
  id: string;                    // Unique identifier
  city: string;                  // e.g., "Boston"
  agency: string;                // e.g., "MBTA"
  mode: string;                  // "bus", "subway", "light_rail", etc.
  scenario_type: string;         // "weather_blockage", "signal_failure", etc.
  corridor_type: string;         // "urban_trunk", "core_subway", etc.
  time_of_day: string;           // "am_peak", "pm_peak", "midday", "overnight"
  weekday: string;               // "weekday" or "weekend"
  peak_delay_minutes: number;    // Maximum delay observed
  duration_minutes: number;      // How long the disruption lasted
  riders_impacted: number;       // Estimated number of riders affected
  actions_taken: string[];       // Array of response actions
  outcome_quality: "good" | "mixed" | "poor";
  summary: string;               // 2-3 sentence description
  source_url?: string;           // Optional link to source article
};
```

## Workflow Integration

### Recommended Workflow

1. **Initial Setup:** Run `npm run build:case-studies` once to populate real data
2. **Development:** Use the generated `case_studies.json` for testing
3. **Periodic Updates:** Re-run the script weekly/monthly to refresh with new incidents
4. **Version Control:** Consider committing `case_studies.json` so other developers don't need Parallel access

### CI/CD Integration

You can automate case study updates in your CI/CD pipeline:

```yaml
# Example GitHub Action
- name: Update case studies
  run: npm run build:case-studies
  env:
    PARALLEL_API_KEY: ${{ secrets.PARALLEL_API_KEY }}
```

## Troubleshooting

### "PARALLEL_API_KEY is not set"

Make sure you've added your API key to `.env`:

```env
PARALLEL_API_KEY=your_key_here
```

### "No case studies generated"

This can happen if:
- The Parallel API is down or rate-limited
- Your API key is invalid
- Network connectivity issues
- Search queries returned no results

Try:
1. Check your API key is correct
2. Verify network connectivity
3. Check Parallel API status
4. Adjust search queries to be less specific

### API Rate Limits

If you hit rate limits:
1. Reduce the number of themes
2. Decrease `max_items` per theme
3. Add delays between API calls
4. Upgrade your Parallel plan

### Malformed Data

If the script generates invalid data:
1. Check the Parallel response format (it may have changed)
2. Adjust `normalizeToCaseStudies()` to handle the actual response structure
3. Add more defensive parsing and validation

## Cost Considerations

- Each theme makes 1 API call to Parallel FindAll
- With 5 themes and `max_items: 10`, you'll process ~50 web pages per run
- Typical cost: $0.10 - $0.50 per run (varies by provider)
- Run periodically (weekly/monthly) rather than on every server restart

## Next Steps

1. ✅ Add `PARALLEL_API_KEY` to `.env`
2. ✅ Run `npm run build:case-studies`
3. ✅ Verify `src/data/case_studies.json` exists
4. ✅ Start server and test `/case-studies/recommendations`
5. 🔄 Integrate case studies into UI "Incident Intelligence" cards
6. 🔄 Add filtering and recommendation logic based on current incidents

---

**Built with Parallel FindAll API** | [API Documentation](https://parallel.ai/docs)

