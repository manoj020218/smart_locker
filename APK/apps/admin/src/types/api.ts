export type AuthProfile = {
  user_id: string;
  display_name: string;
  email: string;
  mobile: string;
  role: string;
  tenant_id: string;
  status: string;
  manufacturer_id: string;
  owner_id: string;
  cabinet_ids: string[];
  must_change_password: boolean;
};

export type AuthLoginResponse = {
  ok: boolean;
  token: string;
  token_type: string;
  expires_in_sec: number;
  profile: AuthProfile;
  dashboard_route: string;
  permissions?: string[];
  allowed_permissions?: string[];
};

export type ApiErrorResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  details?: unknown;
  request_id?: string;
};

export type ManufacturerDashboardResponse = {
  ok: boolean;
  manufacturer_id: string;
  stats: {
    total_cabinets: number;
    online_cabinets: number;
    offline_cabinets: number;
    never_seen_cabinets: number;
    last_seen_ts: number;
  };
};

export type CabinetHealthRow = {
  cabinet_id: string;
  cabinet_name: string;
  location_name: string;
  mode: string;
  total_lockers: number;
  owner_id: string;
  device_id: string;
  firmware_version: string;
  last_seen_ts: number;
  health_status: "online" | "offline" | "never_seen";
};

export type ManufacturerCabinetsResponse = {
  ok: boolean;
  manufacturer_id: string;
  cabinets: CabinetHealthRow[];
};

export type ManufacturerOwnersResponse = {
  ok: boolean;
  manufacturer_id: string;
  owners: Array<{
    owner_user_id: string;
    owner_id: string;
    display_name: string;
    email: string;
    mobile: string;
    status: "active" | "inactive" | "blocked";
    tenant_id: string;
    cabinet_ids: string[];
    last_login_ts: number;
    updated_ts: number;
  }>;
};

export type RegisterCabinetPayload = {
  cabinet_id: string;
  cabinet_name: string;
  location_name: string;
  total_lockers: number;
  mode: "DEMO" | "COMMERCIAL";
  access_modes: Array<"WIEGAND" | "QR_MEMBER" | "QR_CABINET" | "FACE" | "PAID_PUBLIC">;
};

export type CreateOwnerPayload = {
  display_name: string;
  email: string;
  mobile?: string;
  password: string;
  status?: "active" | "inactive" | "blocked";
  cabinet_ids?: string[];
  must_change_password?: boolean;
};

export type UpdateOwnerPayload = {
  display_name?: string;
  email?: string;
  mobile?: string;
  password?: string;
  status?: "active" | "inactive" | "blocked";
  cabinet_ids?: string[];
  must_change_password?: boolean;
};

export type AppSession = {
  baseUrl: string;
  token: string;
  identifier: string;
  manufacturerId: string;
  tenantId: string;
  role?: string;
  permissions?: string[];
  cabinetIds?: string[];
  ownerId?: string;
  displayName?: string;
};

export type AdminUser = {
  user_id: string;
  tenant_id: string;
  cabinet_id: string;
  display_name: string;
  card_id?: string;
  face_id?: string;
  drawer_id?: number | null;
  valid_from?: number;
  valid_to?: number;
  payment_required?: boolean;
};

export type AdminRule = {
  rule_id: string;
  tenant_id: string;
  cabinet_id: string;
  user_id: string;
  drawer_id: number;
  valid_from: number;
  valid_to: number;
  cooldown_sec: number;
  payment_required: boolean;
};

export type AdminDrawer = {
  tenant_id: string;
  cabinet_id: string;
  drawer_id: number;
  board_address: number;
  lock_address: number;
  label?: string;
};

export type AdminListResponse<T> = {
  ok: boolean;
  tenant_id: string;
  cabinet_id: string;
} & T;

export type UpsertAdminUserPayload = {
  tenant_id: string;
  cabinet_id: string;
  user_id?: string;
  display_name: string;
  card_id?: string;
  face_id?: string;
  drawer_id?: number;
  valid_from?: number;
  valid_to?: number;
  payment_required?: boolean;
};

export type UpdateAdminUserPayload = {
  tenant_id: string;
  cabinet_id: string;
  display_name?: string;
  card_id?: string;
  face_id?: string;
  drawer_id?: number | null;
  valid_from?: number;
  valid_to?: number;
  payment_required?: boolean;
};

export type UpsertAdminRulePayload = {
  tenant_id: string;
  cabinet_id: string;
  rule_id?: string;
  user_id: string;
  drawer_id: number;
  valid_from?: number;
  valid_to?: number;
  cooldown_sec?: number;
  payment_required?: boolean;
};

export type UpdateAdminRulePayload = {
  tenant_id: string;
  cabinet_id: string;
  user_id?: string;
  drawer_id?: number;
  valid_from?: number;
  valid_to?: number;
  cooldown_sec?: number;
  payment_required?: boolean;
};

export type UpsertAdminDrawerPayload = {
  tenant_id: string;
  cabinet_id: string;
  drawer_id: number;
  board_address: number;
  lock_address: number;
  label?: string;
};

export type UpdateAdminDrawerPayload = {
  tenant_id: string;
  cabinet_id: string;
  board_address?: number;
  lock_address?: number;
  label?: string;
};
