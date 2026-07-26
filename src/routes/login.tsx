import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar na Trilha — English Review" },
      {
        name: "description",
        content:
          "Acesse sua conta Trilha para revisar aulas de inglês, praticar atividades e acompanhar seu progresso.",
      },
      { property: "og:title", content: "Entrar na Trilha — English Review" },
      {
        property: "og:description",
        content: "Acesse sua conta Trilha para revisar aulas de inglês e acompanhar seu progresso.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) void navigate({ to: "/" });
  }, [session, loading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(err);
  }

  return (
    <div className="relative flex min-h-dvh flex-col justify-center bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-brand opacity-[0.12]"
      />
      <main className="relative mx-auto w-full max-w-md">
        <header className="mb-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-brand font-display text-2xl font-bold text-primary-foreground shadow-float">
            T
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold">Trilha</h1>
          <p className="text-sm font-medium text-muted-foreground">English Review</p>
          <p className="mx-auto mt-3 max-w-xs text-sm text-muted-foreground text-balance-tight">
            Transforme cada aula em uma trilha de revisão prática, visual e inteligente.
          </p>
        </header>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-card"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-12 w-full rounded-2xl border border-input bg-background px-4 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-12 w-full rounded-2xl border border-input bg-background px-4 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-destructive-soft p-3 text-sm font-medium text-destructive-soft-foreground"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="min-h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-float transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            {submitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </main>
    </div>
  );
}
