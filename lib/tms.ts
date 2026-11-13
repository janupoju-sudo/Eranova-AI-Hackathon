/** Server-side TMS transport. Never import this module into a client component. */
export type TmsResult<T> = { ok: true; result: T } | { ok: false; status: number; error: string; detail: unknown };
export type Params = Record<string, string | number | boolean | undefined>;
export interface Page<T> { items: T[]; next_cursor: string | null }
export interface TmsOptions {
  baseUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

export function createTmsClient(options: TmsOptions = {}) {
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = 0;
  const now = options.now ?? (() => new Date());
  async function request<T>(method: string, path: string, body?: unknown, params: Params = {}): Promise<TmsResult<T>> {
    const task = queue.then(async (): Promise<TmsResult<T>> => {
      const base = options.baseUrl ?? process.env.TMS_API_BASE;
      const key = options.apiKey ?? process.env.TMS_API_KEY;
      if (!base || !key) return { ok: false, status: 0, error: "TMS_NOT_CONFIGURED", detail: "Set TMS_API_BASE and TMS_API_KEY in .env.local." };
      const read = method === "GET" || (method === "POST" && ["/rate-engine/quotes", "/quotes/price-preview"].includes(path));
      if (!read && now().getTime() < Date.parse("2026-11-13T13:20:00-05:00"))
        return { ok: false, status: 403, error: "READ_ONLY_PHASE", detail: "Shipment writes are blocked until November 13, 2026 at 1:20 PM America/New_York." };
      try {
        if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid relative API path");
        const url = new URL(base.replace(/\/$/, "") + path);
        for (const [name, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(name, String(value));
        await new Promise(resolve => setTimeout(resolve, Math.max(0, 150 - (Date.now() - lastStart))));
        lastStart = Date.now();
        const response = await (options.fetch ?? fetch)(url, {
          method, headers: { "x-api-key": key, "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000),
          redirect: "error",
        });
        const raw = await response.text();
        let data: unknown;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: "Non-JSON response from TMS" }; }
        if (!response.ok) {
          const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
          return { ok: false, status: response.status, error: typeof record.error === "string" ? record.error : `HTTP_${response.status}`, detail: data };
        }
        return { ok: true, result: data as T };
      } catch {
        // Do not leak request headers, URLs, or secrets through network error messages.
        return { ok: false, status: 0, error: "TMS_REQUEST_FAILED", detail: "TMS request failed, timed out, or returned an invalid redirect." };
      }
    });
    queue = task.catch(() => undefined);
    return task;
  }
  async function paginate<T>(path: string, params: Params = {}, maxPages = 10): Promise<TmsResult<T[]>> {
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50)
      return { ok: false, status: 400, error: "INVALID_PAGE_LIMIT", detail: "Use 1–50 pages." };
    const items: T[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const response = await request<Page<T>>("GET", path, undefined, { ...params, limit: params.limit ?? 100, cursor });
      if (!response.ok) return response;
      if (!response.result || !Array.isArray(response.result.items))
        return { ok: false, status: 502, error: "INVALID_PAGE", detail: "Expected { items, next_cursor }. Verify the API schema." };
      items.push(...response.result.items);
      const next = response.result.next_cursor;
      if (next === null || next === undefined) return { ok: true, result: items };
      if (typeof next !== "string" || seen.has(next)) return { ok: false, status: 502, error: "INVALID_CURSOR", detail: "TMS returned an invalid or repeated cursor." };
      seen.add(next); cursor = next;
    }
    return { ok: false, status: 422, error: "PAGE_LIMIT", detail: "Pagination cap reached; narrow the filters instead of scanning all records." };
  }
  const id = encodeURIComponent;
  return {
    request, paginate,
    getShipment: <T = unknown>(shipmentId: string) => request<T>("GET", `/shipments/${id(shipmentId)}`),
    listShipments: <T = unknown>(filters: Params = {}) => paginate<T>("/shipments", filters),
    getFacility: <T = unknown>(facilityId: string) => request<T>("GET", `/facilities/${id(facilityId)}`),
    getFacilityShipments: <T = unknown>(facilityId: string, filters: Params = {}) => paginate<T>(`/facilities/${id(facilityId)}/shipments`, filters),
    getCustomer: <T = unknown>(customerId: string) => request<T>("GET", `/customers/${id(customerId)}`),
    listVendors: <T = unknown>(filters: Params = {}) => paginate<T>("/vendors", filters),
    getVendor: <T = unknown>(vendorId: string) => request<T>("GET", `/vendors/${id(vendorId)}`),
    rateEngine: <T = unknown>(body: unknown) => request<T>("POST", "/rate-engine/quotes", body),
    cover: (shipmentId: string, body: unknown) => request("POST", `/shipments/${id(shipmentId)}/cover`, body),
    uncover: (shipmentId: string, body: unknown = { reason: "OTHER", note: "demo reset" }) => request("POST", `/shipments/${id(shipmentId)}/uncover`, body),
    addCost: (shipmentId: string, body: unknown) => request("POST", `/shipments/${id(shipmentId)}/costs`, body),
    updateCost: (shipmentId: string, costId: string, body: unknown) => request("PUT", `/shipments/${id(shipmentId)}/costs/${id(costId)}`, body),
    generateRateCon: (shipmentId: string) => request("POST", `/shipments/${id(shipmentId)}/documents/generate`, { doc_type: "RATE_CONFIRMATION" }),
    dispatch: (shipmentId: string, body: unknown) => request("POST", `/shipments/${id(shipmentId)}/dispatch`, body),
    setAppointment: (shipmentId: string, stopSeq: number, body: unknown) => request("PUT", `/shipments/${id(shipmentId)}/stops/${stopSeq}/appointment`, body),
    addShipmentNote: (shipmentId: string, text: string) => request("POST", `/shipments/${id(shipmentId)}/notes`, { note: text }),
    addFacilityNote: (facilityId: string, text: string) => request("POST", `/facilities/${id(facilityId)}/notes`, { text }),
  };
}

export const tms = createTmsClient();
export const { request, paginate, getShipment, listShipments, getFacility, getFacilityShipments, getCustomer, listVendors, getVendor, rateEngine, cover, uncover, addCost, updateCost, generateRateCon, dispatch, setAppointment, addShipmentNote, addFacilityNote } = tms;
