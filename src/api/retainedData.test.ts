import { describe, expect, it } from "vitest";
import { PagedTable } from "./retainedData";

describe("paged connection snapshots", () => {
  it("matches Map insertion order across updates, deletion, reinsertion and compaction", () => {
    let table = new PagedTable<number>(), reference = new Map<string, number>();
    const snapshots: { table: PagedTable<number>; entries: [string, number][] }[] = [];
    let seed = 17;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    for (let round = 0; round < 250; round++) {
      table = table.edit(editor => {
        for (let operation = 0; operation < 40; operation++) {
          const key = String(random() % 700);
          if (random() % 3 === 0) { editor.delete(key); reference.delete(key); }
          else { const value = random(); editor.set(key, value); reference.set(key, value); }
          expect(editor.get(key)).toBe(reference.get(key));
        }
      });
      expect(table.size).toBe(reference.size);
      expect([...table.entries()]).toEqual([...reference]);
      expect([...table.values()]).toEqual([...reference.values()]);
      if (round % 25 === 0) snapshots.push({ table, entries: [...reference] });
    }
    for (const snapshot of snapshots) expect([...snapshot.table.entries()]).toEqual(snapshot.entries);
    expect(table.edit(() => {})).toBe(table);
    const previous = table;
    table = table.edit(editor => { for (const [key] of editor.entries()) editor.delete(key); });
    expect(table.size).toBe(0); expect([...table.values()]).toEqual([]);
    expect(previous.size).toBe(reference.size);
    reference = new Map();
  });
});
