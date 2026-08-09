function base64Url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function GET(request: Request) {
  const verifier = new URL(request.url).searchParams.get("verifier");
  if (!verifier || verifier.length < 43 || verifier.length > 128) {
    return Response.json({ error: "Verificador inválido." }, { status: 400 });
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Response.json({ challenge: base64Url(digest) });
}
