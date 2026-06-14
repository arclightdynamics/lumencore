# Optional integrations (out of core)

These are **optional, third-party agent integrations** — not part of the LumenCore
core build (`tsc` only compiles `src/`). They live here so the work is preserved
and versioned, but they are intentionally excluded from the core CLI/installer.

- **`hermes-agent/lumencore/`** — a memory-provider plugin for the Nous
  [Hermes Agent](https://github.com/NousResearch/hermes-agent). Connects Hermes to
  a networked LumenCore (`lumencore serve-http`) as its memory backend. Install by
  copying into Hermes's `plugins/memory/lumencore/` and setting
  `memory.provider: lumencore`. See its own README.

> Note: the general networked memory API (`lumencore serve-http`) **is** part of
> core — it's reusable by any client. Only the per-agent glue lives here.
