# LumenCore memory provider (Hermes Agent)

Makes a networked [LumenCore](https://github.com/arclightdynamics/lumencore) the
memory backend for Hermes Agent — local-first SQLite memory served over
HTTP/Tailscale, shared across sessions and machines.

## 1. Run the LumenCore brain (once, on a host all agents can reach)

```bash
lumencore serve-http --host <tailnet-ip> --port 4318 --token <secret>
```

## 2. Install this plugin

Copy this directory to `plugins/memory/lumencore/` in your Hermes Agent install,
then enable it:

```bash
hermes plugins enable lumencore     # or: set memory.provider: lumencore
```

## 3. Configure

Env vars, or `$HERMES_HOME/lumencore.json`:

| Key | Env | Required | Default |
|-----|-----|----------|---------|
| url | `LUMENCORE_URL` | yes | — |
| token | `LUMENCORE_TOKEN` | recommended | — |
| project | `LUMENCORE_PROJECT` | no | `hermes` |

```json
{ "url": "http://sentinel:4318", "token": "secret", "project": "sentinel-coder" }
```

## Tools

- **`lumencore_recall`** — semantic-ish FTS search over the project's memory.
- **`lumencore_remember`** — store a decision / pattern / concept / note / task.

Recent context is also prefetched before each turn. Memory is **deliberate** —
nothing is auto-captured per turn; the agent stores what matters.
