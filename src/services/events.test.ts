import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { logEvent } from './events';

describe('events (db-backed)', () => {
  let testDb: ActiOutDB;

  beforeEach(() => {
    testDb = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('writes an appEvents row with the given entityType, entityId, and eventType', async () => {
    await logEvent('session', 'session-123', 'started', undefined, testDb);

    const events = await testDb.appEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]?.entityType).toBe('session');
    expect(events[0]?.entityId).toBe('session-123');
    expect(events[0]?.eventType).toBe('started');
    expect(events[0]?.id).toBeDefined();
    expect(events[0]?.occurredAt).toBeDefined();
    expect(events[0]?.createdAt).toBeDefined();
  });

  it('serializes a provided payload into payloadJson', async () => {
    await logEvent('routine', 'routine-1', 'created', { name: 'Push Day', itemCount: 3 }, testDb);

    const events = await testDb.appEvents.toArray();
    expect(JSON.parse(events[0]!.payloadJson)).toEqual({ name: 'Push Day', itemCount: 3 });
  });

  it('stores payloadJson "null" (JSON.stringify(null)) when payload is omitted', async () => {
    await logEvent('bodyweight', 'bw-1', 'deleted', undefined, testDb);

    const events = await testDb.appEvents.toArray();
    expect(events[0]?.payloadJson).toBe('null');
    expect(JSON.parse(events[0]!.payloadJson)).toBeNull();
  });
});
