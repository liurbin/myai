export type ProfileScope = "team" | "personal";
export type SourceTool = "claude-code";
export type TargetTool = "codex";
export type SyncStatus = "success" | "partial_success" | "failure";

export interface RepoConfig {
  version: number;
  name: string;
  default_profile_scope: ProfileScope;
  supported_targets: TargetTool[];
}

export interface ProfileAssets {
  prompts: string[];
  preferences: string[];
  mcps: string[];
  skills: string[];
}

export interface ProfileSource {
  tool: SourceTool;
  imported_at: string;
}

export interface ProfileApplyConfig {
  mode: "merge";
  confirm: boolean;
}

export interface ProfileSyncConfig {
  source: SourceTool;
  targets: TargetTool[];
}

export interface Profile {
  version: 1;
  kind: "profile";
  name: string;
  slug: string;
  scope: ProfileScope;
  description?: string;
  tags?: string[];
  source?: ProfileSource;
  assets: ProfileAssets;
  apply: ProfileApplyConfig;
  sync?: ProfileSyncConfig;
}

export interface McpAsset {
  version: 1;
  kind: "mcp";
  name: string;
  transport: "stdio" | "http" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface EventLogEntry {
  timestamp: string;
  event: string;
  profile: string;
  scope: ProfileScope;
  source_tool?: SourceTool;
  target_tool?: TargetTool;
  status: SyncStatus;
  message?: string;
  duration_ms?: number;
  actor_id?: string;
  machine_id?: string;
  repo_name?: string;
  query?: string;
  result_count?: number;
  matched_profiles?: string[];
}

export interface CommandRuntime {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  stdin?: { isTTY?: boolean };
}
