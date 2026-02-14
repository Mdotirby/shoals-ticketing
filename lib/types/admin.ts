export type AdminUser = {
  id: string;
  email: string;
  role: "full_admin" | "box_office";
  must_change_password: boolean;
  created_at: string;
};
