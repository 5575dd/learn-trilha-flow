import { Link, useRouterState } from "@tanstack/react-router";
import { Home, BookOpen, GraduationCap, Settings, ChartNoAxesColumnIncreasing } from "lucide-react";
import { SyncStatusIndicator } from "@/components/sync/SyncStatusIndicator";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const item = (to: string, label: string, Icon: typeof Home) => {
    const active = pathname === to || (to !== "/" && pathname.startsWith(to));
    return (
      <Link
        to={to}
        className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs ${
          active ? "text-purple-700" : "text-slate-500"
        }`}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="h-5 w-5" aria-hidden />
        <span>{label}</span>
      </Link>
    );
  };
  return (
    <div className="min-h-screen bg-[#faf9fc] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-24 pt-4">
        <SyncStatusIndicator />
        <main className="flex-1">{children}</main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        aria-label="Navegação principal"
      >
        <div className="mx-auto flex max-w-md">
          {item("/", "Início", Home)}
          {item("/estudar", "Estudar", GraduationCap)}
          {item("/progresso", "Progresso", ChartNoAxesColumnIncreasing)}
          {item("/aulas", "Aulas", BookOpen)}
          {item("/config", "Ajustes", Settings)}
        </div>
      </nav>
    </div>
  );
}
