import type { Instrument } from "../audio/instrument";
import type { NumericId } from "../audio/params";
import { PUSH_DEFAULT, decodeMessage, isEncoderPort, parseControlChange, upsertBinding, type Binding } from "./bindings";

const STORE = "grainwash.midi.bindings";
const ENABLED = "grainwash.midi.enabled";
// the app was called Generator before; keep reading its saved settings so nothing is lost
const OLD_STORE = "generator.midi.bindings";
const OLD_ENABLED = "generator.midi.enabled";

export type MidiStatus = "off" | "unsupported" | "denied" | "ready";
export interface MidiState { status: MidiStatus; inputs: string[]; learning: NumericId | null; bindings: Binding[]; lastCc: string }

/** Web MIDI input with MIDI learn. Listens on every input port; encoder ports (Push) default to relative mode. */
export class MidiManager {
  private access: MIDIAccess | null = null;
  private listeners = new Set<() => void>();
  private state: MidiState = { status: "off", inputs: [], learning: null, bindings: load(), lastCc: "" };
  private learnQueue: NumericId[] = [];

  constructor(private readonly instrument: Instrument) {
    try { if (localStorage.getItem(ENABLED) === "1" || localStorage.getItem(OLD_ENABLED) === "1") void this.enable(); } catch { /* storage unavailable */ }
  }

  get snapshot() { return this.state; }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private set(patch: Partial<MidiState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((l) => l()); }

  async enable() {
    if (!("requestMIDIAccess" in navigator)) return this.set({ status: "unsupported" });
    try {
      this.access = await navigator.requestMIDIAccess();
    } catch {
      return this.set({ status: "denied" });
    }
    try { localStorage.setItem(ENABLED, "1"); } catch { /* ignore */ }
    this.access.onstatechange = () => this.attach();
    this.attach();
    if (this.state.bindings.length === 0) this.set({ bindings: PUSH_DEFAULT });
    this.set({ status: "ready" });
  }

  disable() {
    if (this.access) { this.access.inputs.forEach((i) => (i.onmidimessage = null)); this.access.onstatechange = null; }
    this.access = null;
    try { localStorage.removeItem(ENABLED); localStorage.removeItem(OLD_ENABLED); } catch { /* ignore */ }
    this.set({ status: "off", inputs: [], learning: null });
  }

  private attach() {
    const names: string[] = [];
    this.access?.inputs.forEach((input) => {
      input.onmidimessage = (e) => e.data && this.handle(input.name ?? "", e.data);
      names.push(input.name ?? "MIDI input");
    });
    this.set({ inputs: names });
  }

  /** Arms learn for one control, or two in order (orb X then Y). */
  learn(...targets: NumericId[]) {
    this.learnQueue = targets.slice(1);
    this.set({ learning: targets[0] ?? null });
  }
  cancelLearn() { this.learnQueue = []; this.set({ learning: null }); }

  resetBindings() { this.save(PUSH_DEFAULT); }

  private save(bindings: Binding[]) {
    try { localStorage.setItem(STORE, JSON.stringify(bindings)); } catch { /* ignore */ }
    this.set({ bindings });
  }

  private handle(port: string, data: Uint8Array) {
    const msg = parseControlChange(data);
    if (!msg) return;
    this.state = { ...this.state, lastCc: `CC ${msg.cc} · ${port || "input"}` };
    const { learning } = this.state;
    if (learning) {
      this.save(upsertBinding(this.state.bindings, { cc: msg.cc, channel: msg.channel, mode: isEncoderPort(port) || msg.cc >= 71 && msg.cc <= 79 ? "relative" : "absolute", target: learning }));
      const next = this.learnQueue.shift() ?? null;
      this.set({ learning: next });
      return;
    }
    const b = this.state.bindings.find((x) => x.cc === msg.cc && x.channel === msg.channel);
    if (!b) return this.set({});
    const r = decodeMessage(b, msg.value);
    if (r.kind === "nudge") this.instrument.nudgeNormalized(b.target, r.amount);
    else this.instrument.setNormalized(b.target, r.position);
  }
}

function load(): Binding[] {
  try { return JSON.parse(localStorage.getItem(STORE) ?? localStorage.getItem(OLD_STORE) ?? "[]") as Binding[]; } catch { return []; }
}
