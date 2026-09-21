"use client";

import { createContext, useContext } from "react";

/**
 * Who the admin layout thinks the user is, for pages that need the same
 * visibility answer the sidebar gives — a merged page shows only the tabs its
 * user may open, decided by the same role and sidebar_permissions rows.
 * Provided by app/admin/layout.tsx, which already loads both.
 */
export type AdminNavState = {
  role: string;
  perms: Record<string, boolean> | null;
};

const AdminNavContext = createContext<AdminNavState>({ role: "", perms: null });

export const AdminNavProvider = AdminNavContext.Provider;

export function useAdminNav(): AdminNavState {
  return useContext(AdminNavContext);
}
