import { Link, useRouterState } from "@tanstack/react-router";
import { Home, BookOpen, Settings } from "lucide-react";
import { WRITES_ENABLED } from "@/lib/supabase";
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
        {!WRITES_ENABLED && (
          <div
            role="status"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            Modo de teste: seu progresso desta sessão fica salvo apenas neste dispositivo.
          </div>
        )}
        <main className="flex-1">{children}</main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        aria-label="Navegação principal"
      >
        <div className="mx-auto flex max-w-md">
          {item("/", "Início", Home)}
          {item("/aulas", "Aulas", BookOpen)}
          {item("/config", "Ajustes", Settings)}
        </div>
      </nav>
    </div>
  );
}
