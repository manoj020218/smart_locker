import type {
  ApiErrorResponse,
  AuthLoginResponse,
  AuthProfile,
  CreateOwnerPayload,
  ManufacturerCabinetsResponse,
  ManufacturerDashboardResponse,
  ManufacturerOwnersResponse,
  RegisterCabinetPayload
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

const toApiError = (status: number, payload: ApiErrorResponse): ApiError =>
  new ApiError(payload.message || `Request failed with status ${status}`, status, payload.error || "api_error", payload.request_id || "");

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

  private async request<T>(path: string, init: RequestInitExt = {}): Promise<T> {
    const headers = new Headers(init.headers || {});
    if (!headers.has("Content-Type") && init.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    const bearer = init.token ?? this.token;
    if (bearer) {
      headers.set("Authorization", `Bearer ${bearer}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers
    });

    const text = await response.text();
    const json = text ? (JSON.parse(text) as T | ApiErrorResponse) : ({} as T);

    if (!response.ok) {
      throw toApiError(response.status, json as ApiErrorResponse);
    }

    return json as T;
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
}
