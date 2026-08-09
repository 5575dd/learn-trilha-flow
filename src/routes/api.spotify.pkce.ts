import { createFileRoute } from "@tanstack/react-router";

import { GET as createPkceChallenge } from "@/features/music/server/spotifyPkce";

export const Route = createFileRoute("/api/spotify/pkce")({
  server: {
    handlers: {
      GET: ({ request }) => createPkceChallenge(request),
    },
  },
});
