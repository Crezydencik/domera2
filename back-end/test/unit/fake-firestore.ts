/** Minimal in-memory Firestore fake: doc/collection get/set/delete, simple where/limit, getAll, batches, transactions. */
type Data = Record<string, unknown>;
type Filter = { field: string; op: '==' | '<=' | '>=' | '<' | '>' | 'in' | 'array-contains' | 'array-contains-any'; value: unknown };

const millis = (value: unknown): unknown => {
  if (value instanceof Date) return value.getTime();
  return value;
};

const getField = (data: Data, field: string): unknown =>
  field.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Data)[key] : undefined), data);

function matches(data: Data, filter: Filter): boolean {
  const actual = millis(getField(data, filter.field));
  const expected = millis(filter.value);
  switch (filter.op) {
    case '==': return actual === expected;
    case '<=': return actual !== undefined && (actual as number) <= (expected as number);
    case '>=': return actual !== undefined && (actual as number) >= (expected as number);
    case '<': return actual !== undefined && (actual as number) < (expected as number);
    case '>': return actual !== undefined && (actual as number) > (expected as number);
    case 'in': return (expected as unknown[]).includes(actual);
    case 'array-contains': return Array.isArray(actual) && actual.includes(expected);
    case 'array-contains-any': return Array.isArray(actual) && (expected as unknown[]).some((value) => actual.includes(value));
  }
}

const isPlainObject = (value: unknown): value is Data =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

/** Firestore `set(..., { merge: true })` semantics: nested maps merge, arrays/scalars replace. */
function deepMerge(target: Data, patch: Data): Data {
  const result: Data = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = isPlainObject(value) && isPlainObject(result[key]) ? deepMerge(result[key] as Data, value) : value;
  }
  return result;
}

export class FakeFirestore {
  readonly store = new Map<string, Data>();
  readonly stats = { collectionGets: 0, docGets: 0, writes: 0, transactions: 0, queries: [] as string[] };

  collection(path: string) {
    return new FakeQuery(this, path);
  }

  doc(path: string) {
    return new FakeDoc(this, path, new FakeQuery(this, path.split('/').slice(0, -1).join('/')));
  }

  collectionGroup(id: string) {
    return new FakeQuery(this, id, [], undefined, true);
  }

  async getAll(...refs: FakeDoc[]) {
    return Promise.all(refs.map((ref) => ref.get()));
  }

  batch() {
    const ops: Array<() => void> = [];
    const batch = {
      set: (ref: FakeDoc, data: Data) => { ops.push(() => this.setMerge(ref.path, data)); return batch; },
      delete: (ref: FakeDoc) => { ops.push(() => this.store.delete(ref.path)); return batch; },
      commit: async () => { ops.forEach((op) => op()); },
    };
    return batch;
  }

  readonly versions = new Map<string, number>();

  /** Optimistic transactions like Firestore: buffered writes, retry when a read doc changed. */
  async runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    this.stats.transactions += 1;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const tx = new FakeTx(this);
      const result = await fn(tx);
      const conflict = [...tx.reads.entries()].some(([path, version]) => (this.versions.get(path) ?? 0) !== version);
      if (conflict) continue;
      tx.writes.forEach((write) => write());
      return result;
    }
    throw new Error('transaction contention');
  }

  bump(path: string) {
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
  }

  setMerge(path: string, data: Data) {
    this.stats.writes += 1;
    this.bump(path);
    this.store.set(path, deepMerge(this.store.get(path) ?? {}, data));
  }
}

class FakeTx {
  readonly reads = new Map<string, number>();
  readonly writes: Array<() => void> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: FakeDoc) {
    this.reads.set(ref.path, this.db.versions.get(ref.path) ?? 0);
    await Promise.resolve(); // yield, so concurrent transactions can interleave
    return ref.get();
  }
  async getAll(...refs: FakeDoc[]) { return Promise.all(refs.map((ref) => this.get(ref))); }
  set(ref: FakeDoc, data: Data) { this.writes.push(() => this.db.setMerge(ref.path, data)); return this; }
  update(ref: FakeDoc, data: Data) { this.writes.push(() => this.db.setMerge(ref.path, data)); return this; }
  delete(ref: FakeDoc) { this.writes.push(() => { this.db.store.delete(ref.path); this.db.bump(ref.path); }); return this; }
}

export class FakeQuery {
  constructor(
    private readonly db: FakeFirestore,
    readonly path: string,
    private readonly filters: Filter[] = [],
    private readonly max?: number,
    private readonly group = false,
    private readonly order?: { field: string; dir: 'asc' | 'desc' },
    private readonly after?: string,
  ) {}

  private clone(patch: Partial<{ filters: Filter[]; max: number; order: { field: string; dir: 'asc' | 'desc' }; after: string }>) {
    return new FakeQuery(this.db, this.path, patch.filters ?? this.filters, patch.max ?? this.max, this.group, patch.order ?? this.order, patch.after ?? this.after);
  }

  doc(id: string) {
    return new FakeDoc(this.db, `${this.path}/${id}`, this);
  }
  where(field: string, op: Filter['op'], value: unknown) {
    return this.clone({ filters: [...this.filters, { field, op, value }] });
  }
  limit(n: number) {
    return this.clone({ max: n });
  }
  select() { return this; }
  orderBy(field: unknown, dir: 'asc' | 'desc' = 'asc') {
    return this.clone({ order: { field: typeof field === 'string' ? field : '__name__', dir } });
  }
  startAfter(cursor: string | { ref: { path: string } }) {
    return this.clone({ after: typeof cursor === 'string' ? `${this.path}/${cursor}` : cursor.ref.path });
  }
  count() {
    return { get: async () => { const snap = await this.get(); return { data: () => ({ count: snap.size }) }; } };
  }

  async get() {
    this.db.stats.collectionGets += 1;
    this.db.stats.queries.push(`${this.group ? 'group:' : ''}${this.path}${this.filters.map((f) => ` ${f.field}${f.op}`).join('')}`);
    const segments = this.path.split('/').length;
    const docs = [...this.db.store.entries()]
      .filter(([key]) => {
        const parts = key.split('/');
        if (this.group) return parts.length % 2 === 0 && parts[parts.length - 2] === this.path;
        return key.startsWith(`${this.path}/`) && parts.length === segments + 1;
      })
      .filter(([, data]) => this.filters.every((filter) => matches(data, filter)))
      .sort(([ka, a], [kb, b]) => {
        if (!this.order) return 0;
        if (this.order.field === '__name__') return this.order.dir === 'desc' ? kb.localeCompare(ka) : ka.localeCompare(kb);
        const left = millis(getField(a, this.order.field)) as number;
        const right = millis(getField(b, this.order.field)) as number;
        return this.order.dir === 'desc' ? right - left : left - right;
      })
      .filter((entry, index, all) => !this.after || index > all.findIndex(([key]) => key === this.after))
      .slice(0, this.max ?? Number.POSITIVE_INFINITY)
      .map(([key]) => new FakeDoc(this.db, key, new FakeQuery(this.db, key.split('/').slice(0, -1).join('/'))).snapshotSync());
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

export class FakeDoc {
  readonly id: string;
  constructor(private readonly db: FakeFirestore, readonly path: string, readonly parentCollection: FakeQuery) {
    this.id = path.split('/').pop()!;
  }
  get parent() {
    const parentDocPath = this.parentCollection.path.split('/').slice(0, -1).join('/');
    return { id: this.parentCollection.path.split('/').pop(), parent: parentDocPath ? { id: parentDocPath.split('/').pop() } : null };
  }
  collection(name: string) {
    return new FakeQuery(this.db, `${this.path}/${name}`);
  }
  async get() {
    this.db.stats.docGets += 1;
    return this.snapshotSync();
  }
  async set(data: Data) {
    this.db.setMerge(this.path, data);
  }
  async delete() {
    this.db.store.delete(this.path);
  }
  async update(data: Data) {
    if (!this.db.store.has(this.path)) throw new Error('NOT_FOUND');
    this.db.setMerge(this.path, data);
  }
  snapshotSync() {
    const data = this.db.store.get(this.path);
    return { id: this.id, ref: this, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  }
}
