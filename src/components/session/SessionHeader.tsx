import { useEffect, useState } from 'react';
import type { Session } from '../../domain/types';

export type SessionHeaderProps = {
  session: Session;
  onBack(): void;
};

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year as number, (month as number) - 1, day as number);
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(date);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

function routineTitle(session: Session): string {
  if (session.routineLinks.length > 0) {
    return session.routineLinks.map((link) => link.routineNameSnapshot).join(' + ');
  }
  return 'Quick workout';
}

function statusBadge(session: Session): { label: string; variant: 'completed' | 'dnf' } | undefined {
  if (session.status === 'completed') {
    return { label: 'Completed', variant: 'completed' };
  }
  if (session.status === 'dnf') {
    return { label: 'Did not finish', variant: 'dnf' };
  }
  return undefined;
}

export function SessionHeader({ session, onBack }: SessionHeaderProps) {
  // Only a draft with a known start time ticks — completed/dnf sessions show
  // a frozen duration, and a missing startedAt has nothing to tick from.
  const ticking = session.status === 'draft' && session.startedAt !== undefined;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  let elapsedLabel = '--:--';
  if (session.status === 'draft') {
    if (session.startedAt) {
      elapsedLabel = formatElapsed((now - Date.parse(session.startedAt)) / 1000);
    }
  } else if (session.durationSeconds !== undefined) {
    elapsedLabel = formatElapsed(session.durationSeconds);
  } else if (session.startedAt && session.endedAt) {
    elapsedLabel = formatElapsed((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000);
  }

  const badge = statusBadge(session);

  return (
    <div className="session-header">
      <button type="button" className="session-header__back" aria-label="Back to home" onClick={onBack}>
        &lsaquo;
      </button>
      <div className="session-header__main">
        <p className="session-header__title">{routineTitle(session)}</p>
        <p className="session-header__meta">
          {formatDate(session.sessionDate)} &middot; {elapsedLabel}
        </p>
      </div>
      {badge ? (
        <span className={`session-header__badge session-header__badge--${badge.variant}`}>{badge.label}</span>
      ) : null}
    </div>
  );
}
