import { createFileRoute } from "@tanstack/react-router";

import { GET as getLyrics } from "@/features/music/server/lyrics";

export const Route = createFileRoute("/api/lyrics")({
  server: {
    handlers: {
      GET: ({ request }) => getLyrics(request),
    },
  },
});
