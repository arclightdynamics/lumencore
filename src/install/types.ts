export type ConfigFormat = 'json' | 'toml' | 'yaml' | 'continue-block';

export type ClientScope = 'global' | 'project';

export interface ServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface InstallContext {
  /** Absolute path to the directory `lumencore install` was run in. */
  projectDir: string;
  platform: NodeJS.Platform;
  home: string;
}

/** A single place a client can be configured (one scope = one config file). */
export interface ScopeTarget {
  scope: ClientScope;
  /** Human-readable description shown in the picker / summary. */
  label: string;
  /** Absolute path to the config file (may not exist yet). */
  file: string;
  format: ConfigFormat;
  /** Keys from the file root down to the servers map (created if missing). */
  nestPath: string[];
  /** Whether stdio entries must carry an explicit "type":"stdio". */
  needsType: boolean;
}

export interface McpClient {
  id: string;
  name: string;
  /** Paths whose existence means the client is installed. */
  detectPaths: (ctx: InstallContext) => string[];
  /** Config targets (scopes), in recommended order (targets[0] = default). */
  targets: (ctx: InstallContext) => ScopeTarget[];
  /** Optional caveat surfaced to the user. */
  note?: string;
}

/** A client we can detect but cannot safely auto-configure (yet). */
export interface ManualClient {
  id: string;
  name: string;
  detectPaths: (ctx: InstallContext) => string[];
  reason: string;
}
