CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  email TEXT CHECK(email IS NULL OR length(email) <= 254),
  phone TEXT CHECK(phone IS NULL OR length(phone) <= 40),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  total_projectors INTEGER NOT NULL CHECK(typeof(total_projectors)='integer' AND total_projectors >= 0),
  total_audio_systems INTEGER NOT NULL CHECK(typeof(total_audio_systems)='integer' AND total_audio_systems >= 0),
  total_staff INTEGER NOT NULL CHECK(typeof(total_staff)='integer' AND total_staff >= 0)
);
CREATE TABLE IF NOT EXISTS halls (
  id INTEGER PRIMARY KEY,
  venue_id INTEGER NOT NULL REFERENCES venues(id),
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK(typeof(capacity)='integer' AND capacity > 0),
  UNIQUE(venue_id, name),
  UNIQUE(id, venue_id)
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  event_name TEXT NOT NULL CHECK(length(trim(event_name)) BETWEEN 1 AND 160),
  event_date TEXT NOT NULL CHECK(length(event_date)=10 AND event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  start_minute INTEGER NOT NULL CHECK(typeof(start_minute)='integer'),
  end_minute INTEGER NOT NULL CHECK(typeof(end_minute)='integer' AND end_minute > start_minute),
  reserved_start_minute INTEGER NOT NULL CHECK(typeof(reserved_start_minute)='integer' AND reserved_start_minute = start_minute - 30 AND reserved_start_minute >= 480),
  reserved_end_minute INTEGER NOT NULL CHECK(typeof(reserved_end_minute)='integer' AND reserved_end_minute = end_minute + 30 AND reserved_end_minute <= 1320),
  attendees INTEGER NOT NULL CHECK(typeof(attendees)='integer' AND attendees > 0),
  preferred_venue_id INTEGER NOT NULL REFERENCES venues(id),
  allocated_venue_id INTEGER REFERENCES venues(id),
  hall_id INTEGER,
  projectors_required INTEGER NOT NULL CHECK(typeof(projectors_required)='integer' AND projectors_required >= 0),
  audio_required INTEGER NOT NULL CHECK(typeof(audio_required)='integer' AND audio_required >= 0),
  staff_required INTEGER NOT NULL CHECK(typeof(staff_required)='integer' AND staff_required >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED','REJECTED','CANCELLED')),
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(hall_id, allocated_venue_id) REFERENCES halls(id, venue_id),
  CHECK((hall_id IS NULL AND allocated_venue_id IS NULL) OR (hall_id IS NOT NULL AND allocated_venue_id IS NOT NULL)),
  CHECK(status != 'PENDING' OR (hall_id IS NULL AND allocated_venue_id IS NULL)),
  CHECK(status != 'CONFIRMED' OR (hall_id IS NOT NULL AND allocated_venue_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS bookings_date ON bookings(event_date);
CREATE INDEX IF NOT EXISTS bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_hall_interval ON bookings(hall_id, event_date, reserved_start_minute, reserved_end_minute);
CREATE INDEX IF NOT EXISTS bookings_venue_interval ON bookings(allocated_venue_id, event_date, reserved_start_minute, reserved_end_minute);
CREATE TABLE IF NOT EXISTS recommendation_confirmations (
  confirmation_key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  booking_id INTEGER NOT NULL REFERENCES bookings(id)
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  email TEXT NOT NULL UNIQUE CHECK(email=lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN','STAFF')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_attempts (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  resets_at INTEGER NOT NULL
);
