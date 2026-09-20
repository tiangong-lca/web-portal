"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import "./navigation-feedback.css";

const ReportPending = createContext<(id: string, pending: boolean) => void>(() => {});

/** Keeps existing content usable; only genuinely pending work shows the quiet route indicator.
 * @import import { NavigationFeedbackProvider } from "@/components/shell/navigation-feedback";
 */
export function NavigationFeedbackProvider({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const [requests, setRequests] = useState<Set<string>>(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const report = useCallback((id: string, pending: boolean) => {
    setRequests((previous) => {
      if (previous.has(id) === pending) return previous;
      const next = new Set(previous);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const pending = requests.size > 0;
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(pending), pending ? 150 : 0);
    return () => clearTimeout(timer);
  }, [pending]);
  const visible = pending && revealed;
  return (
    <ReportPending.Provider value={report}>
      {children}
      <div className="portal-route-progress" data-pending={visible || undefined} aria-hidden="true">
        <span />
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {visible ? label : ""}
      </div>
    </ReportPending.Provider>
  );
}

/** Inline marker for transitions/forms and the shared, delayed navigation announcement.
 * @import import { PendingFeedback } from "@/components/shell/navigation-feedback";
 */
export function PendingFeedback({ pending }: { pending: boolean }) {
  const id = useId();
  const report = useContext(ReportPending);
  useEffect(() => {
    if (!pending) return;
    report(id, true);
    return () => report(id, false);
  }, [id, pending, report]);
  return (
    <span className="portal-pending-mark" data-pending={pending || undefined} aria-hidden="true" />
  );
}
