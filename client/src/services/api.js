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
  if (!response.ok)
    throw new Error(
      payload.error?.message || "The request could not be completed.",
    );
  if (!Object.hasOwn(payload, "data"))
    throw new Error("EventSync returned an incomplete response.");
  return payload.data;
}
export const api = {
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
