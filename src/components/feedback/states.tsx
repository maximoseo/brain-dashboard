import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

export function LoadingState({ label = "Loading data…", count = 6 }: { label?: string; count?: number }) {
  return (
    <div className="state-region" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="skeleton-grid" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <div className="skeleton-line skeleton-short" />
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-medium" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="feedback-state error-state" role="alert">
      <span className="state-icon"><Icon name="alert" size={22} /></span>
      <div>
        <h2>We couldn’t load this view</h2>
        <p>{message}</p>
      </div>
      {onRetry && <button className="button secondary" type="button" onClick={onRetry}><Icon name="refresh" size={17} />Try again</button>}
    </div>
  );
}

export function EmptyState({ icon = "box", title, description, action }: { icon?: IconName; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="feedback-state empty-state" role="status">
      <span className="state-icon"><Icon name={icon} size={24} /></span>
      <div><h2>{title}</h2><p>{description}</p></div>
      {action}
    </div>
  );
}

export function InlineNotice({ children, tone = "warning" }: { children: ReactNode; tone?: "warning" | "info" }) {
  return <div className={`inline-notice ${tone}`} role="status"><Icon name={tone === "warning" ? "alert" : "activity"} size={18} /><span>{children}</span></div>;
}
