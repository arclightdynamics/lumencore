// Animated, ashfall-style installer TUI for LumenCore.
// Truecolor ANSI: a flowing cyan "lumen" wave background, drifting sparks, the
// LumenCore wordmark (white LUMEN → cyan CORE) with a moving sheen, an in-frame
// client selector, and animated writing. Falls back to plain output on any error.
const ESC = '\x1b[';
const HIDE = ESC + '?25l';
const SHOW = ESC + '?25h';
const ALT_ON = ESC + '?1049h';
const ALT_OFF = ESC + '?1049l';
const RESET = ESC + '0m';
const HOME = ESC + 'H';
const CLEAR = ESC + '2J';
const fg = (r, g, b) => `${ESC}38;2;${r};${g};${b}m`;
// HSL → RGB (h,l,s in 0..1)
function hls(h, l, s) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (((h % 1) + 1) % 1) * 6;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) {
        r = c;
        g = x;
    }
    else if (hp < 2) {
        r = x;
        g = c;
    }
    else if (hp < 3) {
        g = c;
        b = x;
    }
    else if (hp < 4) {
        g = x;
        b = c;
    }
    else if (hp < 5) {
        r = x;
        b = c;
    }
    else {
        r = c;
        b = x;
    }
    const m = l - c / 2;
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const WAVE = ' .·\'":;~-=+*';
// LUMEN (lines 0-5) / CORE (lines 6-11) block wordmark.
const WORDMARK = [
    '  ██╗     ██╗   ██╗███╗   ███╗███████╗███╗   ██╗',
    '  ██║     ██║   ██║████╗ ████║██╔════╝████╗  ██║',
    '  ██║     ██║   ██║██╔████╔██║█████╗  ██╔██╗ ██║',
    '  ██║     ██║   ██║██║╚██╔╝██║██╔══╝  ██║╚██╗██║',
    '  ███████╗╚██████╔╝██║ ╚═╝ ██║███████╗██║ ╚████║',
    '  ╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝',
    '        ██████╗ ██████╗ ██████╗ ███████╗',
    '       ██╔════╝██╔═══██╗██╔══██╗██╔════╝',
    '       ██║     ██║   ██║██████╔╝█████╗',
    '       ██║     ██║   ██║██╔══██╗██╔══╝',
    '       ╚██████╗╚██████╔╝██║  ██║███████╗',
    '        ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝',
];
const WM_W = Math.max(...WORDMARK.map((l) => l.length));
// The "core" emblem — a ringed lens with a central starburst, echoing the logo.
const EMBLEM = [
    '  .-=====-.  ',
    '  :  \\|/  :  ',
    '  : -(✦)- :  ',
    '  :  /|\\  :  ',
    "  '-=====-'  ",
];
const EM_W = Math.max(...EMBLEM.map((l) => l.length));
// The two-step wizard's first question: how memory is shared across projects.
const SCOPE_CHOICES = [
    { value: 'project-only', title: 'Per-project — each repo keeps its own memory (default)', hint: 'Isolated. Opt a project in later with "lumencore init --allow-global".' },
    { value: 'project-and-global', title: 'Share globally — learnings from one project help the others', hint: 'A shared store new projects can leverage from what you found elsewhere.' },
];
/**
 * Run the animated installer. `items` are the candidate (client, host) actions;
 * `write(i)` performs the real write for item i and returns a summary line.
 * When `opts.askScope` is set, a memory-scope step precedes client selection.
 */
export function animatedInstall(items, opts, write) {
    return new Promise((resolve) => {
        const out = process.stdout;
        const sel = items.map(() => true);
        let cur = 0;
        let scopeSel = 0;
        let phase = opts.askScope ? 'scope' : 'select';
        let order = [];
        let writePtr = 0;
        let lastWrite = 0;
        let doneAt = 0;
        const summary = [];
        let cancelled = false;
        let t = 0;
        let timer = null;
        const cols = () => out.columns || 80;
        const rows = () => out.rows || 24;
        const stdin = process.stdin;
        function cleanup() {
            if (timer)
                clearInterval(timer);
            try {
                stdin.setRawMode(false);
            }
            catch { /* */ }
            stdin.pause();
            stdin.removeListener('data', onKey);
            out.write(RESET + SHOW + ALT_OFF);
        }
        function finish() {
            cleanup();
            const scope = opts.askScope ? SCOPE_CHOICES[scopeSel].value : null;
            resolve({ cancelled, summary, scope });
        }
        function onKey(d) {
            const s = d.toString();
            if (s === '\x03' || s === 'q' || s === 'Q' || s === '\x1b') {
                cancelled = phase === 'scope' || phase === 'select';
                return finish();
            }
            if (phase === 'scope') {
                const m = SCOPE_CHOICES.length;
                if (s === '\x1b[A' || s === 'k')
                    scopeSel = (scopeSel - 1 + m) % m;
                else if (s === '\x1b[B' || s === 'j')
                    scopeSel = (scopeSel + 1) % m;
                else if (s === '\r' || s === '\n')
                    phase = 'select';
                return;
            }
            if (phase !== 'select')
                return;
            const n = items.length;
            if (s === '\x1b[A' || s === 'k')
                cur = (cur - 1 + n) % n;
            else if (s === '\x1b[B' || s === 'j')
                cur = (cur + 1) % n;
            else if (s === ' ')
                sel[cur] = !sel[cur];
            else if (s === 'a' || s === 'A') {
                const all = sel.every(Boolean);
                sel.fill(!all);
            }
            else if (s === '\r' || s === '\n') {
                order = items.map((_, i) => i).filter((i) => sel[i]);
                if (order.length === 0)
                    return;
                phase = 'install';
                writePtr = 0;
                lastWrite = Date.now();
            }
        }
        // ── overlay builders ─────────────────────────────────────────────
        function place(map, y, x, ch, color) {
            if (y >= 1 && y <= rows() && x >= 1 && x <= cols())
                map.set(`${y},${x}`, { ch, color });
        }
        function text(map, y, x, str, color) {
            for (let i = 0; i < str.length; i++)
                place(map, y, x + i, str[i], color);
        }
        function buildOverlay() {
            const map = new Map();
            const C = cols();
            // Lay out the emblem + wordmark as one centered unit (emblem to the left).
            const unitW = EM_W + 4 + WM_W;
            const startX = Math.max(1, Math.floor((C - unitW) / 2));
            const wmX = startX + EM_W + 4;
            const wmY = 2;
            // Core emblem, vertically centered against the wordmark, with a pulsing star.
            const emX = startX;
            const emY = wmY + Math.floor((WORDMARK.length - EMBLEM.length) / 2);
            const pulse = 0.55 + 0.45 * Math.sin(t * 2.2);
            for (let r = 0; r < EMBLEM.length; r++) {
                const line = EMBLEM[r];
                for (let x = 0; x < line.length; x++) {
                    const ch = line[x];
                    if (ch === ' ')
                        continue;
                    let col;
                    if (ch === '✦') {
                        const v = Math.round(150 + pulse * 105);
                        col = fg(v, Math.min(255, v + 30), 255); // bright cyan-white core
                    }
                    else if (ch === '|' || ch === '-' || ch === '/' || ch === '\\') {
                        col = fg(90, 200, 235); // cyan starburst rays
                    }
                    else if (ch === '(' || ch === ')') {
                        col = fg(70, 170, 210); // iris
                    }
                    else {
                        const [rr, gg, bb] = hls(0.55, 0.45 + pulse * 0.12, 0.65); // chrome-cyan ring
                        col = fg(rr, gg, bb);
                    }
                    place(map, emY + r, emX + x, ch, col);
                }
            }
            const sheen = ((t * 14) % (WM_W + 24)) - 12; // sweeping bright band
            for (let r = 0; r < WORDMARK.length; r++) {
                const line = WORDMARK[r];
                const isCore = r >= 6;
                for (let x = 0; x < line.length; x++) {
                    const ch = line[x];
                    if (ch === ' ')
                        continue;
                    const near = Math.max(0, 1 - Math.abs(x - sheen) / 6);
                    let col;
                    if (isCore) {
                        const [rr, gg, bb] = hls(0.54, 0.55 + near * 0.35, 0.85); // cyan
                        col = fg(rr, gg, bb);
                    }
                    else {
                        const v = Math.round(190 + near * 65); // white
                        col = fg(v, v, Math.min(255, v + 10));
                    }
                    place(map, wmY + r, wmX + x, ch, col);
                }
            }
            const tagY = wmY + WORDMARK.length + 1;
            const tag = opts.dryRun ? 'persistent memory for your agents · (dry run)' : 'persistent memory for your agents';
            text(map, tagY, Math.max(1, Math.floor((C - tag.length) / 2)), tag, fg(120, 170, 200));
            // panel
            const panelY = tagY + 2;
            if (phase === 'scope') {
                const title = 'Step 1 of 2 — Share memory across your projects?  ·  ↑↓ move · ↵ next · q quit';
                text(map, panelY, Math.max(2, Math.floor((C - title.length) / 2)), title, fg(150, 190, 215));
                const listX = Math.max(4, Math.floor((C - 64) / 2));
                SCOPE_CHOICES.forEach((ch, i) => {
                    const y = panelY + 2 + i * 2;
                    const box = i === scopeSel ? '◉' : '○';
                    const arrow = i === scopeSel ? '▸' : ' ';
                    const c = i === scopeSel ? fg(180, 240, 255) : fg(110, 150, 175);
                    text(map, y, listX, `${arrow} ${box}  ${ch.title}`, c);
                    text(map, y + 1, listX + 5, ch.hint, fg(90, 120, 140));
                });
            }
            else if (phase === 'select') {
                const step = opts.askScope ? 'Step 2 of 2 — ' : '';
                const title = `${step}Select clients to connect  ·  ↑↓ move · space toggle · a all · ↵ install · q quit`;
                text(map, panelY, Math.max(2, Math.floor((C - title.length) / 2)), title, fg(150, 190, 215));
                const listX = Math.max(4, Math.floor((C - 50) / 2));
                items.forEach((it, i) => {
                    const y = panelY + 2 + i;
                    const box = sel[i] ? '◉' : '○';
                    const arrow = i === cur ? '▸' : ' ';
                    const c = i === cur ? fg(180, 240, 255) : sel[i] ? fg(120, 210, 235) : fg(90, 120, 140);
                    text(map, y, listX, `${arrow} ${box}  ${it.label}`, c);
                });
            }
            else {
                order.forEach((idx, k) => {
                    const y = panelY + 2 + k;
                    const done = k < writePtr;
                    const active = k === writePtr && phase === 'install';
                    const mark = done ? '✓' : active ? '▸' : '·';
                    const c = done ? fg(80, 220, 140) : active ? fg(180, 240, 255) : fg(90, 120, 140);
                    const listX = Math.max(4, Math.floor((cols() - 50) / 2));
                    text(map, y, listX, `${mark}  ${items[idx].label}`, c);
                });
                if (phase === 'done') {
                    const msg = opts.dryRun ? '✓ dry run complete' : '✓ connected — restart your clients to load LumenCore';
                    text(map, panelY + 3 + order.length, Math.max(2, Math.floor((cols() - msg.length) / 2)), msg, fg(80, 220, 140));
                }
            }
            return map;
        }
        // ── frame ────────────────────────────────────────────────────────
        function render() {
            const C = cols(), R = rows();
            const overlay = buildOverlay();
            let buf = HOME;
            let lastColor = '';
            for (let y = 1; y <= R; y++) {
                buf += `${ESC}${y};1H`;
                for (let x = 1; x <= C; x++) {
                    const o = overlay.get(`${y},${x}`);
                    if (o) {
                        if (o.color !== lastColor) {
                            buf += o.color;
                            lastColor = o.color;
                        }
                        buf += o.ch;
                        continue;
                    }
                    // cyan lumen wave
                    const v = Math.sin(x * 0.08 + t * 0.6) + Math.sin(y * 0.2 - t * 0.4) + Math.sin((x + y) * 0.05 + t * 0.25);
                    const n = Math.max(0, Math.min(1, (v + 3) / 6));
                    const ch = WAVE[Math.floor(n * (WAVE.length - 1))];
                    const [r, g, b] = hls(0.55, 0.05 + n * 0.16, 0.5 + n * 0.3);
                    const color = fg(r, g, b);
                    if (color !== lastColor) {
                        buf += color;
                        lastColor = color;
                    }
                    buf += ch;
                }
            }
            buf += RESET;
            out.write(buf);
        }
        // ── loop ───────────────────────────────────────────────────────
        out.write(ALT_ON + HIDE + CLEAR);
        try {
            stdin.setRawMode(true);
        }
        catch { /* */ }
        stdin.resume();
        stdin.on('data', onKey);
        timer = setInterval(() => {
            t += 0.05;
            if (phase === 'install') {
                if (Date.now() - lastWrite > 200) {
                    if (writePtr < order.length) {
                        try {
                            summary.push(write(order[writePtr]));
                        }
                        catch (e) {
                            summary.push(`  ✗  ${items[order[writePtr]].label}: ${e.message}`);
                        }
                        writePtr++;
                        lastWrite = Date.now();
                    }
                    else {
                        phase = 'done';
                        doneAt = Date.now();
                    }
                }
            }
            else if (phase === 'done' && Date.now() - doneAt > 1400) {
                return finish();
            }
            render();
        }, 55);
    });
}
//# sourceMappingURL=splash.js.map