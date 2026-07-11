import { describe, it, expect, afterEach } from 'vitest';
import { ActiOutDB } from './schema';

async function fresh(name: string): Promise<ActiOutDB> {
  const dbx = new ActiOutDB(name);
  await dbx.open();
  return dbx;
}

describe('ActiOutDB v2 schema', () => {
  let dbx: ActiOutDB;
  afterEach(async () => {
    if (dbx) {
      dbx.close();
      await dbx.delete();
    }
  });

  it('declares schema version 2', async () => {
    dbx = await fresh('schema-v2-version');
    expect(dbx.verno).toBe(2);
  });

  it('exposes sessionSets and snapshots tables', async () => {
    dbx = await fresh('schema-v2-tables');
    const names = dbx.tables.map((t) => t.name).sort();
    expect(names).toContain('sessionSets');
    expect(names).toContain('snapshots');
  });

  it('indexes sessionSets by [sessionItemId+setNumber]', async () => {
    dbx = await fresh('schema-v2-idx');
    const idx = dbx.table('sessionSets').schema.indexes.map((i) => i.name);
    expect(idx).toContain('[sessionItemId+setNumber]');
  });

  it('no longer indexes routineTemplates by isArchived', async () => {
    dbx = await fresh('schema-v2-noarchive');
    const idx = dbx.table('routineTemplates').schema.indexes.map((i) => i.name);
    expect(idx).not.toContain('isArchived');
  });

  it('round-trips a SessionSet row', async () => {
    dbx = await fresh('schema-v2-roundtrip');
    await dbx.sessionSets.add({
      id: 's1', sessionId: 'sess1', sessionItemId: 'it1', setNumber: 1,
      reps: 8, weight: 100, weightUnit: 'lb', isWarmup: false, completed: true,
      createdAt: 'now', updatedAt: 'now',
    });
    const got = await dbx.sessionSets.get('s1');
    expect(got?.setNumber).toBe(1);
    expect(got?.isWarmup).toBe(false);
  });
});
