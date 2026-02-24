const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const PDFDocument = require("pdfkit");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
const db = new Database(path.join(__dirname, "catalogue.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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

// Tags table — managed registry of tags
db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT    NOT NULL UNIQUE
  );
`);

// Migration: seed tags table from existing resource tags (one-time)
const tagCount = db.prepare("SELECT COUNT(*) AS cnt FROM tags").get().cnt;
if (tagCount === 0) {
  const tagRows = db.prepare("SELECT tags FROM resources WHERE tags != ''").all();
  const tagSet = new Set();
  tagRows.forEach((r) =>
    r.tags.split(",").forEach((t) => {
      const trimmed = t.trim();
      if (trimmed) tagSet.add(trimmed);
    })
  );
  const insertTag = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  const seedTags = db.transaction((names) => {
    for (const name of names) insertTag.run(name);
  });
  seedTags([...tagSet]);
}

// Auto-seed: populate DB with demo data if resources table is empty
// (needed for platforms like Render where filesystem resets on deploy)
const resourceCount = db.prepare("SELECT COUNT(*) AS cnt FROM resources").get().cnt;
if (resourceCount === 0) {
  const seedData = require("./seed-data");
  const insertRes = db.prepare(`
    INSERT INTO resources (title, description, category, activity, quality_attribute, tags, source_url)
    VALUES (@title, @description, @category, @activity, @quality_attribute, @tags, @source_url)
  `);
  const insertAll = db.transaction((items) => {
    for (const item of items) insertRes.run(item);
  });
  insertAll(seedData);

  // Also seed tags from the data
  const seedTagSet = new Set();
  seedData.forEach((r) =>
    r.tags.split(",").forEach((t) => {
      const trimmed = t.trim();
      if (trimmed) seedTagSet.add(trimmed);
    })
  );
  const insertTagAuto = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  const seedTagsTx = db.transaction((names) => {
    for (const name of names) insertTagAuto.run(name);
  });
  seedTagsTx([...seedTagSet]);

  console.log(`Auto-seeded ${seedData.length} resources and ${seedTagSet.size} tags.`);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// API routes — Resources CRUD + search
// ---------------------------------------------------------------------------

// Shared helper: build filtered query from request query params
function buildFilteredQuery(query) {
  const { search, category, activity, quality_attribute, tag } = query;

  let sql = "SELECT * FROM resources WHERE 1=1";
  const params = [];

  if (search) {
    sql += " AND (title LIKE ? OR description LIKE ? OR source_url LIKE ?)";
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  if (activity) {
    sql += " AND activity = ?";
    params.push(activity);
  }
  if (quality_attribute) {
    sql += " AND quality_attribute = ?";
    params.push(quality_attribute);
  }
  if (tag) {
    sql += " AND (',' || tags || ',' LIKE ?)";
    params.push(`%,${tag},%`);
  }

  sql += " ORDER BY updated_at DESC";
  return db.prepare(sql).all(...params);
}

// LIST  — GET /api/resources?search=&category=&activity=&quality_attribute=&tag=
app.get("/api/resources", (req, res) => {
  res.json(buildFilteredQuery(req.query));
});

// DISTINCT filter values — GET /api/resources/filters
app.get("/api/resources/filters", (_req, res) => {
  const categories = db
    .prepare("SELECT DISTINCT category FROM resources WHERE category != '' ORDER BY category")
    .all()
    .map((r) => r.category);
  const activities = db
    .prepare("SELECT DISTINCT activity FROM resources WHERE activity != '' ORDER BY activity")
    .all()
    .map((r) => r.activity);
  const qualityAttributes = db
    .prepare("SELECT DISTINCT quality_attribute FROM resources WHERE quality_attribute != '' ORDER BY quality_attribute")
    .all()
    .map((r) => r.quality_attribute);

  // Tags sourced from the managed tags table
  const tags = db
    .prepare("SELECT name FROM tags ORDER BY name")
    .all()
    .map((r) => r.name);

  res.json({
    categories,
    activities,
    qualityAttributes,
    tags,
  });
});

// ---------------------------------------------------------------------------
// Export — CSV
// ---------------------------------------------------------------------------
app.get("/api/resources/export/csv", (req, res) => {
  const rows = buildFilteredQuery(req.query);

  const headers = [
    "ID", "Title", "Description", "Category", "Activity",
    "Quality Attribute", "Tags", "Source URL", "Created At", "Updated At",
  ];

  function csvCell(val) {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      r.id, r.title, r.description, r.category, r.activity,
      r.quality_attribute, r.tags, r.source_url, r.created_at, r.updated_at,
    ].map(csvCell).join(","));
  }

  const csv = lines.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=ml-resources.csv");
  res.send(csv);
});

// ---------------------------------------------------------------------------
// Export — PDF
// ---------------------------------------------------------------------------
app.get("/api/resources/export/pdf", (req, res) => {
  const rows = buildFilteredQuery(req.query);

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=ml-resources.pdf");
  doc.pipe(res);

  // Title
  doc.fontSize(20).font("Helvetica-Bold").text("ML Resource Catalogue", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").fillColor("#666666")
    .text(`${rows.length} resource${rows.length !== 1 ? "s" : ""} exported on ${new Date().toLocaleDateString()}`, { align: "center" });
  doc.moveDown(1);

  // Active filters summary
  const filters = [];
  if (req.query.search) filters.push(`Search: "${req.query.search}"`);
  if (req.query.category) filters.push(`Category: ${req.query.category}`);
  if (req.query.activity) filters.push(`Activity: ${req.query.activity}`);
  if (req.query.quality_attribute) filters.push(`Quality Attribute: ${req.query.quality_attribute}`);
  if (req.query.tag) filters.push(`Tag: ${req.query.tag}`);
  if (filters.length > 0) {
    doc.fontSize(9).fillColor("#888888").text("Active filters: " + filters.join(" | "));
    doc.moveDown(0.8);
  }

  // Resources
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  rows.forEach((r, idx) => {
    // Check space — start new page if less than 150pt remaining
    if (doc.y > doc.page.height - doc.page.margins.bottom - 150) {
      doc.addPage();
    }

    // Separator line between resources (not before the first)
    if (idx > 0) {
      doc.moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.margins.left + pageWidth, doc.y)
        .strokeColor("#dddddd").lineWidth(0.5).stroke();
      doc.moveDown(0.6);
    }

    // Title
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#0f3460").text(r.title);
    doc.moveDown(0.2);

    // Field helper
    function field(label, value) {
      if (!value) return;
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#64748b").text(label.toUpperCase(), { continued: true });
      doc.font("Helvetica").fillColor("#1e293b").text("  " + value);
    }

    if (r.description) {
      doc.fontSize(9).font("Helvetica").fillColor("#333333").text(r.description);
      doc.moveDown(0.3);
    }

    field("Category", r.category);
    field("Activity", r.activity);
    field("Quality Attribute", r.quality_attribute);
    field("Tags", r.tags);
    field("Source URL", r.source_url);

    doc.moveDown(0.7);
  });

  if (rows.length === 0) {
    doc.fontSize(12).font("Helvetica").fillColor("#999999").text("No resources match the current filters.", { align: "center" });
  }

  doc.end();
});

// GET single — GET /api/resources/:id
app.get("/api/resources/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Resource not found" });
  res.json(row);
});

// CREATE — POST /api/resources
app.post("/api/resources", (req, res) => {
  const { title, description, category, activity, quality_attribute, tags, source_url } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }

  const stmt = db.prepare(`
    INSERT INTO resources (title, description, category, activity, quality_attribute, tags, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    title.trim(),
    (description || "").trim(),
    (category || "").trim(),
    (activity || "").trim(),
    (quality_attribute || "").trim(),
    (tags || "").trim(),
    (source_url || "").trim()
  );

  const created = db.prepare("SELECT * FROM resources WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(created);
});

// UPDATE — PUT /api/resources/:id
app.put("/api/resources/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Resource not found" });

  const { title, description, category, activity, quality_attribute, tags, source_url } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }

  db.prepare(`
    UPDATE resources
    SET title = ?, description = ?, category = ?, activity = ?, quality_attribute = ?, tags = ?, source_url = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title.trim(),
    (description || "").trim(),
    (category || "").trim(),
    (activity || "").trim(),
    (quality_attribute || "").trim(),
    (tags || "").trim(),
    (source_url || "").trim(),
    req.params.id
  );

  const updated = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  res.json(updated);
});

// DELETE — DELETE /api/resources/:id
app.delete("/api/resources/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Resource not found" });

  db.prepare("DELETE FROM resources WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// API routes — Tags management
// ---------------------------------------------------------------------------

// LIST — GET /api/tags
app.get("/api/tags", (_req, res) => {
  const rows = db.prepare("SELECT * FROM tags ORDER BY name").all();
  res.json(rows);
});

// CREATE — POST /api/tags
app.post("/api/tags", (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Tag name is required" });
  }
  const trimmed = name.trim();

  const existing = db.prepare("SELECT * FROM tags WHERE name = ?").get(trimmed);
  if (existing) {
    return res.status(409).json({ error: "Tag already exists" });
  }

  const info = db.prepare("INSERT INTO tags (name) VALUES (?)").run(trimmed);
  const created = db.prepare("SELECT * FROM tags WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(created);
});

// RENAME — PUT /api/tags/:id
app.put("/api/tags/:id", (req, res) => {
  const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(req.params.id);
  if (!tag) return res.status(404).json({ error: "Tag not found" });

  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Tag name is required" });
  }
  const newName = name.trim();
  const oldName = tag.name;

  if (newName !== oldName) {
    const conflict = db.prepare("SELECT * FROM tags WHERE name = ? AND id != ?").get(newName, req.params.id);
    if (conflict) {
      return res.status(409).json({ error: "A tag with that name already exists" });
    }

    // Update tag registry
    db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(newName, req.params.id);

    // Update all resources that reference the old tag name
    const resources = db.prepare("SELECT id, tags FROM resources WHERE ',' || tags || ',' LIKE ?").all(`%,${oldName},%`);
    const updateStmt = db.prepare("UPDATE resources SET tags = ?, updated_at = datetime('now') WHERE id = ?");
    for (const r of resources) {
      const updated = r.tags
        .split(",")
        .map((t) => (t.trim() === oldName ? newName : t.trim()))
        .filter(Boolean)
        .join(",");
      updateStmt.run(updated, r.id);
    }
  }

  const updated = db.prepare("SELECT * FROM tags WHERE id = ?").get(req.params.id);
  res.json(updated);
});

// DELETE — DELETE /api/tags/:id
app.delete("/api/tags/:id", (req, res) => {
  const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(req.params.id);
  if (!tag) return res.status(404).json({ error: "Tag not found" });

  // Remove this tag from all resources
  const resources = db.prepare("SELECT id, tags FROM resources WHERE ',' || tags || ',' LIKE ?").all(`%,${tag.name},%`);
  const updateStmt = db.prepare("UPDATE resources SET tags = ?, updated_at = datetime('now') WHERE id = ?");
  for (const r of resources) {
    const updated = r.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && t !== tag.name)
      .join(",");
    updateStmt.run(updated, r.id);
  }

  db.prepare("DELETE FROM tags WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Fallback — serve index.html for any non-API route (SPA support)
// ---------------------------------------------------------------------------
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`ML Resource Catalogue running at http://localhost:${PORT}`);
});
