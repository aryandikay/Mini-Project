import { AppError, invalid } from "../utils/errors.js";
import { integer, text } from "../utils/validation.js";

export function selectedVenue(value, preferredVenueId) {
  if (value === undefined) return undefined;
  const venueId = integer(value, "selectedVenueId", 1);
  if (venueId !== preferredVenueId)
    invalid("The selected venue must be the proposed preferred venue.");
  return venueId;
}

export function confirmationKey(body, venueId) {
  if (venueId === undefined) {
    if (body.confirmationKey !== undefined) invalid("confirmationKey requires selectedVenueId.");
    return undefined;
  }
  return text(body.confirmationKey, "confirmationKey", 100);
}

export function requireSelectedVenue(decision, venueId) {
  if (venueId === undefined || (decision.feasible && decision.allocatedVenueId === venueId)) return;
  const error = new AppError(409, "ALTERNATIVE_UNAVAILABLE",
    "The selected alternative is no longer available in that venue. Refresh alternatives and try again.");
  error.details = { reasons: decision.reasons, selectedVenueId: venueId };
  throw error;
}
