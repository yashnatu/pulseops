// src/lib/externalData.ts
// Simple weather + events adapters (optional, based on env configuration)

type WeatherSummary = {
  condition: string; // "clear", "rain", "snow", etc.
  intensity: "none" | "light" | "moderate" | "heavy";
  temperature_c?: number;
};

type EventSummary = {
  id: string;
  name: string;
  venue?: string;
  start_time?: string;
  expected_attendance?: number;
  relevance_score: number; // 0–1
};

export type ExternalContext = {
  weather: WeatherSummary | null;
  events: EventSummary[];
};

const WEATHER_API_URL = process.env.WEATHER_API_URL || "";
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || "";
const EVENTS_API_URL = process.env.EVENTS_API_URL || "";
const EVENTS_API_KEY = process.env.EVENTS_API_KEY || "";

export async function getWeatherSummary(): Promise<WeatherSummary | null> {
  if (!WEATHER_API_URL || !WEATHER_API_KEY) {
    return null;
  }

  try {
    const res = await fetch(WEATHER_API_URL, {
      headers: {
        Authorization: `Bearer ${WEATHER_API_KEY}`,
      },
    });

    if (!res.ok) {
      console.error("[externalData] Weather HTTP error", res.status);
      return null;
    }

    const data: any = await res.json();
    const condition =
      (data.condition || data.weather || "clear").toString().toLowerCase();

    return {
      condition,
      intensity: (data.intensity as WeatherSummary["intensity"]) || "moderate",
      temperature_c: data.temperature_c ?? data.temp_c ?? undefined,
    };
  } catch (err) {
    console.error("[externalData] Weather error", err);
    return null;
  }
}

export async function getUpcomingEvents(): Promise<EventSummary[]> {
  if (!EVENTS_API_URL || !EVENTS_API_KEY) {
    return [];
  }

  try {
    const res = await fetch(EVENTS_API_URL, {
      headers: {
        Authorization: `Bearer ${EVENTS_API_KEY}`,
      },
    });

    if (!res.ok) {
      console.error("[externalData] Events HTTP error", res.status);
      return [];
    }

    const data: any = await res.json();
    const items = data.events || data.items || [];
    const events: EventSummary[] = [];

    for (const item of items) {
      events.push({
        id: String(item.id || item.slug || events.length),
        name: String(item.name || item.title || "Event"),
        venue: item.venue || item.location || undefined,
        start_time: item.start_time || item.datetime || undefined,
        expected_attendance:
          item.expected_attendance || item.attendance || undefined,
        relevance_score: 0.5,
      });
    }

    return events;
  } catch (err) {
    console.error("[externalData] Events error", err);
    return [];
  }
}


