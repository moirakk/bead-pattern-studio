export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "bead-pattern-studio",
      persistence: "device-local",
      cloudDatabase: false,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
