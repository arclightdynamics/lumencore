import fs from 'fs';
import path from 'path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import YAML from 'yaml';
/**
 * Strip // line and block comments from JSONC, ignoring those inside strings,
 * and drop trailing commas — enough to JSON.parse a VS Code / Zed settings file.
 */
export function stripJsonComments(input) {
    let out = '';
    let inString = false;
    let inLine = false;
    let inBlock = false;
    let escaped = false;
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        const next = input[i + 1];
        if (inLine) {
            if (ch === '\n') {
                inLine = false;
                out += ch;
            }
            continue;
        }
        if (inBlock) {
            if (ch === '*' && next === '/') {
                inBlock = false;
                i++;
            }
            continue;
        }
        if (inString) {
            out += ch;
            if (escaped)
                escaped = false;
            else if (ch === '\\')
                escaped = true;
            else if (ch === '"')
                inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            out += ch;
            continue;
        }
        if (ch === '/' && next === '/') {
            inLine = true;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlock = true;
            i++;
            continue;
        }
        out += ch;
    }
    return out.replace(/,(\s*[}\]])/g, '$1');
}
function readMaybe(file) {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}
/** Write `text` to `file`, backing up any existing file first. */
function commit(file, text, prev, dryRun) {
    const created = prev === null;
    if (prev !== null && prev.trim() === text.trim()) {
        return { file, created: false, backedUp: null, alreadyPresent: true };
    }
    if (dryRun) {
        return { file, created, backedUp: null, alreadyPresent: false };
    }
    let backedUp = null;
    if (prev !== null) {
        backedUp = `${file}.lumencore.bak`;
        fs.copyFileSync(file, backedUp);
    }
    else {
        fs.mkdirSync(path.dirname(file), { recursive: true });
    }
    fs.writeFileSync(file, text, 'utf-8');
    return { file, created, backedUp, alreadyPresent: false };
}
function parseRoot(prev, parser) {
    if (prev === null || prev.trim() === '')
        return {};
    return parser(prev) ?? {};
}
/** Walk (creating) an object path; returns the leaf map. */
function descend(root, nestPath) {
    let node = root;
    for (const key of nestPath) {
        const child = node[key];
        if (typeof child !== 'object' || child === null || Array.isArray(child)) {
            node[key] = {};
        }
        node = node[key];
    }
    return node;
}
function envOrUndefined(entry) {
    return entry.env && Object.keys(entry.env).length > 0 ? entry.env : undefined;
}
function writeJson(target, name, entry, dryRun) {
    const prev = readMaybe(target.file);
    let root;
    try {
        root = parseRoot(prev, (s) => {
            try {
                return JSON.parse(s);
            }
            catch {
                return JSON.parse(stripJsonComments(s));
            }
        });
    }
    catch {
        throw new Error('existing config is not valid JSON');
    }
    const value = {};
    if (target.needsType)
        value.type = 'stdio';
    value.command = entry.command;
    value.args = entry.args;
    const env = envOrUndefined(entry);
    if (env)
        value.env = env;
    descend(root, target.nestPath)[name] = value;
    return commit(target.file, `${JSON.stringify(root, null, 2)}\n`, prev, dryRun);
}
function writeTomlServer(target, name, entry, dryRun) {
    const prev = readMaybe(target.file);
    let root;
    try {
        root = parseRoot(prev, (s) => parseToml(s));
    }
    catch {
        throw new Error('existing config is not valid TOML');
    }
    const value = { command: entry.command, args: entry.args };
    const env = envOrUndefined(entry);
    if (env)
        value.env = env;
    descend(root, target.nestPath)[name] = value;
    return commit(target.file, `${stringifyToml(root)}\n`, prev, dryRun);
}
function writeYamlServer(target, name, entry, dryRun) {
    const prev = readMaybe(target.file);
    let root;
    try {
        root = parseRoot(prev, (s) => YAML.parse(s));
    }
    catch {
        throw new Error('existing config is not valid YAML');
    }
    // Goose extension shape: note `cmd` (not command) and env_keys.
    descend(root, target.nestPath)[name] = {
        type: 'stdio',
        cmd: entry.command,
        args: entry.args,
        enabled: true,
        env_keys: [],
    };
    return commit(target.file, YAML.stringify(root), prev, dryRun);
}
function writeContinueBlock(target, name, entry, dryRun) {
    const prev = readMaybe(target.file);
    // A standalone Continue block file — we own it, so we write it wholesale.
    const block = {
        name: 'LumenCore',
        version: '0.0.1',
        schema: 'v1',
        mcpServers: [
            { name, type: 'stdio', command: entry.command, args: entry.args },
        ],
    };
    return commit(target.file, YAML.stringify(block), prev, dryRun);
}
/** Merge the lumencore server into a client config, dispatching by format. */
export function writeServer(target, name, entry, opts) {
    switch (target.format) {
        case 'json':
            return writeJson(target, name, entry, opts.dryRun);
        case 'toml':
            return writeTomlServer(target, name, entry, opts.dryRun);
        case 'yaml':
            return writeYamlServer(target, name, entry, opts.dryRun);
        case 'continue-block':
            return writeContinueBlock(target, name, entry, opts.dryRun);
    }
}
//# sourceMappingURL=writer.js.map