import { afterEach, describe, expect, it, vi } from "vitest";
import { createBundledInterfaceFont } from "./bundledInterfaceFont";

afterEach(() => vi.unstubAllGlobals());

function mockFaces() {
  const made: MockFace[] = [];
  class MockFace {
    loads = 0;
    resolve!: () => void;
    reject!: (error: unknown) => void;
    loaded = new Promise<this>((resolve, reject) => {
      this.resolve = () => resolve(this);
      this.reject = reject;
    });
    constructor(readonly family: string, readonly source: string, readonly descriptors?: FontFaceDescriptors) { made.push(this); }
    load() { this.loads++; return this.loaded; }
  }
  vi.stubGlobal("FontFace", MockFace);
  return made;
}
const parts = [
  { source: "common.woff2", unicodeRange: "U+20-FF", common: true },
  { source: "rare.woff2", unicodeRange: "U+4E00-4EFF", common: false },
  { source: "other.woff2", unicodeRange: "U+20000-200FF", common: false },
];

describe("bundled font demand loading", () => {
  it("prepares common text without decoding unused ranges", async () => {
    const made = mockFaces();
    const result = createBundledInterfaceFont("test", parts, "original.ttf", vi.fn(), vi.fn());
    expect(made.map(face => face.loads)).toEqual([1, 0, 0]);
    expect(made[1].descriptors?.unicodeRange).toBe("U+4E00-4EFF");
    made[0].resolve(); await result.ready;
    expect(result.faces).toHaveLength(3);
    expect(result.faces.at(-1)).toBe(made[0]);
    expect(made.map(face => face.loads)).toEqual([1, 0, 0]);
  });

  it("recovers common-font failure with the unchanged complete font", async () => {
    const made = mockFaces(), recovered = vi.fn(), failed = vi.fn();
    const result = createBundledInterfaceFont("test", parts, "original.ttf", recovered, failed);
    made[0].reject(new Error("common asset missing"));
    await vi.waitFor(() => expect(made).toHaveLength(4));
    expect(made[3].source).toBe('url("original.ttf")');
    made[3].resolve(); await result.ready;
    expect(result.faces).toHaveLength(1);
    expect(recovered.mock.calls[0][1]).toHaveLength(3);
    expect(recovered).toHaveBeenCalledOnce(); expect(failed).not.toHaveBeenCalled();
  });

  it("two late range failures share one recovery and never retry every frame", async () => {
    const made = mockFaces(), recovered = vi.fn(), failed = vi.fn();
    const result = createBundledInterfaceFont("test", parts, "original.ttf", recovered, failed);
    made[0].resolve(); await result.ready;
    made[1].reject(new Error("rare asset missing")); made[2].reject(new Error("other asset missing"));
    await vi.waitFor(() => expect(made).toHaveLength(4));
    made[3].resolve(); await vi.waitFor(() => expect(recovered).toHaveBeenCalledOnce());
    expect(result.faces).toHaveLength(1); expect(failed).not.toHaveBeenCalled();
  });

  it("reports an unavailable complete recovery once without unhandled rejections", async () => {
    const made = mockFaces(), failed = vi.fn();
    const result = createBundledInterfaceFont("test", parts, "original.ttf", vi.fn(), failed);
    made[0].resolve(); await result.ready;
    made[1].reject(new Error("missing one")); made[2].reject(new Error("missing two"));
    await vi.waitFor(() => expect(made).toHaveLength(4));
    made[3].reject(new Error("complete font missing"));
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
  });

  it("does not decode the complete font after the user has selected another font", async () => {
    const made = mockFaces(), recovered = vi.fn(), failed = vi.fn();
    const result = createBundledInterfaceFont("test", parts, "original.ttf", recovered, failed, () => false);
    made[0].resolve(); await result.ready;
    made[1].reject(new Error("late discarded range"));
    await Promise.resolve(); await Promise.resolve();
    expect(made).toHaveLength(3); expect(recovered).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
  });
});
