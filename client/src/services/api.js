async function request(path, options) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch {
    throw new Error(
      "Unable to reach EventSync. Check your connection and try again.",
    );
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      "EventSync returned an unreadable response. Please try again.",
    );
  }
  if (!response.ok) {
    const error = new Error(
      payload.error?.message || "The request could not be completed.",
    );
    error.code = payload.error?.code;
    error.details = payload.error?.details;
    error.status = response.status;
    if (error.code === "AUTH_REQUIRED" && path !== "/auth/me") window.dispatchEvent(new Event("eventsync:unauthorized"));
    throw error;
  }
  if (!Object.hasOwn(payload, "data"))
    throw new Error("EventSync returned an incomplete response.");
  return payload.data;
}
export const api = {
  me: () => request("/auth/me"),
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request("/auth/logout", { method: "POST", body: "{}" }),
  updateProfile: (name) => request("/auth/profile", { method: "PATCH", body: JSON.stringify({ name }) }),
  changePassword: (body) => request("/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
  users: () => request("/users"),
  createStaff: (body) => request("/users", { method: "POST", body: JSON.stringify(body) }),
  userStatus: (id, active) => request(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ active }) }),
  resources: (filters) => request(`/analytics/resources?${new URLSearchParams(filters)}`),
  simulate: (body) => request("/simulation", { method: "POST", body: JSON.stringify(body) }),
  recommendations: (body) => request("/recommendations", { method: "POST", body: JSON.stringify(body) }),
  rescheduleRecommendations: (id, body) => request(`/bookings/${id}/recommendations`, {
    method: "POST", body: JSON.stringify(body),
  }),
  dashboard: () => request("/dashboard"),
  cancel: (id, expectedUpdatedAt) =>
    request(`/bookings/${id}/cancel`, {
      method: "PATCH",
      body: JSON.stringify({ expectedUpdatedAt }),
    }),
  reschedule: (id, body) =>
    request(`/bookings/${id}/reschedule`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  venues: () => request("/venues"),
  clients: () => request("/clients"),
  bookings: (filters) =>
    request(`/bookings${filters ? `?${new URLSearchParams(filters)}` : ""}`),
  booking: (id) => request(`/bookings/${id}`),
  createClient: (data) =>
    request("/clients", { method: "POST", body: JSON.stringify(data) }),
  createBooking: (data) =>
    request("/bookings", { method: "POST", body: JSON.stringify(data) }),
};
