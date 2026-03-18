"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Legacy redirect — seats page now lives at /events/[id]/seating */
export default function SeatsRedirect() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  useEffect(() => {
    router.replace(`/events/${eventId}/seating`);
  }, [eventId, router]);

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#a1a1aa" }}>Redirecting to seating…</p>
    </main>
  );
}
