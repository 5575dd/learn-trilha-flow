import { createFileRoute } from "@tanstack/react-router";

import { POST as translateLines } from "@/features/music/server/translate";

export const Route = createFileRoute("/api/translate")({
  server: {
    handlers: {
      POST: ({ request }) => translateLines(request),
    },
  },
});
