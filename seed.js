const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "catalogue.db"));
db.pragma("journal_mode = WAL");

// Ensure table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS resources (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    category      TEXT    NOT NULL DEFAULT '',
    activity      TEXT    NOT NULL DEFAULT '',
    quality_attribute TEXT NOT NULL DEFAULT '',
    tags          TEXT    NOT NULL DEFAULT '',
    source_url    TEXT    NOT NULL DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration: add source_url to existing databases that lack it
const columns = db.prepare("PRAGMA table_info(resources)").all().map((c) => c.name);
if (!columns.includes("source_url")) {
  db.exec("ALTER TABLE resources ADD COLUMN source_url TEXT NOT NULL DEFAULT ''");
}

const resources = require("./seed-data");

const insert = db.prepare(`
  INSERT INTO resources (title, description, category, activity, quality_attribute, tags, source_url)
  VALUES (@title, @description, @category, @activity, @quality_attribute, @tags, @source_url)
`);

const insertAll = db.transaction((items) => {
  for (const item of items) insert.run(item);
});

// Tags table
db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT    NOT NULL UNIQUE
  );
`);

// Clear existing data and re-seed
db.exec("DELETE FROM resources");
db.exec("DELETE FROM tags");
insertAll(resources);

// Extract unique tags from seed data and populate tags table
const tagSet = new Set();
resources.forEach((r) =>
  r.tags.split(",").forEach((t) => {
    const trimmed = t.trim();
    if (trimmed) tagSet.add(trimmed);
  })
);
const insertTagStmt = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
const seedTags = db.transaction((names) => {
  for (const name of names) insertTagStmt.run(name);
});
seedTags([...tagSet]);

console.log(`Seeded ${resources.length} resources and ${tagSet.size} tags into the catalogue.`);
db.close();
