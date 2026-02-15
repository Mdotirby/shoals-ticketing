export type AdminUser = {
  id: string;
  email: string;
  role: "owner" | "super_admin" | "venue_admin" | "promoter" | "full_admin" | "box_office";
  venue_id?: string | null;
  must_change_password: boolean;
  created_at: string;
};
