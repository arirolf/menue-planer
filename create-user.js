import crypto from 'node:crypto';
import { db } from './db.js';
import { hashPassword, deleteUserSessions } from './auth.js';

const [, , rawName, flag] = process.argv;

if (!rawName) {
  console.log('Usage: node create-user.js <username> [--reset]');
  process.exit(1);
}

const username = rawName.trim().toLowerCase();
if (!/^[a-z0-9_-]{2,30}$/.test(username)) {
  console.log('Username: 2-30 characters, only a-z, 0-9, _ and -');
  process.exit(1);
}

const password = crypto.randomBytes(9).toString('base64url');
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

if (existing) {
  if (flag !== '--reset') {
    console.log(`User "${username}" already exists. Use --reset to set a new password.`);
    process.exit(1);
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(hashPassword(password), existing.id);
  deleteUserSessions(existing.id);
  console.log(`🔑 New password for "${username}": ${password}`);
} else {
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, hashPassword(password));
  console.log(`✅ User "${username}" created. Password: ${password}`);
}