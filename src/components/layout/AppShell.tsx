import { Link, useRouterState } from "@tanstack/react-router";
import { Home, BookOpen, GraduationCap, Settings, ChartNoAxesColumnIncreasing } from "lucide-react";
import { SyncStatusIndicator } from "@/components/sync/SyncStatusIndicator";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/", label: "Início", Icon: Home },
  { to: "/estudar", label: "Estudar", Icon: GraduationCap },
  { to: "/progresso", label: "Progresso", Icon: ChartNoAxesColumnIncreasing },
  { to: "/aulas", label: "Aulas", Icon: BookOpen },
  { to: "/config", label: "Ajustes", Icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-40 bg-gradient-brand opacity-[0.08]"
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-28 pt-4 sm:max-w-lg">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pb-3">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 rounded-xl"
            aria-label="Trilha — ir para o início"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-brand font-display text-sm font-bold text-primary-foreground shadow-float">
              T
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-bold leading-tight">
                Trilha
              </span>
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                English Review
              </span>
            </span>
          </Link>
        </header>
        <SyncStatusIndicator />
        <main className="flex-1">{children}</main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        aria-label="Navegação principal"
      >
        <div className="mx-auto flex max-w-md sm:max-w-lg">
          {NAV_ITEMS.map(({ to, label, Icon }) => {
            const active = pathname === to || (to !== "/" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`grid h-7 w-10 place-items-center rounded-full transition-colors ${
                    active ? "bg-primary-soft" : "bg-transparent"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
