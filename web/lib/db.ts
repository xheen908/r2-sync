import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "r2sync.db");
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Enable WAL mode & create tables
  await dbInstance.exec("PRAGMA journal_mode = WAL;");

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
  const adminCheck = await dbInstance.get("SELECT * FROM users WHERE username = ?", ["admin"]);
  if (!adminCheck) {
    const defaultHash = "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";
    await dbInstance.run(
      `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
      ["usr_admin_default", "admin", defaultHash, Date.now()]
    );
  }

  return dbInstance;
}
