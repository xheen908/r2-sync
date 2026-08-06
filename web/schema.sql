-- Cloudflare D1 (SQLite) Schema for R2Sync Web Drive

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- File Index table
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT,
    etag TEXT,
    updated_at INTEGER NOT NULL
);

-- Share Links table (OwnCloud / Dropbox style)
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

-- Default admin user (Username: admin, Password: adminpassword - hash created at runtime or updated via setup)
INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
VALUES (
    'usr_admin_default',
    'admin',
    '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', -- sha256("adminpassword")
    1700000000000
);
