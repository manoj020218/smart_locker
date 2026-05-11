import type { AuthRole } from "../../shared/auth.js";

export type AuthUserStatus = "active" | "inactive" | "blocked";

export type AuthUserDoc = {
  user_id: string;
  display_name: string;
  email?: string;
  email_lower?: string;
  mobile?: string;
  password_hash: string;
  role: AuthRole;
  status: AuthUserStatus;
  tenant_id: string;
  manufacturer_id?: string;
  owner_id?: string;
  cabinet_ids?: string[];
  must_change_password?: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
};
