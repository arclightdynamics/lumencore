export type MemoryScope = 'project' | 'global';

export type MemoryCategory = 'decision' | 'pattern' | 'concept' | 'note' | 'task';

export interface Memory {
  id: string;
  projectId: string;
  scope: MemoryScope;
  category: MemoryCategory;
  title: string;
  content: string;
  tags: string[];
  importance: number;
  /** Which agent/client wrote this memory (e.g. "claude-code"). */
  source?: string | null;
  /** How sure the writer is, 0..1. Distinct from importance. */
  confidence?: number | null;
  /** This memory replaces the memory with this id. */
  supersedesId?: string | null;
  /** This memory has been replaced by the memory with this id. */
  supersededById?: string | null;
  lastAccessed?: string | null;
  accessCount?: number;
  /** ISO timestamp after which this memory is considered stale. */
  expiresAt?: string | null;
  /** Human-readable project path mirroring the opaque project_id hash. */
  projectPath?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoryInput {
  category: MemoryCategory;
  title: string;
  content: string;
  tags?: string[];
  importance?: number;
  scope?: MemoryScope;
  source?: string;
  confidence?: number;
  expiresAt?: string;
  /** If set, the new memory supersedes this existing memory id. */
  supersedesId?: string;
}

export interface UpdateMemoryInput {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
  importance?: number;
  source?: string;
  confidence?: number;
  expiresAt?: string;
}

export interface SearchOptions {
  query?: string;
  category?: MemoryCategory;
  scope?: MemoryScope;
  limit?: number;
}

export interface ContextOptions {
  categories?: MemoryCategory[];
  maxTokens?: number;
}

export type ConfigMemoryScope = 'project-only' | 'project-and-global';

export interface LumenCoreConfig {
  memoryScope: ConfigMemoryScope;
  dataDir: string;
  defaultImportance: number;
  maxContextTokens: number;
}

export interface ConfigFile {
  version: number;
  config: LumenCoreConfig;
}
