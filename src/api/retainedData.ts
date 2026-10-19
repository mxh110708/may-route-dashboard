const PAGE_SIZE = 64;

export interface TableEditor<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  entries(): IterableIterator<[string, T]>;
}

/** Insertion-ordered snapshots. Traffic updates share the key index and all
 * untouched pages; key insertion/deletion copies the index once per batch. */
export class PagedTable<T> {
  constructor(private readonly index = new Map<string, number>(),
    private readonly pages: readonly (readonly (T | undefined)[])[] = [], private readonly slots = 0) {}

  get size(): number { return this.index.size; }
  get(key: string): T | undefined {
    const position = this.index.get(key);
    return position === undefined ? undefined : this.pages[Math.floor(position / PAGE_SIZE)][position % PAGE_SIZE];
  }
  *values(): IterableIterator<T> {
    for (const page of this.pages) for (const value of page) if (value !== undefined) yield value;
  }
  *entries(): IterableIterator<[string, T]> {
    for (const [key, position] of this.index) yield [key, this.pages[Math.floor(position / PAGE_SIZE)][position % PAGE_SIZE]!];
  }

  edit(operation: (editor: TableEditor<T>) => void): PagedTable<T> {
    let index = this.index, pages = this.pages, slots = this.slots;
    const changed = new Set<number>();
    const writableIndex = () => { if (index === this.index) index = new Map(index); return index; };
    const write = (position: number, value: T | undefined) => {
      if (pages === this.pages) pages = pages.slice();
      const page = Math.floor(position / PAGE_SIZE);
      if (!changed.has(page)) {
        (pages as (T | undefined)[][])[page] = (pages[page] ?? []).slice();
        changed.add(page);
      }
      (pages[page] as (T | undefined)[])[position % PAGE_SIZE] = value;
    };
    const get = (key: string) => {
      const position = index.get(key);
      return position === undefined ? undefined : pages[Math.floor(position / PAGE_SIZE)][position % PAGE_SIZE];
    };
    operation({
      get,
      set: (key, value) => {
        if (value === undefined) throw new Error("Undefined table row");
        let position = index.get(key);
        if (position === undefined) { position = slots++; writableIndex().set(key, position); }
        else if (get(key) === value) return;
        write(position, value);
      },
      delete: key => {
        const position = index.get(key);
        if (position === undefined) return;
        writableIndex().delete(key); write(position, undefined);
      },
      *entries() {
        for (const key of index.keys()) yield [key, get(key)!];
      },
    });
    if (pages === this.pages) return this;
    const result = new PagedTable(index, pages, slots);
    // Bound holes left by closed-history eviction, without retaining a chain of
    // prior snapshots. Compaction keeps insertion order and stable row objects.
    if (slots > index.size * 2 + PAGE_SIZE) {
      return new PagedTable<T>().edit(editor => { for (const [key, value] of result.entries()) editor.set(key, value); });
    }
    return result;
  }
}
