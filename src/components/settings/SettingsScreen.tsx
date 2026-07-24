import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { DraftConflictAction, LoggingMode, Preference } from '../../domain/types';
import { getPreferences, updatePreferences } from '../../services/preference-service';
import { exportBundle, importBundle, validateBundle } from '../../services/export-service';
import type { ExportBundleV2 } from '../../services/export-service';
import { listSnapshots, restoreSnapshot } from '../../services/snapshot-service';
import { getStoragePersisted, todayLocalDate } from '../../utils';
import { useUiStore } from '../../state/ui-store';
import { Field } from '../common/Field';
import { Button } from '../common/Button';
import { SegmentedControl } from '../common/SegmentedControl';
import type { SegmentedControlOption } from '../common/SegmentedControl';
import { ImportConfirmModal } from './ImportConfirmModal';
import './settings.css';

const APP_VERSION = `v${__APP_VERSION__}`;

const WEIGHT_UNIT_OPTIONS: SegmentedControlOption[] = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
];

const DISTANCE_UNIT_OPTIONS: SegmentedControlOption[] = [
  { value: 'mi', label: 'mi' },
  { value: 'km', label: 'km' },
];

const THEME_OPTIONS: SegmentedControlOption[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

const LOGGING_MODE_OPTIONS: SegmentedControlOption[] = [
  { value: 'basic', label: 'Basic' },
  { value: 'advanced', label: 'Advanced' },
];

const DRAFT_CONFLICT_OPTIONS: SegmentedControlOption[] = [
  { value: 'ask', label: 'Ask' },
  { value: 'resume', label: 'Resume' },
  { value: 'close-and-start-new', label: 'Close & start new' },
];

type PendingImport = { bundle: ExportBundleV2; summary: string };

export function SettingsScreen() {
  const showToast = useUiStore((state) => state.showToast);
  const preferences = useLiveQuery(() => getPreferences(), []);
  const snapshots = useLiveQuery(() => listSnapshots(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void getStoragePersisted().then(setStoragePersisted);
  }, []);

  async function handleExport() {
    try {
      const bundle = await exportBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `actiout-backup-${todayLocalDate()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      showToast('Backup exported.');
    } catch {
      showToast('Could not export backup.', 'error');
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        showToast('Selected file is not valid JSON.', 'error');
        return;
      }

      const result = validateBundle(data);
      if (!result.ok) {
        showToast(result.reason, 'error');
        return;
      }

      setPendingImport({ bundle: result.bundle, summary: result.summary });
    } catch {
      showToast('Could not read the selected file.', 'error');
    } finally {
      // Reset so re-selecting the same file fires another change event.
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleConfirmImport() {
    if (!pendingImport) {
      return;
    }

    try {
      await importBundle(pendingImport.bundle);
      showToast('Backup imported.');
    } catch {
      showToast('Could not import backup.', 'error');
    } finally {
      setPendingImport(null);
    }
  }

  async function handleConfirmRestore() {
    if (!pendingRestoreId) {
      return;
    }
    try {
      await restoreSnapshot(pendingRestoreId);
      showToast('Snapshot restored.');
    } catch {
      showToast('Could not restore snapshot.', 'error');
    } finally {
      setPendingRestoreId(null);
    }
  }

  if (!preferences) {
    return null;
  }

  return (
    <div className="screen settings-screen">
      <h1>Settings</h1>

      <Field label="Weight unit">
        <SegmentedControl
          options={WEIGHT_UNIT_OPTIONS}
          value={preferences.weightUnit}
          onChange={(value) => void updatePreferences({ weightUnit: value as Preference['weightUnit'] })}
        />
      </Field>

      <Field label="Distance unit" hint="For future cardio tracking">
        <SegmentedControl
          options={DISTANCE_UNIT_OPTIONS}
          value={preferences.distanceUnit}
          onChange={(value) => void updatePreferences({ distanceUnit: value as Preference['distanceUnit'] })}
        />
      </Field>

      <Field label="Theme">
        <SegmentedControl
          options={THEME_OPTIONS}
          value={preferences.theme}
          onChange={(value) => void updatePreferences({ theme: value as Preference['theme'] })}
        />
      </Field>

      <Field label="Logging mode" hint="Basic: one entry per exercise. Advanced: log each set individually.">
        <SegmentedControl
          options={LOGGING_MODE_OPTIONS}
          value={preferences.loggingMode ?? 'basic'}
          onChange={(value) => void updatePreferences({ loggingMode: value as LoggingMode })}
        />
      </Field>

      <Field label="Draft conflict default" hint="What to do when starting a session while a draft is already in progress">
        <SegmentedControl
          options={DRAFT_CONFLICT_OPTIONS}
          value={preferences.defaultDraftConflictAction}
          onChange={(value) =>
            void updatePreferences({ defaultDraftConflictAction: value as DraftConflictAction })
          }
        />
      </Field>

      <Field label="Export backup" hint="Downloads a JSON file with all your data">
        <Button variant="ghost" onClick={() => void handleExport()}>
          Export backup
        </Button>
      </Field>

      <Field label="Import backup" hint="Choose a previously exported JSON file">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={(event) => void handleFileChange(event)}
        />
      </Field>

      <Field label="Restore from snapshot" hint="Automatic backups taken before imports and restores">
        {snapshots === undefined ? null : snapshots.length === 0 ? (
          <p className="settings-screen__snapshots-empty">No snapshots yet</p>
        ) : (
          <ul className="settings-screen__snapshots">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id} className="settings-screen__snapshot-row">
                <span>
                  {snapshot.createdAt} · {snapshot.reason} · {snapshot.summary}
                </span>
                <Button variant="ghost" onClick={() => setPendingRestoreId(snapshot.id)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Field>

      <p className="settings-screen__footer">
        Storage: {storagePersisted === null ? '…' : storagePersisted ? 'persisted' : 'best-effort (may be evicted)'}
      </p>

      <p className="settings-screen__footer">ActiOut {APP_VERSION}</p>

      <ImportConfirmModal
        open={pendingImport !== null}
        summary={pendingImport?.summary ?? ''}
        onConfirm={() => void handleConfirmImport()}
        onCancel={() => setPendingImport(null)}
      />

      <ImportConfirmModal
        open={pendingRestoreId !== null}
        summary={snapshots?.find((s) => s.id === pendingRestoreId)?.summary ?? ''}
        title="Restore snapshot"
        confirmLabel="Confirm restore"
        onConfirm={() => void handleConfirmRestore()}
        onCancel={() => setPendingRestoreId(null)}
      />
    </div>
  );
}
