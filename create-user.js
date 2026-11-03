import { db } from './db.js';
import {
  hashPassword,
  deleteUserSessions,
  generatePassword,
  USERNAME_PATTERN,
} from './auth.js';

const args = process.argv.slice(2);
const rawName = args.find((a) => !a.startsWith('--'));
const isAdmin = args.includes('--admin');
const reset = args.includes('--reset');

if (!rawName) {
  console.log('Usage: node create-user.js <username> [--admin] [--reset]');
  process.exit(1);
}

const username = rawName.trim().toLowerCase();
if (!USERNAME_PATTERN.test(username)) {
  console.log('Username: 2-30 characters, only a-z, 0-9, _ and -');
  process.exit(1);
}

const password = generatePassword();
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

if (existing) {
  if (!reset) {
    console.log(`User "${username}" already exists. Use --reset to set a new password.`);
    process.exit(1);
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(hashPassword(password), existing.id);
  deleteUserSessions(existing.id);
  console.log(`🔑 New password for "${username}": ${password}`);
} else {
  db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(username, hashPassword(password), isAdmin ? 1 : 0);
  console.log(`✅ ${isAdmin ? 'Admin' : 'User'} "${username}" created. Password: ${password}`);
}