function publicUser(row) {
  return row && { id: row.id, name: row.name, email: row.email, role: row.role,
    active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at };
}
export function authRepository(db) {
  const credential = (row) => row && { ...publicUser(row), passwordHash: row.password_hash };
  return {
    transaction: (fn) => db.transaction(fn).immediate(),
    userCount: () => db.prepare("SELECT count(*) n FROM users").get().n,
    user: (id) => publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(id)),
    users: () => db.prepare("SELECT * FROM users ORDER BY id").all().map(publicUser),
    credentials: (email) => credential(db.prepare("SELECT * FROM users WHERE email=?").get(email)),
    credentialById: (id) => credential(db.prepare("SELECT * FROM users WHERE id=?").get(id)),
    create({ name, email, passwordHash, role }) {
      const row = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?) RETURNING *")
        .get(name, email, passwordHash, role);
      return publicUser(row);
    },
    updateName: (id, name) => publicUser(db.prepare("UPDATE users SET name=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? RETURNING *").get(name, id)),
    password: (id, passwordHash) => db.prepare("UPDATE users SET password_hash=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(passwordHash, id),
    status: (id, active) => publicUser(db.prepare("UPDATE users SET active=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? RETURNING *").get(Number(active), id)),
    session: (hash, now) => publicUser(db.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1").get(hash, now)),
    createSession: (hash, id, expires) => db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(hash, id, expires),
    removeSession: (hash) => db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash),
    revokeUser: (id) => db.prepare("DELETE FROM sessions WHERE user_id=?").run(id),
    cleanup: (now) => {
      db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now);
      db.prepare("DELETE FROM login_attempts WHERE resets_at<=?").run(now);
    },
    attempt: (bucket) => db.prepare("SELECT * FROM login_attempts WHERE bucket=?").get(bucket),
    addAttempt: (bucket, until) => db.prepare("INSERT INTO login_attempts(bucket,attempts,resets_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1").run(bucket, until),
    clearAttempt: (bucket) => db.prepare("DELETE FROM login_attempts WHERE bucket=?").run(bucket),
  };
}
