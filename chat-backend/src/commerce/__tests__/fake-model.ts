/**
 * Minimal in-memory stand-in for a Mongoose model — just enough of the query
 * surface CommerceService uses (find/sort/skip/limit/select/lean, findOne,
 * findById, countDocuments, create, findByIdAndUpdate, findByIdAndDelete).
 *
 * Filters support: equality, array-contains on array fields, `$in`, `$ne`,
 * `$regex`. That is what lets the spec assert real filtering / sorting /
 * pagination behavior instead of only "was called with" shapes.
 */
import { Types } from 'mongoose';

type Doc = Record<string, unknown>;

function norm(v: unknown): unknown {
  if (v instanceof Types.ObjectId) return v.toHexString();
  if (v instanceof Date) return v.getTime();
  return v;
}

function matchesCond(value: unknown, cond: unknown): boolean {
  if (
    cond !== null &&
    typeof cond === 'object' &&
    !(cond instanceof Types.ObjectId) &&
    !(cond instanceof Date) &&
    !Array.isArray(cond)
  ) {
    const c = cond as Record<string, unknown>;
    if ('$in' in c) {
      const set = (c.$in as unknown[]).map(norm);
      return Array.isArray(value)
        ? value.some((v) => set.includes(norm(v)))
        : set.includes(norm(value));
    }
    if ('$ne' in c) return norm(value) !== norm(c.$ne);
    if ('$regex' in c) {
      return (
        typeof value === 'string' && new RegExp(c.$regex as string).test(value)
      );
    }
    throw new Error(`fake-model: unsupported operator ${Object.keys(c)[0]}`);
  }
  if (Array.isArray(value)) return value.map(norm).includes(norm(cond));
  return norm(value) === norm(cond);
}

export function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([k, cond]) => matchesCond(doc[k], cond));
}

function compare(a: unknown, b: unknown): number {
  const x = norm(a) as string | number;
  const y = norm(b) as string | number;
  if (x === y) return 0;
  return x < y ? -1 : 1;
}

class FakeQuery<T> implements PromiseLike<T> {
  private sortSpec: Record<string, 1 | -1> | null = null;
  private skipN = 0;
  private limitN: number | null = null;

  constructor(
    private readonly rows: () => Doc[],
    private readonly single: boolean,
  ) {}

  sort(spec: Record<string, 1 | -1>) {
    this.sortSpec = spec;
    return this;
  }
  skip(n: number) {
    this.skipN = n;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  select() {
    return this;
  }
  lean<R = T>(): Promise<R> {
    return Promise.resolve(this.exec() as unknown as R);
  }
  then<R1 = T, R2 = never>(
    onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }

  private exec(): T {
    let out = this.rows().map((d) => ({ ...d }));
    if (this.sortSpec) {
      const entries = Object.entries(this.sortSpec);
      out.sort((a, b) => {
        for (const [k, dir] of entries) {
          const c = compare(a[k], b[k]);
          if (c !== 0) return c * dir;
        }
        return 0;
      });
    }
    out = out.slice(this.skipN);
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return (this.single ? (out[0] ?? null) : out) as T;
  }
}

export class FakeModel {
  docs: Doc[] = [];

  constructor(initial: Doc[] = []) {
    this.docs = initial.map((d) => ({ _id: new Types.ObjectId(), ...d }));
  }

  find(filter: Doc = {}) {
    return new FakeQuery<Doc[]>(
      () => this.docs.filter((d) => matches(d, filter)),
      false,
    );
  }
  findOne(filter: Doc = {}) {
    return new FakeQuery<Doc | null>(
      () => this.docs.filter((d) => matches(d, filter)),
      true,
    );
  }
  findById(id: unknown) {
    return this.findOne({ _id: id });
  }
  countDocuments(filter: Doc = {}) {
    return Promise.resolve(this.docs.filter((d) => matches(d, filter)).length);
  }
  create(payload: Doc) {
    const now = new Date();
    const doc: Doc = {
      _id: new Types.ObjectId(),
      createdAt: now,
      updatedAt: now,
      ...payload,
    };
    this.docs.push(doc);
    return Promise.resolve({ ...doc, toObject: () => ({ ...doc }) });
  }
  findByIdAndUpdate(id: unknown, update: { $set: Doc }) {
    const doc = this.docs.find((d) => norm(d._id) === norm(id));
    if (doc) Object.assign(doc, update.$set, { updatedAt: new Date() });
    return new FakeQuery<Doc | null>(() => (doc ? [doc] : []), true);
  }
  findByIdAndDelete(id: unknown) {
    const idx = this.docs.findIndex((d) => norm(d._id) === norm(id));
    const [removed] = idx >= 0 ? this.docs.splice(idx, 1) : [null];
    return Promise.resolve(removed);
  }
  updateMany(filter: Doc, update: { $set: Doc }) {
    let modifiedCount = 0;
    for (const d of this.docs) {
      if (matches(d, filter)) {
        Object.assign(d, update.$set);
        modifiedCount++;
      }
    }
    return Promise.resolve({ modifiedCount });
  }
}
