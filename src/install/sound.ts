// Optional, best-effort installer audio. Never throws and stays silent wherever
// no audio device is reachable (CI, SSH, headless, NO_SOUND). It synthesizes a
// short WAV in a temp file (no bundled asset) and plays it through whichever
// system player exists — paplay/ffplay/aplay (Linux & WSLg), afplay (macOS),
// or PowerShell's SoundPlayer (Windows).
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

type Note = [freqHz: number, durMs: number];

// A little ascending "power-up" arpeggio for startup.
const JINGLE: Note[] = [
  [523, 120], [659, 120], [784, 130], [1047, 200], [784, 100], [1047, 320],
];
// A short two-note flourish for completion.
const SUCCESS: Note[] = [[784, 110], [1175, 260]];

const RATE = 44100;

function silent(): boolean {
  return !!process.env.NO_SOUND || !!process.env.CI || !process.stdout.isTTY;
}

/** Render a sequence of tones to a 16-bit mono PCM WAV buffer. */
function renderWav(notes: Note[]): Buffer {
  const data: number[] = [];
  for (const [freq, ms] of notes) {
    const n = Math.floor((RATE * ms) / 1000);
    const attack = RATE * 0.008;
    const release = RATE * 0.04;
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / attack) * Math.min(1, (n - i) / release);
      data.push(Math.sin((2 * Math.PI * freq * i) / RATE) * env * 0.3);
    }
  }
  const buf = Buffer.alloc(44 + data.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + data.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(data.length * 2, 40);
  let off = 44;
  for (const s of data) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), off);
    off += 2;
  }
  return buf;
}

function onPath(cmd: string): boolean {
  try {
    return spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

/** Pick a (command, args) pair that can play `file`, or null if none exist. */
function playerFor(file: string): [string, string[]] | null {
  if (process.platform === 'win32') {
    return ['powershell', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${file}').PlaySync()`]];
  }
  const candidates: Array<[string, string[]]> = [
    ['paplay', [file]],
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', file]],
    ['aplay', ['-q', file]],
    ['afplay', [file]],
  ];
  for (const [cmd, args] of candidates) if (onPath(cmd)) return [cmd, args];
  return null;
}

function play(notes: Note[], tag: string): void {
  if (silent()) return;
  try {
    const file = path.join(os.tmpdir(), `lumencore-${tag}.wav`);
    fs.writeFileSync(file, renderWav(notes));
    const player = playerFor(file);
    if (!player) return; // no audio player available — stay silent
    const p = spawn(player[0], player[1], { stdio: 'ignore', detached: true });
    p.on('error', () => {});
    p.unref();
  } catch {
    /* no audio device / no temp dir — stay silent */
  }
}

/** Startup jingle for the installer. */
export function playJingle(): void {
  play(JINGLE, 'jingle');
}

/** Completion flourish for the installer. */
export function playSuccess(): void {
  play(SUCCESS, 'success');
}
