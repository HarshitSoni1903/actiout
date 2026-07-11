import type { Snapshot, SnapshotReason } from '../domain/types';
import { ActiOutDB, db } from '../db/schema';
import { nowIso } from '../utils/dates';
import { newId } from '../utils/ids';
import { exportBundle, importBundle, validateBundle } from './export-service';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SNAPSHOTS = 20;

// --- Codec -----------------------------------------------------------------
// A snapshot's bundle is stored as a single string prefixed with a 1-char codec
// tag: 'g' = gzip+base64 (when CompressionStream is available), 'j' = raw JSON.
// Decompression switches on the prefix, so old and new devices interoperate.

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function pumpStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return concatBytes(chunks);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encodeBundle(json: string): Promise<string> {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    void writer.write(new TextEncoder().encode(json));
    void writer.close();
    const bytes = await pumpStream(cs.readable);
    return `g${bytesToBase64(bytes)}`;
  }
  return `j${json}`;
}

async function decodeBundle(payload: string): Promise<string> {
  const prefix = payload.slice(0, 1);
  const body = payload.slice(1);
  if (prefix === 'g') {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    void writer.write(base64ToBytes(body));
    void writer.close();
    const bytes = await pumpStream(ds.readable);
    return new TextDecoder().decode(bytes);
  }
  return body;
}

// --- Public API ------------------------------------------------------------

export async function takeSnapshot(reason: SnapshotReason, database: ActiOutDB = db): Promise<Snapshot> {
  // Read the whole bundle before opening any snapshots transaction.
  const bundle = await exportBundle(database);
  const bundleJson = await encodeBundle(JSON.stringify(bundle));

  const summary = `${bundle.routineTemplates.length} routines, ${bundle.sessions.length} sessions, ${bundle.sessionSets.length} sets`;

  const snapshot: Snapshot = {
    id: newId(),
    createdAt: nowIso(),
    reason,
    summary,
    bundleJson,
  };

  await database.snapshots.add(snapshot);
  await pruneSnapshots(database);

  return snapshot;
}

export async function listSnapshots(
  database: ActiOutDB = db
): Promise<Array<Pick<Snapshot, 'id' | 'createdAt' | 'reason' | 'summary'>>> {
  const rows = await database.snapshots.toArray();
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return rows.map(({ id, createdAt, reason, summary }) => ({ id, createdAt, reason, summary }));
}

export async function restoreSnapshot(id: string, database: ActiOutDB = db): Promise<void> {
  const row = await database.snapshots.get(id);
  if (!row) {
    throw new Error(`restoreSnapshot: snapshot ${id} does not exist`);
  }

  // Guard the current state before we overwrite it.
  await takeSnapshot('pre-restore', database);

  const parsed = JSON.parse(await decodeBundle(row.bundleJson));
  const result = validateBundle(parsed);
  if (!result.ok) {
    throw new Error(result.reason);
  }

  await importBundle(result.bundle, database);
}

export async function pruneSnapshots(database: ActiOutDB = db): Promise<void> {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  await database.snapshots.where('createdAt').below(cutoff).delete();

  const remaining = await database.snapshots.toArray();
  remaining.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  if (remaining.length > MAX_SNAPSHOTS) {
    const excess = remaining.slice(MAX_SNAPSHOTS).map((s) => s.id);
    await database.snapshots.bulkDelete(excess);
  }
}
