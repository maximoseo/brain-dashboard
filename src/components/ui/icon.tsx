import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "activity" | "agent" | "alert" | "arrow" | "box" | "brain" | "check"
  | "chevron" | "dashboard" | "database" | "external" | "filter" | "grid"
  | "menu" | "memory" | "process" | "refresh" | "search" | "server" | "x";

const paths: Record<IconName, ReactNode> = {
  activity: <><path d="M3 12h4l2.5-7 5 14 2.5-7h4" /></>,
  agent: <><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M9 12h.01M15 12h.01M9 16h6M12 7V4M9 4h6" /></>,
  alert: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  box: <><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z" /><path d="m4 7 8 4 8-4M12 11v10" /></>,
  brain: <><path d="M9.5 4.5A3 3 0 0 0 5 7a3 3 0 0 0 .5 5.5A3 3 0 0 0 9 18a3 3 0 0 0 3-3V7a3 3 0 0 0-2.5-2.5ZM14.5 4.5A3 3 0 0 1 19 7a3 3 0 0 1-.5 5.5A3 3 0 0 1 15 18a3 3 0 0 1-3-3" /><path d="M8 9h4M16 9h-4M8 14h4M16 14h-4" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  chevron: <><path d="m9 18 6-6-6-6" /></>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
  filter: <><path d="M4 5h16M7 12h10M10 19h4" /></>,
  grid: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  memory: <><path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M9 4v4M15 4v4M8 13h8M8 17h5" /></>,
  process: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 6h5a5 5 0 0 1 5 5v5M16 18h-5a5 5 0 0 1-5-5V8" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M18.5 9A7 7 0 0 0 6 6l-2 2M5.5 15A7 7 0 0 0 18 18l2-2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  server: <><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01" /></>,
  x: <><path d="m6 6 12 12M18 6 6 18" /></>,
};

export function Icon({ name, size = 20, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" {...props}>
      {paths[name]}
    </svg>
  );
}
