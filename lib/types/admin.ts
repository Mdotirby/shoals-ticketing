export type AdminUser = {
  id: string;
  email: string;
  role: "owner" | "super_admin" | "venue_admin" | "promoter" | "full_admin" | "box_office" | "read_only" | "door_greeter" | "artist" | "partner";
  venue_id?: string | null;
  must_change_password: boolean;
  created_at: string;
};
