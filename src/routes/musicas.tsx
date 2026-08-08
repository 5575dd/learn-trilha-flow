import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { MusicModuleHost } from "@/features/music/MusicModuleHost";

export const Route = createFileRoute("/musicas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Aprender inglês com músicas — Trilha" },
      {
        name: "description",
        content:
          "Aprenda inglês ouvindo músicas reais, acompanhando a letra e completando palavras úteis.",
      },
    ],
  }),
  component: MusicRoute,
});

function MusicRoute() {
  const [immersive, setImmersive] = useState(false);

  return (
    <RequireAuth>
      <AppShell immersive={immersive} hideHeader>
        <MusicModuleHost onImmersiveChange={setImmersive} />
      </AppShell>
    </RequireAuth>
  );
}
