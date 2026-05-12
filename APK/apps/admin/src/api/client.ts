import type {
  AdminDrawer,
  AdminListResponse,
  AdminRule,
  AdminUser,
  ApiErrorResponse,
  AuthLoginResponse,
  AuthProfile,
  CreateOwnerPayload,
  ManufacturerCabinetsResponse,
  ManufacturerDashboardResponse,
  ManufacturerOwnersResponse,
  RegisterCabinetPayload,
  UpdateAdminDrawerPayload,
  UpdateAdminRulePayload,
  UpdateAdminUserPayload,
  UpsertAdminDrawerPayload,
  UpsertAdminRulePayload,
  UpsertAdminUserPayload
} from "../types/api";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor(message: string, status: number, code = "api_error", requestId = "") {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/, "");

type RequestInitExt = RequestInit & {
  token?: string;
};

type RequestPolicy = {
  retries?: number;
  timeoutMs?: number;
};

const toApiError = (status: number, payload: ApiErrorResponse): ApiError =>
  new ApiError(payload.message || `Request failed with status ${status}`, status, payload.error || "api_error", payload.request_id || "");

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isLikelyNetworkError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("networkerror") ||
    msg.includes("timed out") ||
    msg.includes("abort")
  );
};

export class SmartLockerApiClient {
  readonly baseUrl: string;
  private token = "";

  constructor(baseUrl: string, token = "") {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private async request<T>(path: string, init: RequestInitExt = {}, policy: RequestPolicy = {}): Promise<T> {
    const retries = Math.max(0, policy.retries ?? 2);
    const timeoutMs = Math.max(500, policy.timeoutMs ?? 9000);
    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const headers = new Headers(init.headers || {});
      if (!headers.has("Content-Type") && init.body !== undefined) {
        headers.set("Content-Type", "application/json");
      }
      const bearer = init.token ?? this.token;
      if (bearer) {
        headers.set("Authorization", `Bearer ${bearer}`);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers,
          signal: controller.signal
        });

        const text = await response.text();
        const json = text ? (JSON.parse(text) as T | ApiErrorResponse) : ({} as T);

        if (!response.ok) {
          const apiErr = toApiError(response.status, json as ApiErrorResponse);
          const retryableStatus = response.status >= 500 || response.status === 429;
          if (retryableStatus && attempt < retries) {
            await sleep(350 * (attempt + 1));
            continue;
          }
          throw apiErr;
        }

        return json as T;
      } catch (err) {
        if (err instanceof ApiError) {
          lastError = err;
          throw err;
        }

        if (isLikelyNetworkError(err) && attempt < retries) {
          await sleep(450 * (attempt + 1));
          continue;
        }

        const message = isLikelyNetworkError(err)
          ? "Network unavailable or request timeout. Check internet and try again."
          : err instanceof Error
            ? err.message
            : "Request failed";
        lastError = new ApiError(message, 0, isLikelyNetworkError(err) ? "network_error" : "request_error");
        throw lastError;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError ?? new ApiError("Request failed", 0, "request_error");
  }

  async health(): Promise<{ ok: boolean; service: string; ts: number }> {
    return this.request("/health");
  }

  async login(identifier: string, password: string): Promise<AuthLoginResponse> {
    return this.request<AuthLoginResponse>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password })
    });
  }

  async me(): Promise<{ ok: boolean; profile: AuthProfile }> {
    return this.request<{ ok: boolean; profile: AuthProfile }>("/v1/auth/me", {
      method: "GET"
    });
  }

  async dashboard(): Promise<ManufacturerDashboardResponse> {
    return this.request<ManufacturerDashboardResponse>("/v1/manufacturer/dashboard", {
      method: "GET"
    });
  }

  async cabinets(): Promise<ManufacturerCabinetsResponse> {
    return this.request<ManufacturerCabinetsResponse>("/v1/manufacturer/cabinets", {
      method: "GET"
    });
  }

  async owners(): Promise<ManufacturerOwnersResponse> {
    return this.request<ManufacturerOwnersResponse>("/v1/manufacturer/owners", {
      method: "GET"
    });
  }

  async registerCabinet(payload: RegisterCabinetPayload): Promise<{ ok: boolean; cabinet_id: string }> {
    return this.request<{ ok: boolean; cabinet_id: string }>("/v1/manufacturer/cabinets/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async createOwner(payload: CreateOwnerPayload): Promise<{ ok: boolean; owner_user_id: string }> {
    return this.request<{ ok: boolean; owner_user_id: string }>("/v1/manufacturer/owners", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async assignOwner(cabinetId: string, ownerUserId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/v1/manufacturer/cabinets/${encodeURIComponent(cabinetId)}/assign-owner`, {
      method: "POST",
      body: JSON.stringify({ owner_user_id: ownerUserId })
    });
  }

  async listAdminUsers(tenantId: string, cabinetId: string): Promise<AdminListResponse<{ users: AdminUser[] }>> {
    const q = new URLSearchParams({ tenant_id: tenantId, cabinet_id: cabinetId });
    return this.request(`/v1/admin/users?${q.toString()}`, { method: "GET" });
  }

  async createAdminUser(payload: UpsertAdminUserPayload): Promise<{ ok: boolean; user_id: string; config_version: number }> {
    return this.request("/v1/admin/users", { method: "POST", body: JSON.stringify(payload) });
  }

  async updateAdminUser(userId: string, payload: UpdateAdminUserPayload): Promise<{ ok: boolean; user_id: string; config_version: number }> {
    return this.request(`/v1/admin/users/${encodeURIComponent(userId)}`, { method: "PUT", body: JSON.stringify(payload) });
  }

  async deleteAdminUser(userId: string, tenantId: string, cabinetId: string): Promise<{ ok: boolean; user_id: string; config_version: number }> {
    const q = new URLSearchParams({ tenant_id: tenantId, cabinet_id: cabinetId });
    return this.request(`/v1/admin/users/${encodeURIComponent(userId)}?${q.toString()}`, { method: "DELETE" });
  }

  async listAdminRules(tenantId: string, cabinetId: string): Promise<AdminListResponse<{ rules: AdminRule[] }>> {
    const q = new URLSearchParams({ tenant_id: tenantId, cabinet_id: cabinetId });
    return this.request(`/v1/admin/rules?${q.toString()}`, { method: "GET" });
  }

  async createAdminRule(payload: UpsertAdminRulePayload): Promise<{ ok: boolean; rule_id: string; config_version: number }> {
    return this.request("/v1/admin/rules", { method: "POST", body: JSON.stringify(payload) });
  }

  async updateAdminRule(ruleId: string, payload: UpdateAdminRulePayload): Promise<{ ok: boolean; rule_id: string; config_version: number }> {
    return this.request(`/v1/admin/rules/${encodeURIComponent(ruleId)}`, { method: "PUT", body: JSON.stringify(payload) });
  }

  async deleteAdminRule(ruleId: string, tenantId: string, cabinetId: string): Promise<{ ok: boolean; rule_id: string; config_version: number }> {
    const q = new URLSearchParams({ tenant_id: tenantId, cabinet_id: cabinetId });
    return this.request(`/v1/admin/rules/${encodeURIComponent(ruleId)}?${q.toString()}`, { method: "DELETE" });
  }

  async listAdminDrawers(tenantId: string, cabinetId: string): Promise<AdminListResponse<{ drawers: AdminDrawer[] }>> {
    const q = new URLSearchParams({ tenant_id: tenantId, cabinet_id: cabinetId });
    return this.request(`/v1/admin/drawers?${q.toString()}`, { method: "GET" });
  }

  async createAdminDrawer(payload: UpsertAdminDrawerPayload): Promise<{ ok: boolean; drawer_id: number; config_version: number }> {
    return this.request("/v1/admin/drawers/map", { method: "POST", body: JSON.stringify(payload) });
  }

  async updateAdminDrawer(drawerId: number, payload: UpdateAdminDrawerPayload): Promise<{ ok: boolean; drawer_id: number; config_version: number }> {
    return this.request(`/v1/admin/drawers/${encodeURIComponent(String(drawerId))}`, { method: "PUT", body: JSON.stringify(payload) });
  }

  async deleteAdminDrawer(drawerId: number, tenantId: string, cabinetId: string): Promise<{ ok: boolean; drawer_id: number; config_version: number }> {
    const q = new URLSearchParams({ tenant_id: tenantId, cabinet_id: cabinetId });
    return this.request(`/v1/admin/drawers/${encodeURIComponent(String(drawerId))}?${q.toString()}`, { method: "DELETE" });
  }

  async fetchAdminCabinetConfig(
    tenantId: string,
    cabinetId: string
  ): Promise<{ ok: boolean; tenant_id: string; cabinet_id: string; config_version: number; users: AdminUser[]; rules: AdminRule[]; drawers: AdminDrawer[] }> {
    const q = new URLSearchParams({ tenant_id: tenantId, cabinet_id: cabinetId });
    return this.request(`/v1/admin/cabinet/config?${q.toString()}`, { method: "GET" });
  }
}
