import test from "node:test";
import assert from "node:assert/strict";
import {
  timeToMinutes,
  minutesToTime,
  reservationInterval,
  validateDate,
} from "../src/utils/time.js";
test("HH:mm conversions are exact", () => {
  assert.equal(timeToMinutes("08:30"), 510);
  assert.equal(timeToMinutes("00:00"), 0);
  assert.equal(timeToMinutes("23:59"), 1439);
  assert.equal(minutesToTime(1290), "21:30");
});
test("malformed times are rejected", () => {
  for (const value of [
    "8:30",
    "24:00",
    "12:60",
    "09:00:00",
    " 09:00",
    900,
    null,
  ])
    assert.throws(() => timeToMinutes(value));
});
test("buffers and inclusive operating boundaries", () => {
  assert.deepEqual(reservationInterval("08:30", "21:30"), {
    startMinute: 510,
    endMinute: 1290,
    reservedStartMinute: 480,
    reservedEndMinute: 1320,
  });
  assert.deepEqual(reservationInterval("10:00", "11:00"), {
    startMinute: 600,
    endMinute: 660,
    reservedStartMinute: 570,
    reservedEndMinute: 690,
  });
});
test("invalid duration and outside buffers fail", () => {
  for (const times of [
    ["08:29", "10:00"],
    ["10:00", "21:31"],
    ["10:00", "10:00"],
    ["11:00", "10:00"],
    ["23:00", "01:00"],
  ])
    assert.throws(() => reservationInterval(...times));
});
test("calendar dates validate without timezone conversion", () => {
  assert.equal(validateDate("2028-02-29"), "2028-02-29");
  for (const value of [
    "2027-02-29",
    "2026-04-31",
    "2026-13-01",
    "0000-01-01",
    "26-01-01",
    "2026-1-01",
    "",
    null,
  ])
    assert.throws(() => validateDate(value));
});
