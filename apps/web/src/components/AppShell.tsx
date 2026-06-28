import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function AppShell({
  title,
  subtitle,
  children,
  className = ""
}: AppShellProps) {
  return (
    <div className={`app-shell ${className}`}>
      <header className="app-header">
        <div>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <span className="coach-avatar" aria-hidden="true">
          C
        </span>
      </header>
      <main className="app-main">{children}</main>
      <BottomNav />
    </div>
  );
}
