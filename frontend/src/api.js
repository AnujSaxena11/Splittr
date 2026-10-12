export const API_BASE = (import.meta.env?.VITE_API_URL || "/api").replace(/\/$/, "");
let csrfToken;

const refreshExemptPaths = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/google/native",
  "/auth/refresh",
  "/auth/forgetPassword",
  "/auth/verifyOTP",
]);

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function getCsrfToken(forceRefresh = false) {
  if (csrfToken && !forceRefresh) return csrfToken;
  let response;
  try {
    response = await fetch(`${API_BASE}/auth/csrf`, { credentials: "include" });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : "Unable to obtain a security token.",
      0,
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.csrfToken !== "string") {
    throw new ApiError(payload?.message || "Unable to obtain a security token.", response.status);
  }
  csrfToken = payload.csrfToken;
  return csrfToken;
}

async function request(path, options = {}, hasRetried = false, csrfRetried = false) {
  const headers = new Headers(options.headers || {});
  const body = options.body;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const method = (options.method || "GET").toUpperCase();

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }

  if (body !== undefined && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include",
      body: body !== undefined && !isFormData && typeof body !== "string"
        ? JSON.stringify(body)
        : body,
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : "Unable to reach the server. Check your connection and try again.",
      0,
    );
  }

  if (
    response.status === 401 &&
    !hasRetried &&
    !refreshExemptPaths.has(path)
  ) {
    const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": await getCsrfToken() },
    }).catch((error) => {
      throw new ApiError(
        error instanceof Error ? error.message : "Unable to refresh your session.",
        0,
      );
    });

    if (refreshResponse.ok) {
      return request(path, options, true);
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message = payload && typeof payload === "object"
      ? payload.message || payload.error || "The request could not be completed."
      : typeof payload === "string" && payload.trim()
        ? (contentType.includes("text/html") || payload.trimStart().startsWith("<")
          ? `The server returned an unexpected response (HTTP ${response.status}).`
          : payload)
        : "The request could not be completed.";
    if (response.status === 502) {
      throw new ApiError(
        "EzSplittr API is unavailable. Start the backend and check its Redis and database startup configuration.",
        response.status,
      );
    }
    if (
      response.status === 403 &&
      !csrfRetried &&
      typeof message === "string" &&
      message.toLowerCase().includes("csrf")
    ) {
      csrfToken = undefined;
      return request(path, options, hasRetried, true);
    }
    throw new ApiError(message, response.status, payload?.details);
  }

  return payload;
}

export const api = {
  request,
  googleLoginUrl: `${API_BASE}/auth/google`,
  googleNativeSignIn: (body) => request("/auth/google/native", { method: "POST", body }),
  getCsrfToken,
  clearCsrfToken: () => { csrfToken = undefined; },
  signup: (body) => request("/auth/signup", { method: "POST", body }),
  login: (body) => request("/auth/login", { method: "POST", body }),
  logout: () => request("/auth/logout", { method: "POST" }),
  logoutAll: () => request("/auth/logoutAll", { method: "POST" }),
  me: () => request("/auth/me"),
  requestPasswordReset: (body) => request("/auth/forgetPassword", { method: "POST", body }),
  resetPassword: (body) => request("/auth/verifyOTP", { method: "POST", body }),
  listExpenses: () => request("/self/expenses"),
  getExpenseById: (id) => request(`/self/expense/${encodeURIComponent(id)}`),
  createExpense: (body) => request("/self/expense", { method: "POST", body }),
  listGroups: () => request("/group/getMyGroups"),
  getGroup: (id) => request(`/group/getGroupById/${encodeURIComponent(id)}`),
  createGroup: (body) => request("/group/createGroup", { method: "POST", body }),
  joinGroup: (body) => request("/group/joinGroup", { method: "POST", body }),
  approveJoinRequest: (body) => request("/group/acceptJoinRequest", { method: "POST", body }),
  rejectJoinRequest: (body) => request("/group/rejectJoinRequest", { method: "POST", body }),
  leaveGroup: (groupId) => request("/group/leaveGroup", { method: "DELETE", body: { groupId } }),
  deleteGroup: (groupId) => request("/group/deleteGroup", { method: "DELETE", body: { groupId } }),
  listGroupExpenses: (id) => request(`/expense-splitter/get-expenses/${encodeURIComponent(id)}`),
  listGroupSettlements: (id) => request(`/expense-splitter/get-settlements/${encodeURIComponent(id)}`),
  getGroupBalances: (id) => request(`/expense-splitter/get-balances/${encodeURIComponent(id)}`),
  requestGroupSettlement: (id, body) => request(`/expense-splitter/settle/${encodeURIComponent(id)}`, { method: "POST", body }),
  respondToGroupSettlement: (id, accept) => request(`/expense-splitter/settlements/${encodeURIComponent(id)}/respond`, { method: "POST", body: { accept } }),
  createGroupExpense: (id, body) => request(`/expense-splitter/add-expense/${encodeURIComponent(id)}`, { method: "POST", body }),
  getReport: (query) => request(`/reports/expenses?${new URLSearchParams(query)}`),
  getUserById: (id) => request(`/auth/user/${encodeURIComponent(id)}`),
  listNotifications: () => request("/notifications"),
  markNotificationRead: (id) => request(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
  deleteNotification: (id) => request(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" }),
  markAllNotificationsRead: () => request("/notifications/read-all", { method: "POST" }),
};
