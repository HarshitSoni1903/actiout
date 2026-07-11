/**
 * Browser persistent storage utilities.
 * Never throw; safely degrade when navigator.storage is unavailable.
 */

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return false;
    }
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getStoragePersisted(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
      return false;
    }
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}
