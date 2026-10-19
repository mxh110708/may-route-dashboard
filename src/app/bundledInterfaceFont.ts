export interface BundledFontPart {
  source: string;
  unicodeRange: string;
  common: boolean;
}

/** Define full coverage, but decode only common text and subsequently used runs. */
export function createBundledInterfaceFont(family: string, parts: readonly BundledFontPart[], fallbackURL: string,
  recovered: (face: FontFace, previous: FontFace[]) => void, failed: (error: unknown) => void, active = () => true) {
  const created = parts.map(part => new FontFace(family, `url("${part.source}")`, { unicodeRange: part.unicodeRange }));
  // Later faces win font matching. Keep ordinary text first in that search,
  // rather than checking every rare range when a clock or counter changes.
  const faces = [
    ...created.filter((_face, index) => !parts[index].common),
    ...created.filter((_face, index) => parts[index].common),
  ];
  let fallback: Promise<FontFace> | undefined;
  let reported = false;
  const recover = () => {
    fallback ??= (async () => {
      const face = new FontFace(family, `url("${fallbackURL}")`);
      await face.load();
      const previous = faces.splice(0, faces.length, face);
      recovered(face, previous);
      return face;
    })();
    return fallback;
  };
  for (let index = 0; index < created.length; index++) {
    if (parts[index].common) continue;
    // Reading .loaded does not start a download. CSS requests the relevant
    // unicode-range when text actually needs it. Recover once if it fails.
    void created[index].loaded.catch(() => active() ? recover() : undefined).catch(error => {
      if (!reported && active()) { reported = true; failed(error); }
    });
  }
  const ready = Promise.all(created.filter((_face, index) => parts[index].common).map(face => face.load()))
    .catch(() => recover()).then(() => undefined);
  return { faces, ready };
}
