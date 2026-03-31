import { readdir } from "node:fs/promises";
import path from "node:path";

import type { EventLogEntry, SyncStatus } from "../types.js";
import { pathExists, readTextFile } from "./fs.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SINCE_DAYS = 14;
const SUCCESS_LIKE_STATUSES = new Set<SyncStatus>(["success", "partial_success"]);
const REUSE_EVENTS = new Set(["profile.apply", "bootstrap", "profile.sync"]);
const REPORT_EVENT_ORDER = [
  "profile.import",
  "profile.search",
  "profile.apply",
  "profile.sync",
  "bootstrap",
  "profile.rollback",
] as const;

export interface ReportCommandOutcome {
  event: string;
  total: number;
  success: number;
  partial_success: number;
  failure: number;
  success_like_rate_pct: number;
  avg_duration_ms: number | null;
  median_duration_ms: number | null;
}

export interface WeeklyReuseSummary {
  week_start: string;
  reused_profiles: number;
  reuse_events: number;
}

export interface TopProfileSummary {
  profile: string;
  reuse_events: number;
  profile_apply_events: number;
  bootstrap_events: number;
  profile_sync_events: number;
}

export interface RecentFailureSummary {
  timestamp: string;
  event: string;
  profile: string;
  message: string;
}

export interface ReportSummary {
  repo_path: string;
  repo_name: string;
  since: string;
  until: string;
  total_events: number;
  unique_actors: number;
  unique_machines: number;
  created_profiles: number;
  reused_profiles: number;
  cross_tool_profiles: number;
  search_events: number;
  search_zero_result_events: number;
  eligible_searches_for_reuse_24h: number;
  searches_with_reuse_within_24h: number;
  search_to_reuse_within_24h_pct: number | null;
  eligible_imports_for_repeat_reuse_14d: number;
  reused_imports_within_14d: number;
  repeat_reuse_rate_14d_pct: number | null;
  median_restore_duration_ms: number | null;
  command_outcomes: ReportCommandOutcome[];
  weekly_reused_profiles: WeeklyReuseSummary[];
  top_profiles: TopProfileSummary[];
  recent_failures: RecentFailureSummary[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function assertStatus(value: unknown, label: string): SyncStatus {
  const status = assertString(value, label);
  if (!SUCCESS_LIKE_STATUSES.has(status as SyncStatus) && status !== "failure") {
    throw new Error(`${label} must be 'success', 'partial_success', or 'failure'.`);
  }

  return status as SyncStatus;
}

function assertOptionalSourceTool(value: unknown, label: string): EventLogEntry["source_tool"] {
  if (value === undefined) {
    return undefined;
  }

  const sourceTool = assertString(value, label);
  if (sourceTool !== "claude-code") {
    throw new Error(`${label} must be 'claude-code' when present.`);
  }

  return sourceTool;
}

function assertOptionalTargetTool(value: unknown, label: string): EventLogEntry["target_tool"] {
  if (value === undefined) {
    return undefined;
  }

  const targetTool = assertString(value, label);
  if (targetTool !== "codex") {
    throw new Error(`${label} must be 'codex' when present.`);
  }

  return targetTool;
}

function assertOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return assertString(value, label);
}

function assertOptionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number when present.`);
  }

  return value;
}

function assertOptionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings when present.`);
  }

  return value.map((item, index) => assertString(item, `${label}[${index}]`));
}

function assertScope(value: unknown, label: string): EventLogEntry["scope"] {
  const scope = assertString(value, label);
  if (scope !== "team" && scope !== "personal") {
    throw new Error(`${label} must be 'team' or 'personal'.`);
  }

  return scope;
}

function assertIsoTimestamp(value: unknown, label: string): string {
  const timestamp = assertString(value, label);
  if (Number.isNaN(new Date(timestamp).getTime())) {
    throw new Error(`${label} must be a valid timestamp.`);
  }

  return timestamp;
}

function parseEventLogEntry(
  value: unknown,
  sourceLabel: string,
): EventLogEntry {
  if (!isPlainRecord(value)) {
    throw new Error(`${sourceLabel} must be an object.`);
  }

  const durationMs = value.duration_ms;
  if (durationMs !== undefined && (typeof durationMs !== "number" || durationMs < 0)) {
    throw new Error(`${sourceLabel}.duration_ms must be a non-negative number when present.`);
  }

  return {
    timestamp: assertIsoTimestamp(value.timestamp, `${sourceLabel}.timestamp`),
    event: assertString(value.event, `${sourceLabel}.event`),
    profile: assertString(value.profile, `${sourceLabel}.profile`),
    scope: assertScope(value.scope, `${sourceLabel}.scope`),
    source_tool: assertOptionalSourceTool(value.source_tool, `${sourceLabel}.source_tool`),
    target_tool: assertOptionalTargetTool(value.target_tool, `${sourceLabel}.target_tool`),
    status: assertStatus(value.status, `${sourceLabel}.status`),
    message: assertOptionalString(value.message, `${sourceLabel}.message`),
    duration_ms: durationMs,
    actor_id: assertOptionalString(value.actor_id, `${sourceLabel}.actor_id`),
    machine_id: assertOptionalString(value.machine_id, `${sourceLabel}.machine_id`),
    repo_name: assertOptionalString(value.repo_name, `${sourceLabel}.repo_name`),
    query: assertOptionalString(value.query, `${sourceLabel}.query`),
    result_count: assertOptionalNumber(value.result_count, `${sourceLabel}.result_count`),
    matched_profiles: assertOptionalStringArray(value.matched_profiles, `${sourceLabel}.matched_profiles`),
  };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isSuccessLike(status: SyncStatus): boolean {
  return SUCCESS_LIKE_STATUSES.has(status);
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}

function parseSinceInput(value: string | undefined, now: Date): Date {
  if (!value) {
    return new Date(now.getTime() - DEFAULT_SINCE_DAYS * DAY_MS);
  }

  if (value === "all") {
    return new Date(0);
  }

  const relativeMatch = value.match(/^(\d+)([dhw])$/);
  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    const unit = relativeMatch[2];
    const multiplier = unit === "h" ? 60 * 60 * 1000 : unit === "d" ? DAY_MS : 7 * DAY_MS;
    return new Date(now.getTime() - amount * multiplier);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("`--since` must be `all`, a relative duration like `14d`, or an ISO date.");
  }

  return parsed;
}

function getWeekStart(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay() === 0 ? 7 : start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (day - 1));
  return start;
}

async function readEventLogs(repoPath: string): Promise<EventLogEntry[]> {
  const logsDir = path.join(repoPath, "logs");
  if (!(await pathExists(logsDir))) {
    return [];
  }

  const files = (await readdir(logsDir))
    .filter((fileName) => fileName.startsWith("events-") && fileName.endsWith(".jsonl"))
    .sort((left, right) => left.localeCompare(right));

  const entries: EventLogEntry[] = [];
  for (const fileName of files) {
    const contents = await readTextFile(path.join(logsDir, fileName));
    const lines = contents.split("\n").filter((line) => line.trim().length > 0);
    for (const [index, line] of lines.entries()) {
      const sourceLabel = `${fileName}:${index + 1}`;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse ${sourceLabel}: ${message}`);
      }

      entries.push(parseEventLogEntry(parsed, sourceLabel));
    }
  }

  return entries.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export async function summarizeEvents(options: {
  repoPath: string;
  since?: string;
  now?: Date;
  topProfilesLimit?: number;
  recentFailuresLimit?: number;
}): Promise<ReportSummary> {
  const now = options.now ?? new Date();
  const sinceDate = parseSinceInput(options.since, now);
  const untilDate = now;
  const allEvents = await readEventLogs(options.repoPath);
  const windowEvents = allEvents.filter((entry) => {
    const timestamp = new Date(entry.timestamp).getTime();
    return timestamp >= sinceDate.getTime() && timestamp <= untilDate.getTime();
  });
  const repoName =
    windowEvents.find((entry) => typeof entry.repo_name === "string")?.repo_name ??
    allEvents.find((entry) => typeof entry.repo_name === "string")?.repo_name ??
    (path.basename(options.repoPath) === ".myai" ? "myai" : path.basename(options.repoPath));
  const uniqueActors = new Set(
    windowEvents.map((entry) => entry.actor_id).filter((value): value is string => typeof value === "string"),
  );
  const uniqueMachines = new Set(
    windowEvents.map((entry) => entry.machine_id).filter((value): value is string => typeof value === "string"),
  );

  const createdProfiles = new Set(
    windowEvents
      .filter((entry) => entry.event === "profile.import" && isSuccessLike(entry.status))
      .map((entry) => entry.profile),
  );
  const reuseEvents = windowEvents.filter(
    (entry) => REUSE_EVENTS.has(entry.event) && isSuccessLike(entry.status),
  );
  const reusedProfiles = new Set(reuseEvents.map((entry) => entry.profile));
  const crossToolProfiles = new Set(
    windowEvents
      .filter(
        (entry) =>
          entry.event === "profile.sync" &&
          isSuccessLike(entry.status) &&
        entry.target_tool === "codex",
      )
      .map((entry) => entry.profile),
  );
  const searchEvents = windowEvents.filter(
    (entry) => entry.event === "profile.search" && isSuccessLike(entry.status),
  );
  const searchZeroResultEvents = searchEvents.filter((entry) => (entry.result_count ?? 0) === 0);
  const eligibleSearches = searchEvents.filter(
    (entry) => (entry.matched_profiles?.length ?? 0) > 0 && identityKey(entry) !== null,
  );
  const searchesWithReuseWithin24h = eligibleSearches.filter((searchEntry) => {
    const searchIdentity = identityKey(searchEntry);
    const matchedProfiles = new Set(searchEntry.matched_profiles ?? []);
    if (!searchIdentity || matchedProfiles.size === 0) {
      return false;
    }

    const searchTime = new Date(searchEntry.timestamp).getTime();
    const deadline = searchTime + DAY_MS;
    return reuseEvents.some((reuseEntry) => {
      const reuseTime = new Date(reuseEntry.timestamp).getTime();
      return (
        identityKey(reuseEntry) === searchIdentity &&
        matchedProfiles.has(reuseEntry.profile) &&
        reuseTime > searchTime &&
        reuseTime <= deadline
      );
    });
  }).length;

  const importLookaheadCutoff = new Date(untilDate.getTime() - 14 * DAY_MS);
  const eligibleImports = allEvents.filter((entry) => {
    const timestamp = new Date(entry.timestamp).getTime();
    return (
      entry.event === "profile.import" &&
      isSuccessLike(entry.status) &&
      timestamp >= sinceDate.getTime() &&
      timestamp <= importLookaheadCutoff.getTime()
    );
  });
  const reusedImportsWithin14d = eligibleImports.filter((importEntry) => {
    const importTime = new Date(importEntry.timestamp).getTime();
    const deadline = importTime + 14 * DAY_MS;
    return allEvents.some((entry) => {
      const timestamp = new Date(entry.timestamp).getTime();
      return (
        entry.profile === importEntry.profile &&
        REUSE_EVENTS.has(entry.event) &&
        isSuccessLike(entry.status) &&
        timestamp > importTime &&
        timestamp <= deadline
      );
    });
  }).length;

  const restoreDurations = windowEvents
    .filter(
      (entry) =>
        (entry.event === "profile.apply" || entry.event === "bootstrap") &&
        isSuccessLike(entry.status) &&
        typeof entry.duration_ms === "number",
    )
    .map((entry) => entry.duration_ms as number);

  const commandOutcomes = REPORT_EVENT_ORDER.map((eventName) => {
    const events = windowEvents.filter((entry) => entry.event === eventName);
    const durations = events
      .map((entry) => entry.duration_ms)
      .filter((value): value is number => typeof value === "number");
    const success = events.filter((entry) => entry.status === "success").length;
    const partialSuccess = events.filter((entry) => entry.status === "partial_success").length;
    const failure = events.filter((entry) => entry.status === "failure").length;

    return {
      event: eventName,
      total: events.length,
      success,
      partial_success: partialSuccess,
      failure,
      success_like_rate_pct:
        events.length === 0 ? 0 : Math.round((((success + partialSuccess) / events.length) * 100) * 10) / 10,
      avg_duration_ms: average(durations),
      median_duration_ms: median(durations),
    };
  });

  const weeklyReuseMap = new Map<string, { profiles: Set<string>; reuse_events: number }>();
  for (const entry of reuseEvents) {
    const weekStart = toIsoDate(getWeekStart(new Date(entry.timestamp)));
    const bucket = weeklyReuseMap.get(weekStart) ?? { profiles: new Set<string>(), reuse_events: 0 };
    bucket.profiles.add(entry.profile);
    bucket.reuse_events += 1;
    weeklyReuseMap.set(weekStart, bucket);
  }

  const weeklyReusedProfiles = [...weeklyReuseMap.entries()]
    .map(([weekStart, value]) => ({
      week_start: weekStart,
      reused_profiles: value.profiles.size,
      reuse_events: value.reuse_events,
    }))
    .sort((left, right) => left.week_start.localeCompare(right.week_start));

  const topProfiles = [...new Set(reuseEvents.map((entry) => entry.profile))]
    .map((profile) => ({
      profile,
      reuse_events: reuseEvents.filter((entry) => entry.profile === profile).length,
      profile_apply_events: reuseEvents.filter(
        (entry) => entry.profile === profile && entry.event === "profile.apply",
      ).length,
      bootstrap_events: reuseEvents.filter(
        (entry) => entry.profile === profile && entry.event === "bootstrap",
      ).length,
      profile_sync_events: reuseEvents.filter(
        (entry) => entry.profile === profile && entry.event === "profile.sync",
      ).length,
    }))
    .sort((left, right) => {
      if (right.reuse_events !== left.reuse_events) {
        return right.reuse_events - left.reuse_events;
      }
      return left.profile.localeCompare(right.profile);
    })
    .slice(0, options.topProfilesLimit ?? 5);

  const recentFailures = windowEvents
    .filter((entry) => entry.status === "failure")
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, options.recentFailuresLimit ?? 5)
    .map((entry) => ({
      timestamp: entry.timestamp,
      event: entry.event,
      profile: entry.profile,
      message: entry.message ?? "(no message)",
    }));

  return {
    repo_path: options.repoPath,
    repo_name: repoName,
    since: sinceDate.toISOString(),
    until: untilDate.toISOString(),
    total_events: windowEvents.length,
    unique_actors: uniqueActors.size,
    unique_machines: uniqueMachines.size,
    created_profiles: createdProfiles.size,
    reused_profiles: reusedProfiles.size,
    cross_tool_profiles: crossToolProfiles.size,
    search_events: searchEvents.length,
    search_zero_result_events: searchZeroResultEvents.length,
    eligible_searches_for_reuse_24h: eligibleSearches.length,
    searches_with_reuse_within_24h: searchesWithReuseWithin24h,
    search_to_reuse_within_24h_pct:
      eligibleSearches.length === 0
        ? null
        : Math.round(((searchesWithReuseWithin24h / eligibleSearches.length) * 100) * 10) / 10,
    eligible_imports_for_repeat_reuse_14d: eligibleImports.length,
    reused_imports_within_14d: reusedImportsWithin14d,
    repeat_reuse_rate_14d_pct:
      eligibleImports.length === 0
        ? null
        : Math.round(((reusedImportsWithin14d / eligibleImports.length) * 100) * 10) / 10,
    median_restore_duration_ms: median(restoreDurations),
    command_outcomes: commandOutcomes,
    weekly_reused_profiles: weeklyReusedProfiles,
    top_profiles: topProfiles,
    recent_failures: recentFailures,
  };
}

function formatValue(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function identityKey(entry: EventLogEntry): string | null {
  return entry.actor_id ?? entry.machine_id ?? null;
}

export function formatReportSummary(summary: ReportSummary): string {
  const lines: string[] = [
    "# MyAI Pilot Summary",
    "",
    `- repo_path: ${summary.repo_path}`,
    `- repo_name: ${summary.repo_name}`,
    `- since: ${summary.since}`,
    `- until: ${summary.until}`,
    `- total_events: ${summary.total_events}`,
    `- unique_actors: ${summary.unique_actors}`,
    `- unique_machines: ${summary.unique_machines}`,
    `- created_profiles: ${summary.created_profiles}`,
    `- reused_profiles: ${summary.reused_profiles}`,
    `- cross_tool_profiles: ${summary.cross_tool_profiles}`,
    `- search_events: ${summary.search_events}`,
    `- search_zero_result_events: ${summary.search_zero_result_events}`,
    `- eligible_searches_for_reuse_24h: ${summary.eligible_searches_for_reuse_24h}`,
    `- searches_with_reuse_within_24h: ${summary.searches_with_reuse_within_24h}`,
    `- search_to_reuse_within_24h_pct: ${formatValue(summary.search_to_reuse_within_24h_pct)}`,
    `- eligible_imports_for_repeat_reuse_14d: ${summary.eligible_imports_for_repeat_reuse_14d}`,
    `- reused_imports_within_14d: ${summary.reused_imports_within_14d}`,
    `- repeat_reuse_rate_14d_pct: ${formatValue(summary.repeat_reuse_rate_14d_pct)}`,
    `- median_restore_duration_ms: ${formatValue(summary.median_restore_duration_ms)}`,
    "",
    "## Command Outcomes",
    "event\ttotal\tsuccess\tpartial_success\tfailure\tsuccess_like_rate_pct\tavg_duration_ms\tmedian_duration_ms",
  ];

  for (const outcome of summary.command_outcomes) {
    lines.push(
      [
        outcome.event,
        outcome.total,
        outcome.success,
        outcome.partial_success,
        outcome.failure,
        outcome.success_like_rate_pct,
        formatValue(outcome.avg_duration_ms),
        formatValue(outcome.median_duration_ms),
      ].join("\t"),
    );
  }

  lines.push("");
  lines.push("## Weekly Reuse");
  lines.push("week_start\treused_profiles\treuse_events");
  if (summary.weekly_reused_profiles.length === 0) {
    lines.push("(none)\t0\t0");
  } else {
    for (const bucket of summary.weekly_reused_profiles) {
      lines.push([bucket.week_start, bucket.reused_profiles, bucket.reuse_events].join("\t"));
    }
  }

  lines.push("");
  lines.push("## Top Profiles");
  lines.push("profile\treuse_events\tprofile_apply_events\tbootstrap_events\tprofile_sync_events");
  if (summary.top_profiles.length === 0) {
    lines.push("(none)\t0\t0\t0\t0");
  } else {
    for (const profile of summary.top_profiles) {
      lines.push(
        [
          profile.profile,
          profile.reuse_events,
          profile.profile_apply_events,
          profile.bootstrap_events,
          profile.profile_sync_events,
        ].join("\t"),
      );
    }
  }

  lines.push("");
  lines.push("## Recent Failures");
  if (summary.recent_failures.length === 0) {
    lines.push("- None");
  } else {
    for (const failure of summary.recent_failures) {
      lines.push(`- ${failure.timestamp} ${failure.event} ${failure.profile}: ${failure.message}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}`;
}
