import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/auth/AuthContext";

export const Route = createFileRoute("/config")({
  ssr: false,
  component: ConfigRoute,
});

function ConfigRoute() {
  return (
    <RequireAuth>
      <AppShell>
        <ConfigView />
      </AppShell>
    </RequireAuth>
  );
}

function ConfigView() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    void navigate({ to: "/login" });
  }

  function clearLocal() {
    if (typeof window === "undefined") return;
    Object.keys(window.sessionStorage)
      .filter((k) => k.startsWith("trilha."))
      .forEach((k) => window.sessionStorage.removeItem(k));
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith("trilha."))
      .forEach((k) => window.localStorage.removeItem(k));
    alert("Progresso local limpo.");
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Ajustes</h1>
        <p className="text-sm text-slate-500">{session?.user?.email ?? ""}</p>
      </header>
      <button
        type="button"
        onClick={clearLocal}
        className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
      >
        Limpar progresso local
      </button>
      <button
        type="button"
        onClick={handleSignOut}
        className="min-h-12 w-full rounded-2xl bg-rose-500 text-sm font-semibold text-white"
      >
        Sair
      </button>
    </div>
  );
}
