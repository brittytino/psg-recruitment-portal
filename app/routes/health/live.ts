/** Liveness: the process is running and serving requests. No dependency checks, no details. */
export function loader() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
