const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'grooves.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    address TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS grooves (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL REFERENCES users(address),
    name TEXT NOT NULL DEFAULT 'Untitled Groove',
    svg TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

module.exports = {
  upsertUser(address) {
    db.prepare('INSERT OR IGNORE INTO users (address, created_at) VALUES (?, ?)').run(address, Date.now());
  },

  saveGroove(id, address, name, svg) {
    db.prepare('INSERT INTO grooves (id, address, name, svg, created_at) VALUES (?, ?, ?, ?, ?)').run(id, address, name, svg, Date.now());
    return db.prepare('SELECT id, name, created_at FROM grooves WHERE id = ?').get(id);
  },

  listGrooves(address) {
    return db.prepare('SELECT id, name, created_at FROM grooves WHERE address = ? ORDER BY created_at DESC').all(address);
  },

  getGroove(id, address) {
    return db.prepare('SELECT * FROM grooves WHERE id = ? AND address = ?').get(id, address);
  },

  deleteGroove(id, address) {
    const result = db.prepare('DELETE FROM grooves WHERE id = ? AND address = ?').run(id, address);
    return result.changes > 0;
  },
};
