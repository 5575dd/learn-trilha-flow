import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, Trash2 } from "lucide-react";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/auth/AuthContext";

export const Route = createFileRoute("/config")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ajustes da conta — Trilha English Review" },
      {
        name: "description",
        content:
          "Gerencie sua conta Trilha: limpe o progresso salvo neste dispositivo ou saia com segurança.",
      },
      { property: "og:title", content: "Ajustes da conta — Trilha English Review" },
      {
        property: "og:description",
        content: "Gerencie sua conta Trilha e o progresso salvo neste dispositivo.",
      },
    ],
  }),
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
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold">Ajustes</h1>
        <p className="truncate text-sm text-muted-foreground">{session?.user?.email ?? ""}</p>
      </header>

      <section className="space-y-3 rounded-3xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold text-muted-foreground">Dados deste dispositivo</h2>
        <p className="text-sm text-muted-foreground">
          Remove sessões e tentativas guardadas localmente neste aparelho.
        </p>
        <button
          type="button"
          onClick={clearLocal}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background text-sm font-semibold transition-colors hover:bg-muted"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Limpar progresso local
        </button>
      </section>

      <section className="space-y-3 rounded-3xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold text-muted-foreground">Conta</h2>
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-destructive text-sm font-semibold text-destructive-foreground transition-transform active:scale-[0.99]"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sair
        </button>
      </section>
    </div>
  );
}
