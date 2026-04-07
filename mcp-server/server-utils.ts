/**
 * Extracted utility functions and constants from server.ts for testability.
 * All pure functions and constant data structures live here.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import abcjs from "abcjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Gakki preset UUIDs by GM instrument name (lowercase, underscores). Loaded from gakki-instruments.json. */
export let gakkiByGmName: Record<string, string> = {};
try {
  const gakkiPath = join(__dirname, "..", "gakki-instruments.json");
  const data = JSON.parse(readFileSync(gakkiPath, "utf-8"));
  gakkiByGmName = data.by_gm_name ?? {};
} catch {
  // Fallback if file missing; Gakki will use default preset
}

export const VALID_ENTITY_TYPES = [
  "audioDevice", "audioMerger", "audioSplitter", "autoFilter", "bandSplitter",
  "bassline", "beatbox8", "beatbox9", "centroid", "crossfader", "curve", "exciter",
  "gakki", "graphicalEQ", "gravity", "heisenberg", "helmholtz", "kobolt", "machiniste",
  "matrixArpeggiator", "minimixer", "noteSplitter", "panorama", "pulsar", "pulverisateur",
  "quantum", "quasar", "rasselbock", "ringModulator", "space", "stereoEnhancer",
  "stompboxChorus", "stompboxCompressor", "stompboxCrusher", "stompboxDelay",
  "stompboxFlanger", "stompboxGate", "stompboxParametricEqualizer", "stompboxPhaser",
  "stompboxPitchDelay", "stompboxReverb", "stompboxSlope", "stompboxStereoDetune",
  "stompboxTube", "tinyGain", "tonematrix", "waveshaper", "notetrack",
  "mixerChannel", "mixerMaster", "mixerGroup", "mixerAux", "mixerReverbAux", "mixerDelayAux"
] as const;

export const ENTITY_TYPE_ALIASES: Record<string, string> = {
  machinedrum: "machiniste",
  "drum machine": "machiniste",
  drummachine: "machiniste",
  "808": "beatbox8",
  "909": "beatbox9",
  chorus: "stompboxChorus",
  compressor: "stompboxCompressor",
  crusher: "stompboxCrusher",
  delay: "stompboxDelay",
  flanger: "stompboxFlanger",
  gate: "stompboxGate",
  eq: "graphicalEQ",
  phaser: "stompboxPhaser",
  "pitch delay": "stompboxPitchDelay",
  reverb: "stompboxReverb",
  slope: "stompboxSlope",
  detune: "stompboxStereoDetune",
  tube: "stompboxTube",
  sampler: "space",
  modular: "pulverisateur",
  "fm synth": "pulsar"
};

/** Instruments that can play note tracks (NoteTrackPlayer). Used for add-abc-track. */
export const NOTE_TRACK_INSTRUMENTS = [
  "heisenberg", "bassline", "space", "gakki", "pulverisateur",
  "tonematrix", "machiniste", "matrixArpeggiator", "pulsar",
  "kobolt", "beatbox8", "beatbox9", "centroid", "rasselbock"
] as const;

export const INSTRUMENT_ALIASES: Record<string, string> = {
  synth: "heisenberg",
  "poly synth": "heisenberg",
  pad: "heisenberg",
  lead: "heisenberg",
  bass: "bassline",
  "bass synth": "bassline",
  acid: "bassline",
  sampler: "space",
  rompler: "space",
  strings: "gakki",
  "string synth": "gakki",
  drums: "machiniste",
  "drum machine": "machiniste",
  sequencer: "tonematrix",
  "step sequencer": "tonematrix",
  arpeggiator: "matrixArpeggiator",
  matrix: "matrixArpeggiator",
  // Gakki has French horn and other orchestral sounds
  "french horn": "gakki",
  horn: "gakki",
  trumpet: "gakki",
  trombone: "gakki",
  brass: "gakki",
  woodwind: "heisenberg",
  flute: "heisenberg",
  oboe: "heisenberg",
  "808": "beatbox8",
  "909": "beatbox9",
  modular: "pulverisateur",
  fm: "pulsar"
};

/** Audiotool ticks: 1 whole note = 15360, 1 quarter = 3840 */
export const TICKS_WHOLE = 15360;
export const TICKS_QUARTER = 3840;

/**
 * LLMs often flatten ABC headers onto one line with spaces (e.g. `X:1 T:Title M:4/4`)
 * instead of newline-separated lines. abcjs may then yield no notes.
 * Inserts newlines before standard single-letter ABC information fields.
 */
export function normalizeAbcNotation(input: string): string {
  let s = input.trim();
  if (!s) return s;
  // Single-line headers: "X:1 T:Title M:4/4 K:G" -> one field per line
  s = s.replace(/\s+([A-Z]:)/g, "\n$1");
  // Body often stuck on same line as K: "K:G |:CDEF|..." — abcjs needs the tune body on a new line
  s = s.replace(/(K:[^\n]*?)\s+(\|:)/g, "$1\n$2");
  // Second repeat / section: "| |:g2" -> newline before the next |:
  s = s.replace(/\|\s+(\|:)/g, "|\n$1");
  return s;
}

/**
 * Parse ABC notation and extract notes using abcjs.
 * Returns { pitch, positionTicks, durationTicks, velocity }.
 */
export function parseAbcToNotes(abcString: string): Array<{ pitch: number; positionTicks: number; durationTicks: number; velocity: number }> {
  const notes: Array<{ pitch: number; positionTicks: number; durationTicks: number; velocity: number }> = [];
  try {
    const normalized = normalizeAbcNotation(abcString);
    const tuneObjs = abcjs.parseOnly(normalized.trim());
    if (!tuneObjs || tuneObjs.length < 1) {
      throw new Error("No tune found in ABC notation");
    }
    const tuneObj = tuneObjs[0] as { setUpAudio?: (opts?: object) => { tracks?: Array<Array<{ cmd?: string; pitch?: number; start?: number; duration?: number; volume?: number }>> } };
    const audio = tuneObj?.setUpAudio?.({});
    if (!audio?.tracks) {
      throw new Error("Could not extract sequence from ABC");
    }
    for (const track of audio.tracks) {
      if (!Array.isArray(track)) continue;
      for (const ev of track) {
        if (ev.cmd === "note" && ev.pitch != null) {
          const start = ev.start ?? 0;
          const duration = ev.duration ?? 0.25;
          const positionTicks = Math.round(start * TICKS_WHOLE);
          const durationTicks = Math.max(TICKS_QUARTER / 4, Math.round(duration * TICKS_WHOLE));
          const velocity = ev.volume != null ? Math.min(1, Math.max(0, ev.volume / 127)) : 0.7;
          notes.push({
            pitch: Math.max(0, Math.min(127, ev.pitch)),
            positionTicks,
            durationTicks,
            velocity,
          });
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ABC notation: ${msg}`);
  }
  return notes.sort((a, b) => a.positionTicks - b.positionTicks);
}

export function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Resolve a user-supplied entity type to a valid one via:
 * 1. exact match, 2. case-insensitive match, 3. Levenshtein fuzzy match (max distance 3).
 */
export function resolveEntityType(input: string): string | null {
  const trimmed = input.trim();
  if (VALID_ENTITY_TYPES.includes(trimmed as any)) return trimmed;

  const lower = trimmed.toLowerCase();

  if (ENTITY_TYPE_ALIASES[lower]) return ENTITY_TYPE_ALIASES[lower];

  const ciMatch = VALID_ENTITY_TYPES.find((t) => t.toLowerCase() === lower);
  if (ciMatch) return ciMatch;

  let best: string | null = null;
  let bestDist = Infinity;
  for (const t of VALID_ENTITY_TYPES) {
    const d = levenshtein(lower, t.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return bestDist <= 3 ? best : null;
}

/**
 * Resolve user-supplied instrument name to a valid NoteTrackPlayer type.
 */
export function resolveInstrumentType(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (NOTE_TRACK_INSTRUMENTS.includes(trimmed as any)) return trimmed;
  if (INSTRUMENT_ALIASES[trimmed]) return INSTRUMENT_ALIASES[trimmed];
  const ciMatch = NOTE_TRACK_INSTRUMENTS.find((t) => t.toLowerCase() === trimmed);
  if (ciMatch) return ciMatch;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const t of NOTE_TRACK_INSTRUMENTS) {
    const d = levenshtein(trimmed, t.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return bestDist <= 3 ? best : null;
}

/** Short names / LLM outputs → keys in gakki-instruments.json by_gm_name */
export const GAKKI_NAME_SYNONYMS: Record<string, string> = {
  horn: "french_horn",
  brass: "brass_section",
  strings: "string_ensemble_1",
  string: "string_ensemble_1",
  orchestral: "string_ensemble_1",
  symphonic: "string_ensemble_1",
  piano: "acoustic_grand_piano",
  grand_piano: "acoustic_grand_piano",
  acoustic_piano: "acoustic_grand_piano",
  electric_piano: "electric_piano_1",
};

/**
 * Resolve an instrument name to a Gakki preset UUID.
 */
export function resolveGakkiPresetUuid(instrumentName: string): string | undefined {
  const key = instrumentName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "");
  const direct = gakkiByGmName[key];
  if (direct) return direct;
  const syn = GAKKI_NAME_SYNONYMS[key];
  return syn ? gakkiByGmName[syn] : undefined;
}

/** Match user/ABC text to GM keys (order: multi-word phrases before single words). */
export const GAKKI_TEXT_PATTERNS: ReadonlyArray<{ pattern: RegExp; gmKey: string }> = [
  { pattern: /\bfrench\s+horn\b/i, gmKey: "french_horn" },
  { pattern: /\benglish\s+horn\b/i, gmKey: "english_horn" },
  { pattern: /\bmuted\s+trumpet\b/i, gmKey: "muted_trumpet" },
  { pattern: /\bbrass\s+section\b/i, gmKey: "brass_section" },
  { pattern: /\bstring\s+ensemble\s*2\b/i, gmKey: "string_ensemble_2" },
  { pattern: /\bstring\s+ensemble\s*1\b/i, gmKey: "string_ensemble_1" },
  { pattern: /\bacoustic\s+piano\b/i, gmKey: "acoustic_grand_piano" },
  { pattern: /\belectric\s+piano\b/i, gmKey: "electric_piano_1" },
  { pattern: /\bgrand\s+piano\b/i, gmKey: "acoustic_grand_piano" },
  { pattern: /\btrumpet\b/i, gmKey: "trumpet" },
  { pattern: /\btrombone\b/i, gmKey: "trombone" },
  { pattern: /\btuba\b/i, gmKey: "tuba" },
  { pattern: /\bviolin\b/i, gmKey: "violin" },
  { pattern: /\bviola\b/i, gmKey: "viola" },
  { pattern: /\bcello\b/i, gmKey: "cello" },
  { pattern: /\bcontrabass\b/i, gmKey: "contrabass" },
  { pattern: /\bflute\b/i, gmKey: "flute" },
  { pattern: /\bpiccolo\b/i, gmKey: "piccolo" },
  { pattern: /\boboe\b/i, gmKey: "oboe" },
  { pattern: /\bclarinet\b/i, gmKey: "clarinet" },
  { pattern: /\bbassoon\b/i, gmKey: "bassoon" },
  { pattern: /\bhorn\b/i, gmKey: "french_horn" },
  { pattern: /\bbrass\b/i, gmKey: "brass_section" },
  { pattern: /\bstrings\b/i, gmKey: "string_ensemble_1" },
  { pattern: /\bpiano\b/i, gmKey: "acoustic_grand_piano" },
];

export function resolveGakkiPresetUuidFromHints(args: {
  instrument?: string;
  orchestralVoice?: string;
  abcNotation: string;
}): string | undefined {
  for (const s of [args.orchestralVoice, args.instrument]) {
    if (!s?.trim()) continue;
    const u = resolveGakkiPresetUuid(s);
    if (u) return u;
  }
  const haystack = [
    args.abcNotation,
    args.orchestralVoice ?? "",
    args.instrument ?? "",
  ].join("\n");
  for (const { pattern, gmKey } of GAKKI_TEXT_PATTERNS) {
    if (pattern.test(haystack) && gakkiByGmName[gmKey]) {
      return gakkiByGmName[gmKey];
    }
  }
  return undefined;
}

/**
 * Extract the referenced entity ID from a nexus reference field.
 * Reference fields are PrimitiveField<NexusLocation> where .value is
 * a NexusLocation with an entityId property.
 */
export function refId(field: any): string | null {
  if (!field) return null;
  const val = field.value;
  if (val && typeof val === "object" && typeof val.entityId === "string") return val.entityId;
  if (typeof val === "string") return val;
  return null;
}

/** Entity types that produce audio and their output field name. */
export const AUDIO_OUTPUT_FIELD: Record<string, string> = {
  audioDevice: "audioOutput",
  heisenberg: "audioOutput",
  bassline: "audioOutput",
  machiniste: "mainOutput",
  tonematrix: "audioOutput",
  stompboxDelay: "audioOutput",
  space: "audioOutput",
  gakki: "audioOutput",
  pulverisateur: "audioOutput",
  matrixArpeggiator: "audioOutput",
  audioMerger: "audioOutput",
  audioSplitter: "audioOutput1",
  autoFilter: "audioOutput",
  bandSplitter: "highOutput",
  beatbox8: "mainOutput",
  beatbox9: "mainOutput",
  centroid: "audioOutput",
  crossfader: "audioOutput",
  curve: "audioOutput",
  exciter: "audioOutput",
  graphicalEQ: "audioOutput",
  gravity: "audioOutput",
  helmholtz: "audioOutput",
  kobolt: "audioOutput",
  minimixer: "mainOutput",
  panorama: "audioOutput",
  pulsar: "audioOutput",
  quantum: "audioOutput",
  quasar: "audioOutput",
  rasselbock: "audioOutput",
  ringModulator: "audioOutput",
  stereoEnhancer: "audioOutput",
  stompboxChorus: "audioOutput",
  stompboxCompressor: "audioOutput",
  stompboxCrusher: "audioOutput",
  stompboxFlanger: "audioOutput",
  stompboxGate: "audioOutput",
  stompboxParametricEqualizer: "audioOutput",
  stompboxPhaser: "audioOutput",
  stompboxPitchDelay: "audioOutput",
  stompboxReverb: "audioOutput",
  stompboxSlope: "audioOutput",
  stompboxStereoDetune: "audioOutput",
  stompboxTube: "audioOutput",
  tinyGain: "audioOutput",
  waveshaper: "audioOutput"
};

/**
 * Connect an audio device to the stagebox (mixer).
 */
export function connectDeviceToStagebox(t: any, device: any, entityType: string): void {
  const outputFieldName = AUDIO_OUTPUT_FIELD[entityType];
  if (!outputFieldName) return;

  const outputField = (device.fields as any)[outputFieldName];
  if (!outputField?.location) return;

  const stripTypes = ["mixerChannel", "mixerGroup", "mixerAux", "mixerReverbAux", "mixerDelayAux"];
  const existingStrips = stripTypes.flatMap((type) =>
    t.entities.ofTypes(type as any).get()
  );
  const maxOrder = existingStrips.reduce((max: number, s: any) => {
    const dp = (s.fields as any).displayParameters;
    const order = dp?.fields?.orderAmongStrips?.value ?? 0;
    return Math.max(max, order);
  }, -1);
  const nextOrder = maxOrder + 1;

  const deviceDisplayName = (device.fields as any).displayName?.value ?? "";
  const channelLabel = deviceDisplayName || `${entityType} ${nextOrder}`;

  const mixerChannel = t.create("mixerChannel" as any, {});
  if (!mixerChannel) return;

  const displayParams = (mixerChannel.fields as any).displayParameters;
  if (displayParams?.fields) {
    t.update(displayParams.fields.orderAmongStrips, nextOrder);
    t.update(displayParams.fields.displayName, channelLabel);
  }

  const inputLocation = (mixerChannel.fields as any).audioInput?.location;
  if (!inputLocation) return;

  t.create("desktopAudioCable" as any, {
    fromSocket: outputField.location,
    toSocket: inputLocation,
  });
}

/**
 * Set the gain of Heisenberg's Operator A.
 */
export function setHeisenbergOperatorAGain(t: any, heisenberg: any, gain: number): void {
  const operatorA = (heisenberg.fields as any).operatorA;
  const gainField = operatorA?.fields?.gain;
  if (gainField) {
    t.update(gainField, gain);
  }
}

/** Style map for recommend-entity-for-style */
export const STYLE_MAP: Record<string, { entityType: string; reason: string }> = {
  bass: {
    entityType: "bassline",
    reason: "Bass-heavy sound is best served by the bassline monophonic synth.",
  },
  acid: {
    entityType: "bassline",
    reason: "Acid sounds (303-style) map to the bassline synth.",
  },
  sub: {
    entityType: "bassline",
    reason: "Sub-bass frequencies are the domain of the bassline synth.",
  },
  "daft punk": {
    entityType: "bassline",
    reason: "Daft Punk frequently uses monophonic synth bass lines.",
  },
  techno: {
    entityType: "machiniste",
    reason: "Techno is driven by drum machine patterns.",
  },
  drum: {
    entityType: "machiniste",
    reason: "Drum / beat requests map to the machiniste drum machine.",
  },
  beat: {
    entityType: "machiniste",
    reason: "Beat / rhythm requests map to the machiniste drum machine.",
  },
  percussion: {
    entityType: "machiniste",
    reason: "Percussion requests map to the machiniste drum machine.",
  },
  "hip hop": {
    entityType: "machiniste",
    reason: "Hip hop relies on drum machine beats.",
  },
  trap: {
    entityType: "machiniste",
    reason: "Trap is driven by drum machine patterns.",
  },
  pad: {
    entityType: "heisenberg",
    reason: "Pads and atmospheric textures map to the heisenberg polyphonic synth.",
  },
  chord: {
    entityType: "heisenberg",
    reason: "Chords need a polyphonic synth like heisenberg.",
  },
  ambient: {
    entityType: "heisenberg",
    reason: "Ambient / atmospheric sounds map to heisenberg.",
  },
  lead: {
    entityType: "heisenberg",
    reason: "Lead synth melodies map to heisenberg.",
  },
  keys: {
    entityType: "heisenberg",
    reason: "Keyboard / keys parts map to heisenberg.",
  },
  piano: {
    entityType: "heisenberg",
    reason: "Piano-like polyphonic parts map to heisenberg.",
  },
  arpeggio: {
    entityType: "tonematrix",
    reason: "Arpeggios and sequenced patterns map to the tonematrix.",
  },
  loop: {
    entityType: "tonematrix",
    reason: "Melodic loops and generative patterns map to the tonematrix.",
  },
  sequence: {
    entityType: "tonematrix",
    reason: "Step-sequenced patterns map to the tonematrix.",
  },
  delay: {
    entityType: "stompboxDelay",
    reason: "Delay / echo effects map to the stompboxDelay.",
  },
  echo: {
    entityType: "stompboxDelay",
    reason: "Echo effects map to the stompboxDelay.",
  },
  space: {
    entityType: "stompboxDelay",
    reason: "Spacey / spatial effects map to the stompboxDelay.",
  },
  reverb: {
    entityType: "stompboxDelay",
    reason: "Reverb-like spatial effects can be approximated with stompboxDelay.",
  },
};

// ─── ABC export helpers (inverse of parseAbcToNotes) ───────────────────────

const ABC_PITCH_NAMES = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"];

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/** Convert a MIDI pitch (0-127) to an ABC note name (e.g. 60 → "C", 72 → "c", 48 → "C,"). */
export function midiPitchToAbc(pitch: number): string {
  const pitchClass = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  const raw = ABC_PITCH_NAMES[pitchClass];
  const acc = raw.startsWith("^") ? "^" : "";
  const letter = acc ? raw.slice(1) : raw;

  if (octave >= 5) {
    return acc + letter.toLowerCase() + "'".repeat(octave - 5);
  }
  if (octave === 4) {
    return acc + letter;
  }
  return acc + letter + ",".repeat(Math.max(0, 4 - octave));
}

/**
 * Express `ticks` as an ABC duration suffix relative to `unitTicks` (the L: unit).
 * e.g. with L:1/8 (unitTicks = 1920): 3840 ticks → "2", 960 → "/2", 1920 → "".
 */
export function ticksToAbcDuration(ticks: number, unitTicks: number): string {
  if (ticks <= 0) return "";
  const g = gcd(ticks, unitTicks);
  const n = ticks / g;
  const d = unitTicks / g;
  if (d === 1) return n === 1 ? "" : String(n);
  if (n === 1) return `/${d}`;
  return `${n}/${d}`;
}

/**
 * Convert an array of note events (same format as parseAbcToNotes output) back
 * to a valid ABC notation string.  Simultaneous notes become chords, gaps become
 * rests, and bar lines are inserted at measure boundaries.
 */
export function notesToAbc(
  notes: ReadonlyArray<{ pitch: number; positionTicks: number; durationTicks: number; velocity: number }>,
  config?: { tempoBpm?: number; timeSignatureNum?: number; timeSignatureDen?: number },
): string {
  const bpm = config?.tempoBpm ?? 120;
  const tsNum = config?.timeSignatureNum ?? 4;
  const tsDen = config?.timeSignatureDen ?? 4;
  const unitTicks = TICKS_QUARTER / 2; // L:1/8 = 1920 ticks
  const ticksPerBar = (TICKS_WHOLE * tsNum) / tsDen;

  const header = [
    "X:1",
    "T:Exported Track",
    `M:${tsNum}/${tsDen}`,
    "L:1/8",
    `Q:1/4=${Math.round(bpm)}`,
    "K:C",
  ].join("\n");

  if (notes.length === 0) return header + "\n";

  const sorted = [...notes].sort((a, b) => a.positionTicks - b.positionTicks);

  // Group simultaneous notes into chords
  const posMap = new Map<number, Array<{ pitch: number; durationTicks: number }>>();
  for (const n of sorted) {
    const entry = { pitch: n.pitch, durationTicks: n.durationTicks };
    const arr = posMap.get(n.positionTicks);
    if (arr) arr.push(entry);
    else posMap.set(n.positionTicks, [entry]);
  }
  const positions = [...posMap.keys()].sort((a, b) => a - b);

  const tokens: string[] = [];
  let cursor = 0;

  function emitRest(ticks: number): void {
    let remaining = ticks;
    while (remaining > 0) {
      const nextBar = (Math.floor(cursor / ticksPerBar) + 1) * ticksPerBar;
      const chunk = Math.min(remaining, nextBar - cursor);
      tokens.push("z" + ticksToAbcDuration(chunk, unitTicks));
      cursor += chunk;
      remaining -= chunk;
      if (remaining > 0 && cursor % ticksPerBar === 0) {
        tokens.push("|");
      }
    }
  }

  for (const pos of positions) {
    if (pos > cursor) emitRest(pos - cursor);

    if (cursor > 0 && cursor % ticksPerBar === 0) {
      const last = tokens[tokens.length - 1];
      if (last !== "|") tokens.push("|");
    }

    const chord = posMap.get(pos)!;
    const dur = Math.max(...chord.map((c) => c.durationTicks));
    const durStr = ticksToAbcDuration(dur, unitTicks);

    if (chord.length === 1) {
      tokens.push(midiPitchToAbc(chord[0].pitch) + durStr);
    } else {
      tokens.push("[" + chord.map((c) => midiPitchToAbc(c.pitch)).join("") + "]" + durStr);
    }
    cursor = pos + dur;
  }

  tokens.push("|]");
  return header + "\n" + tokens.join(" ") + "\n";
}

export function recommendEntityForStyle(description: string): {
  entityType: string;
  reason: string;
} {
  const lower = description.toLowerCase();
  for (const [keyword, rec] of Object.entries(STYLE_MAP)) {
    if (lower.includes(keyword)) return rec;
  }
  return {
    entityType: "heisenberg",
    reason: "Heisenberg is the most versatile synth and a good default for unrecognised styles.",
  };
}
