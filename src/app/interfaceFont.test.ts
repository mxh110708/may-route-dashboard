import { afterEach, describe, expect, it, vi } from "vitest";
import { configurePreferenceStorage } from "../lib/storage";
import { applyPreparedInterfaceFont, discardUnselectedInterfaceFont, fontDataView, prepareInterfaceFont } from "./interfaceFont";

afterEach(() => {
  configurePreferenceStorage({ get: () => undefined, set: () => {}, remove: () => {}, subscribe: () => () => {} });
  vi.unstubAllGlobals();
});

describe("interface font memory ownership", () => {
  it("a discarded failed load cannot evict a newer successful selection of the same font", async () => {
    const faces = new Set();
    const id = "font-" + "c".repeat(64);
    let selected = id;
    const pending: Array<{ resolve(): void; reject(error: unknown): void }> = [];
    let loads = 0;
    vi.stubGlobal("FontFace", class {
      load() {
        loads++;
        return new Promise((resolve, reject) => pending.push({ resolve: () => resolve(this), reject }));
      }
    });
    vi.stubGlobal("document", { fonts: faces, documentElement: { style: { setProperty: vi.fn() } } });
    configurePreferenceStorage({ get: () => selected, set: () => {}, remove: () => {}, subscribe: () => () => {} });
    const fonts = { data: async () => new Uint8Array([0, 1]) } as never;
    const old = prepareInterfaceFont(id, fonts);
    await Promise.resolve();
    selected = "default"; discardUnselectedInterfaceFont(id); selected = id;
    const current = prepareInterfaceFont(id, fonts);
    await Promise.resolve();
    pending[1].resolve(); applyPreparedInterfaceFont(id, await current);
    const rejected = expect(old).rejects.toThrow("discarded load");
    pending[0].reject(new Error("discarded load")); await rejected;
    await prepareInterfaceFont(id, fonts);
    expect(loads).toBe(2); expect(faces.size).toBe(1);
    selected = "default"; applyPreparedInterfaceFont("default", "sans-serif");
  });
  it("passes imported bytes without duplicating their buffer or exposing adjacent data", () => {
    const buffer = new ArrayBuffer(1024);
    const source = new Uint8Array(buffer, 120, 700);
    const result = fontDataView(source);
    expect(result.buffer).toBe(buffer);
    expect(result.byteOffset).toBe(120);
    expect(result.byteLength).toBe(700);
  });

  it("does not register a stale font and releases its cached face after another selection wins", async () => {
    const faces = new Set();
    let selected = "font-" + "a".repeat(64);
    const oldID = selected, newID = "font-" + "b".repeat(64);
    const pending: Array<() => void> = [];
    let loads = 0;
    vi.stubGlobal("FontFace", class {
      load() { loads++; return new Promise(resolve => pending.push(() => resolve(this))); }
    });
    vi.stubGlobal("document", { fonts: faces, documentElement: { style: { setProperty: vi.fn() } } });
    configurePreferenceStorage({ get: () => selected, set: () => {}, remove: () => {}, subscribe: () => () => {} });
    const fonts = { data: async () => new Uint8Array([0, 1]) } as never;
    const old = prepareInterfaceFont(oldID, fonts);
    await Promise.resolve();
    selected = newID;
    const newer = prepareInterfaceFont(newID, fonts);
    await Promise.resolve();
    pending[1]();
    applyPreparedInterfaceFont(newID, await newer);
    expect(faces.size).toBe(1);
    pending[0](); await old;
    expect(faces.size).toBe(1);
    discardUnselectedInterfaceFont(oldID);
    const retry = prepareInterfaceFont(oldID, fonts);
    await Promise.resolve();
    expect(loads).toBe(3);
    pending[2](); await retry;
    discardUnselectedInterfaceFont(oldID);
    applyPreparedInterfaceFont("default", "sans-serif");
    expect(faces.size).toBe(0);
  });
});
