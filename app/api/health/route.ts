export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "bead-pattern-studio",
      persistence: "device-local",
      cloudDatabase: false,
      projectBackupVersion: 2,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
