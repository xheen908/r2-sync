import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  let dbPath = path.join(process.cwd(), "data", "r2sync.db");
  const dataDir = path.dirname(dbPath);

  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  } catch (err) {
    console.warn("data directory creation failed, falling back to /tmp:", err);
    dbPath = path.join("/tmp", "r2sync.db");
  }

  try {
    dbInstance = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
  } catch (openErr) {
    console.warn(`Failed to open ${dbPath}, falling back to /tmp/r2sync.db:`, openErr);
    dbPath = path.join("/tmp", "r2sync.db");
    dbInstance = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
  }

  // Set journal mode safely
  try {
    await dbInstance.exec("PRAGMA journal_mode = WAL;");
  } catch (walErr) {
    try {
      await dbInstance.exec("PRAGMA journal_mode = DELETE;");
    } catch (e) {}
  }

  // Create tables
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        filename TEXT NOT NULL,
        size INTEGER NOT NULL,
        mime_type TEXT,
        etag TEXT,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS share_links (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        filename TEXT NOT NULL,
        expires_at INTEGER,
        password_hash TEXT,
        max_downloads INTEGER,
        download_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
    );
  `);

  // Default admin user check
  try {
    const adminCheck = await dbInstance.get("SELECT * FROM users WHERE username = ?", ["admin"]);
    if (!adminCheck) {
      const defaultHash = "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";
      await dbInstance.run(
        `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
        ["usr_admin_default", "admin", defaultHash, Date.now()]
      );
    }
  } catch (adminErr) {}

  return dbInstance;
}
