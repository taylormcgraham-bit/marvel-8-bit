/**
 * Long-term memory between issues, maintained by the Archivist: relationship temperatures,
 * facts characters have learned on-panel, unresolved threads, and the Deaths and Returns
 * ledger. Lives in data/memory.json; Chronicle entries live in data/chronicle/.
 */
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";

export interface Relationship { a: string; b: string; temperature: number; note: string; issue: number }
export interface Fact { who: string; fact: string; issue: number }
export interface LedgerEntry { who: string; kind: "death" | "return"; issue: number; how: string }
export interface IssueRecord {
  number: number;
  title: string;
  subtitle: string;
  summary: string;
  keyEvents: string[];
  threads: string[];
  cast: string[];
  endedAt: number;
}

interface MemoryFile { relationships: Relationship[]; facts: Fact[]; threads: string[]; ledger: LedgerEntry[] }

export class Memory {
  relationships: Relationship[] = [];
  facts: Fact[] = [];
  threads: string[] = [];
  ledger: LedgerEntry[] = [];
  private file = path.join(CONFIG.dataDir, "memory.json");
  private chronicleDir = path.join(CONFIG.dataDir, "chronicle");

  load() {
    try {
      const m = JSON.parse(fs.readFileSync(this.file, "utf8")) as MemoryFile;
      this.relationships = m.relationships ?? []; this.facts = m.facts ?? []; this.threads = m.threads ?? []; this.ledger = m.ledger ?? [];
    } catch { /* fresh */ }
  }
  save() {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ relationships: this.relationships, facts: this.facts, threads: this.threads, ledger: this.ledger } satisfies MemoryFile, null, 2));
  }

  setRelationship(a: string, b: string, temperature: number, note: string, issue: number) {
    const [x, y] = [a, b].sort() as [string, string];
    const i = this.relationships.findIndex((r) => r.a === x && r.b === y);
    const rel = { a: x, b: y, temperature: Math.max(-5, Math.min(5, temperature)), note, issue };
    if (i >= 0) this.relationships[i] = rel; else this.relationships.push(rel);
  }
  addFact(who: string, fact: string, issue: number) {
    if (!this.facts.some((f) => f.who === who && f.fact === fact)) this.facts.push({ who, fact, issue });
  }
  setThreads(threads: string[]) { this.threads = [...new Set(threads)].slice(0, 12); }
  record(entry: LedgerEntry) { this.ledger.push(entry); }

  /** Compact text for prompts. */
  describe(ids?: string[]): string {
    const rel = this.relationships.filter((r) => !ids || (ids.includes(r.a) && ids.includes(r.b)));
    const facts = this.facts.filter((f) => !ids || ids.includes(f.who));
    const parts: string[] = [];
    if (rel.length) parts.push("RELATIONSHIPS (temperature -5 hostile .. +5 close):\n" + rel.map((r) => `- ${r.a} & ${r.b}: ${r.temperature >= 0 ? "+" : ""}${r.temperature}, ${r.note}`).join("\n"));
    if (facts.length) parts.push("WHAT THEY HAVE LEARNED ON-PANEL:\n" + facts.slice(-20).map((f) => `- ${f.who}: ${f.fact} (issue ${f.issue})`).join("\n"));
    if (this.threads.length) parts.push("UNRESOLVED THREADS:\n" + this.threads.map((t) => "- " + t).join("\n"));
    if (this.ledger.length) parts.push("DEATHS AND RETURNS LEDGER:\n" + this.ledger.map((l) => `- ${l.kind}: ${l.who}, issue ${l.issue}, ${l.how}`).join("\n"));
    return parts.join("\n\n") || "(no history yet; this is the first issue)";
  }

  /* ---- chronicle */
  writeIssue(rec: IssueRecord, transcript: string[]) {
    fs.mkdirSync(this.chronicleDir, { recursive: true });
    fs.writeFileSync(path.join(this.chronicleDir, `issue-${String(rec.number).padStart(3, "0")}.json`), JSON.stringify({ ...rec, transcript }, null, 2));
  }
  issues(): (IssueRecord & { transcript: string[] })[] {
    if (!fs.existsSync(this.chronicleDir)) return [];
    return fs.readdirSync(this.chronicleDir).filter((f) => f.endsWith(".json")).sort()
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.chronicleDir, f), "utf8")));
  }
  /** Past issues, summarized, for the Showrunner. */
  describeIssues(): string {
    const list = this.issues();
    if (!list.length) return "(no previous issues)";
    return list.slice(-8).map((i) => `ISSUE #${i.number} "${i.title}": ${i.summary}\n  Key events: ${i.keyEvents.join("; ")}`).join("\n\n");
  }
}
