import crypto from 'node:crypto';
import { db } from './db.js';

const SESSION_DAYS = 90;
export const SESSION_COOKIE = 'menu_session';

export const USERNAME_PATTERN = /^[a-z0-9_-]{2,30}$/;

export function generatePassword() {
  return crypto.randomBytes(9).toString('base64url');
}
// ---------- Passwords ----------

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Used when a username doesn't exist, so the answer takes just as long.
// Otherwise an attacker could tell from the timing which usernames exist.
const DUMMY_HASH = hashPassword('dummy-password');

export function checkLogin(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    verifyPassword(password, DUMMY_HASH);
    return null;
  }
  return verifyPassword(password, user.password_hash) ? user : null;
}

// ---------- Sessions ----------

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, expiresAt);
  return { token, expiresAt };
}

export function getSessionUser(token) {
  if (!token) return null;
  const user = db
    .prepare(`
      SELECT u.id, u.username, u.language, u.is_admin, u.color_main, u.color_secondary, u.color_frame
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `)
    .get(sha256(token), Date.now());
  return user ? { ...user, is_admin: user.is_admin === 1 } : null;
}

export function deleteSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function deleteUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function cleanupSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

// ---------- Middleware ----------

export function requireAuth(req, res, next) {
  const user = getSessionUser(req.cookies[SESSION_COOKIE]);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admins only' });
  next();
}