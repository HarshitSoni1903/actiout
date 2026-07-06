import type { AppEvent } from '../domain/types';
import { ActiOutDB, db } from '../db/schema';
import { nowIso } from '../utils/dates';
import { newId } from '../utils/ids';

// Append-only event log entry for the future sync abstraction. `payload` is
// JSON-stringified into `payloadJson`; omitted payload is stored as 'null'.
export async function logEvent(
  entityType: string,
  entityId: string,
  eventType: string,
  payload?: unknown,
  database: ActiOutDB = db
): Promise<void> {
  const now = nowIso();
  const event: AppEvent = {
    id: newId(),
    entityType,
    entityId,
    eventType,
    payloadJson: JSON.stringify(payload ?? null),
    occurredAt: now,
    createdAt: now,
  };

  await database.appEvents.add(event);
}
