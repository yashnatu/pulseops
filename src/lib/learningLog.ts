// src/lib/learningLog.ts
// Simple in-memory + file-backed learning log for the copilot

import fs from "fs";
import path from "path";

export type LearningEntry = {
  id: string;
  created_at: string;
  incident_id?: string;
  route_id?: string;
  summary: string;
  category: string; // "threshold_adjustment" | "pattern_detected" | "playbook_feedback" | etc.
};

const LOG_PATH = path.join(__dirname, "..", "data", "learning_log.json");
let ENTRIES: LearningEntry[] = [];

function loadLog() {
  if (ENTRIES.length) return;
  try {
    const raw = fs.readFileSync(LOG_PATH, "utf8");
    ENTRIES = JSON.parse(raw) as LearningEntry[];
  } catch {
    ENTRIES = [];
  }
}

function persistLog() {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.writeFileSync(LOG_PATH, JSON.stringify(ENTRIES, null, 2), "utf8");
  } catch (err) {
    console.error("[learningLog] persist error", err);
  }
}

export function getLearningLog(limit = 20): LearningEntry[] {
  loadLog();
  return ENTRIES.slice(-limit);
}

export function addLearningEntry(
  entry: Omit<LearningEntry, "id" | "created_at">,
): LearningEntry {
  loadLog();
  const full: LearningEntry = {
    id: `log_${Date.now()}_${ENTRIES.length}`,
    created_at: new Date().toISOString(),
    ...entry,
  };
  ENTRIES.push(full);
  persistLog();
  return full;
}


