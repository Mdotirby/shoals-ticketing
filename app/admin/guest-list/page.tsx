"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GuestListRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/guest-lists");
  }, [router]);

  return (
    <div className="admin-form-page">
      <p style={{ color: "rgba(255,255,255,0.5)" }}>Redirecting…</p>
    </div>
  );
}
