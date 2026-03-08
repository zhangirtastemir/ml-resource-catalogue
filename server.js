const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const PDFDocument = require("pdfkit");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "catalogue.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// --- Lookup tables ---
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS activities (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    group_name TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS qualities (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    group_name TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
`);

// --- Assets table (replaces resources) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS assets (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT NOT NULL,
    aka                TEXT NOT NULL DEFAULT '',
    short_presentation TEXT NOT NULL DEFAULT '',
    context            TEXT NOT NULL DEFAULT '',
    why_and_how        TEXT NOT NULL DEFAULT '',
    source_url         TEXT NOT NULL DEFAULT '',
    visibility         TEXT NOT NULL DEFAULT 'CatalogueUser',
    reference_title    TEXT NOT NULL DEFAULT '',
    reference_url      TEXT NOT NULL DEFAULT '',
    reference_note     TEXT NOT NULL DEFAULT '',
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrations: add columns to existing assets tables that lack them
const assetCols = db.prepare("PRAGMA table_info(assets)").all().map(c => c.name);
if (!assetCols.includes("why_and_how")) {
  db.exec("ALTER TABLE assets ADD COLUMN why_and_how TEXT NOT NULL DEFAULT ''");
}
if (!assetCols.includes("visibility")) {
  db.exec("ALTER TABLE assets ADD COLUMN visibility TEXT NOT NULL DEFAULT 'CatalogueUser'");
}
if (!assetCols.includes("reference_title")) {
  db.exec("ALTER TABLE assets ADD COLUMN reference_title TEXT NOT NULL DEFAULT ''");
}
if (!assetCols.includes("reference_url")) {
  db.exec("ALTER TABLE assets ADD COLUMN reference_url TEXT NOT NULL DEFAULT ''");
}
if (!assetCols.includes("reference_note")) {
  db.exec("ALTER TABLE assets ADD COLUMN reference_note TEXT NOT NULL DEFAULT ''");
}

// --- Knowledge block tables (multi-field per UML) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS asset_solves (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id      INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text          TEXT NOT NULL DEFAULT '',
    problem       TEXT NOT NULL DEFAULT '',
    solution      TEXT NOT NULL DEFAULT '',
    pros          TEXT NOT NULL DEFAULT '',
    cons          TEXT NOT NULL DEFAULT '',
    consequences  TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS asset_dos (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text     TEXT NOT NULL DEFAULT '',
    what     TEXT NOT NULL DEFAULT '',
    reason   TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS asset_donts (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text     TEXT NOT NULL DEFAULT '',
    what     TEXT NOT NULL DEFAULT '',
    reason   TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS asset_considers (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text     TEXT NOT NULL DEFAULT '',
    what     TEXT NOT NULL DEFAULT '',
    reason   TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS asset_be_awares (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text     TEXT NOT NULL DEFAULT '',
    of_what  TEXT NOT NULL DEFAULT '',
    reason   TEXT NOT NULL DEFAULT ''
  );
`);

// Migration: add multi-field columns to existing KB tables
function migrateKBColumns(table, newCols) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  for (const col of newCols) {
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }
}
migrateKBColumns("asset_solves", ["problem", "solution", "pros", "cons", "consequences"]);
migrateKBColumns("asset_dos", ["what", "reason"]);
migrateKBColumns("asset_donts", ["what", "reason"]);
migrateKBColumns("asset_considers", ["what", "reason"]);
migrateKBColumns("asset_be_awares", ["of_what", "reason"]);

// Migrate legacy: copy text → primary field where primary field is empty
db.exec(`UPDATE asset_solves SET problem = text WHERE problem = '' AND text != ''`);
db.exec(`UPDATE asset_dos SET what = text WHERE what = '' AND text != ''`);
db.exec(`UPDATE asset_donts SET what = text WHERE what = '' AND text != ''`);
db.exec(`UPDATE asset_considers SET what = text WHERE what = '' AND text != ''`);
db.exec(`UPDATE asset_be_awares SET of_what = text WHERE of_what = '' AND text != ''`);

// --- Exemplifications ---
db.exec(`
  CREATE TABLE IF NOT EXISTS asset_exemplifications (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text     TEXT NOT NULL
  );
`);

// --- Junction tables (many-to-many) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS asset_categories (
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, category_id)
  );
  CREATE TABLE IF NOT EXISTS asset_activities (
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, activity_id)
  );
  CREATE TABLE IF NOT EXISTS asset_qualities (
    asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    quality_id INTEGER NOT NULL REFERENCES qualities(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, quality_id)
  );
  CREATE TABLE IF NOT EXISTS asset_tags (
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS asset_references (
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    related_id  INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, related_id),
    CHECK (asset_id != related_id)
  );
`);

// ---------------------------------------------------------------------------
// Seed lookup data (one-time)
// ---------------------------------------------------------------------------
function seedLookups() {
  const catCount = db.prepare("SELECT COUNT(*) AS cnt FROM categories").get().cnt;
  if (catCount === 0) {
    const ins = db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)");
    ins.run("Design Pattern");
    ins.run("Architecture Pattern");
  }

  const actCount = db.prepare("SELECT COUNT(*) AS cnt FROM activities").get().cnt;
  if (actCount === 0) {
    const ins = db.prepare("INSERT OR IGNORE INTO activities (name, group_name) VALUES (?, ?)");
    // Software Engineering
    ins.run("Architecture", "Software Engineering");
    ins.run("Coding", "Software Engineering");
    ins.run("Deployment", "Software Engineering");
    ins.run("Development process", "Software Engineering");
    ins.run("Software design", "Software Engineering");
    ins.run("Software testing", "Software Engineering");
    // Data Engineering
    ins.run("Data engineering", "Data Engineering");
    // ML Engineering
    ins.run("Model type selection", "ML Engineering");
    ins.run("Feature engineering", "ML Engineering");
    ins.run("Model building", "ML Engineering");
    ins.run("Operation", "ML Engineering");
    ins.run("Model training", "ML Engineering");
    ins.run("Data labeling", "ML Engineering");
    // Management
    ins.run("Governance", "Management");
    ins.run("Project management", "Management");
  }

  const qualCount = db.prepare("SELECT COUNT(*) AS cnt FROM qualities").get().cnt;
  if (qualCount === 0) {
    const ins = db.prepare("INSERT OR IGNORE INTO qualities (name, group_name) VALUES (?, ?)");
    // Software Quality
    ins.run("Privacy", "Software Quality");
    ins.run("Scalability", "Software Quality");
    ins.run("Performance", "Software Quality");
    // ML Quality
    ins.run("Explainability", "ML Quality");
    ins.run("Interpretability", "ML Quality");
    ins.run("Reproducibility", "ML Quality");
    ins.run("Responsibility", "ML Quality");
    // Data Quality
    ins.run("Data quality", "Data Quality");
  }
}
seedLookups();

// ---------------------------------------------------------------------------
// Migration: import old resources table into new schema
// ---------------------------------------------------------------------------
(function migrateOldResources() {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  if (!tables.includes("resources")) return;

  const oldRows = db.prepare("SELECT * FROM resources").all();
  if (oldRows.length === 0) {
    db.exec("DROP TABLE IF EXISTS resources");
    return;
  }

  // Check if migration already done
  const assetCount = db.prepare("SELECT COUNT(*) AS cnt FROM assets").get().cnt;
  if (assetCount > 0) {
    db.exec("DROP TABLE IF EXISTS resources");
    return;
  }

  const insertAsset = db.prepare(`
    INSERT INTO assets (name, aka, short_presentation, context, source_url, created_at, updated_at)
    VALUES (?, '', ?, '', ?, ?, ?)
  `);

  const migrate = db.transaction(() => {
    for (const r of oldRows) {
      const info = insertAsset.run(
        r.title,
        r.description || "",
        r.source_url || "",
        r.created_at,
        r.updated_at
      );
      const assetId = info.lastInsertRowid;

      // Map old category
      if (r.category) {
        const cat = db.prepare("SELECT id FROM categories WHERE name = ?").get(r.category);
        if (cat) {
          db.prepare("INSERT OR IGNORE INTO asset_categories (asset_id, category_id) VALUES (?, ?)").run(assetId, cat.id);
        }
      }

      // Map old activity
      if (r.activity) {
        const act = db.prepare("SELECT id FROM activities WHERE name = ?").get(r.activity);
        if (act) {
          db.prepare("INSERT OR IGNORE INTO asset_activities (asset_id, activity_id) VALUES (?, ?)").run(assetId, act.id);
        }
      }

      // Map old quality_attribute
      if (r.quality_attribute) {
        const qual = db.prepare("SELECT id FROM qualities WHERE name = ?").get(r.quality_attribute);
        if (qual) {
          db.prepare("INSERT OR IGNORE INTO asset_qualities (asset_id, quality_id) VALUES (?, ?)").run(assetId, qual.id);
        }
      }

      // Map old tags
      if (r.tags) {
        const tagNames = r.tags.split(",").map(t => t.trim()).filter(Boolean);
        for (const tn of tagNames) {
          db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(tn);
          const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get(tn);
          if (tag) {
            db.prepare("INSERT OR IGNORE INTO asset_tags (asset_id, tag_id) VALUES (?, ?)").run(assetId, tag.id);
          }
        }
      }

      // Add description as first exemplification
      if (r.description) {
        db.prepare("INSERT INTO asset_exemplifications (asset_id, text) VALUES (?, ?)").run(assetId, r.description);
      }
    }
  });

  migrate();
  db.exec("DROP TABLE IF EXISTS resources");
})();

// ---------------------------------------------------------------------------
// Auto-seed demo assets (runs once when database is empty)
// ---------------------------------------------------------------------------
(function autoSeedAssets() {
  const assetCount = db.prepare("SELECT COUNT(*) AS cnt FROM assets").get().cnt;
  if (assetCount > 0) return; // already has data

  console.log("Empty database detected — seeding demo assets...");

  function catId(name) { return db.prepare("SELECT id FROM categories WHERE name = ?").get(name).id; }
  function actId(name) { return db.prepare("SELECT id FROM activities WHERE name = ?").get(name).id; }
  function qualId(name) { return db.prepare("SELECT id FROM qualities WHERE name = ?").get(name).id; }
  function tagId(name) { return db.prepare("SELECT id FROM tags WHERE name = ?").get(name).id; }

  // Ensure seed tags exist
  const seedTags = [
    "validation", "evaluation", "best-practice", "preprocessing", "feature-engineering",
    "pipeline", "versioning", "reproducibility", "dvc", "explainability", "shap",
    "interpretability", "fairness", "bias", "checklist", "ethics",
    "hyperparameter-tuning", "optimization", "bayesian", "monitoring",
    "drift-detection", "deployment", "adversarial", "robustness", "security",
    "testing", "ci-cd", "automation", "mlops", "augmentation", "deep-learning",
    "privacy", "differential-privacy", "transfer-learning", "fine-tuning", "nlp",
    "computer-vision",
  ];
  const insTagIfNew = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  seedTags.forEach(t => insTagIfNew.run(t));

  const insAsset = db.prepare(`INSERT INTO assets (name, aka, short_presentation, context, why_and_how, source_url, visibility, reference_title, reference_url, reference_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insAssetCat = db.prepare("INSERT INTO asset_categories (asset_id, category_id) VALUES (?, ?)");
  const insAssetAct = db.prepare("INSERT INTO asset_activities (asset_id, activity_id) VALUES (?, ?)");
  const insAssetQual = db.prepare("INSERT INTO asset_qualities (asset_id, quality_id) VALUES (?, ?)");
  const insAssetTag = db.prepare("INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)");
  const insExemplification = db.prepare("INSERT INTO asset_exemplifications (asset_id, text) VALUES (?, ?)");
  const insSolve = db.prepare("INSERT INTO asset_solves (asset_id, problem, solution, pros, cons, consequences) VALUES (?, ?, ?, ?, ?, ?)");
  const insDo = db.prepare("INSERT INTO asset_dos (asset_id, what, reason) VALUES (?, ?, ?)");
  const insDont = db.prepare("INSERT INTO asset_donts (asset_id, what, reason) VALUES (?, ?, ?)");
  const insConsider = db.prepare("INSERT INTO asset_considers (asset_id, what, reason) VALUES (?, ?, ?)");
  const insBeAware = db.prepare("INSERT INTO asset_be_awares (asset_id, of_what, reason) VALUES (?, ?, ?)");
  const insRef = db.prepare("INSERT INTO asset_references (asset_id, related_id) VALUES (?, ?)");

  const seed = db.transaction(() => {
    const a1 = insAsset.run("Cross-Validation Strategy", "k-fold CV", "A reusable pattern for evaluating model performance using k-fold cross-validation.", "Ensures that the model generalizes well to unseen data by partitioning the dataset into k equally sized folds and iterating training and validation across them.", "Use k-fold CV to systematically rotate held-out validation sets, providing a robust estimate of generalization error without wasting data.", "https://scikit-learn.org/stable/modules/cross_validation.html", "CatalogueUser", "Cross-validation: evaluating estimator performance", "https://scikit-learn.org/stable/modules/cross_validation.html", "Official scikit-learn documentation on cross-validation strategies.").lastInsertRowid;
    insAssetCat.run(a1, catId("Design Pattern"));
    insAssetAct.run(a1, actId("Model building"));
    insAssetAct.run(a1, actId("Software testing"));
    insAssetQual.run(a1, qualId("Reproducibility"));
    insAssetTag.run(a1, tagId("validation"));
    insAssetTag.run(a1, tagId("evaluation"));
    insAssetTag.run(a1, tagId("best-practice"));
    insExemplification.run(a1, "Use 5-fold or 10-fold CV when dataset size allows to estimate model variance reliably.");
    insSolve.run(a1, "Overfitting detection during model development", "Use k-fold cross-validation to evaluate on held-out folds", "Robust estimate of generalization", "Higher compute cost", "More reliable model selection");
    insDo.run(a1, "Stratify folds for classification tasks to maintain class ratios", "Prevents biased evaluation when classes are imbalanced");
    insDont.run(a1, "Leak test data into training folds via preprocessing", "Leads to overly optimistic performance estimates");

    const a2 = insAsset.run("Feature Scaling Pipeline", "", "Standardization and normalization techniques applied as a preprocessing step.", "Includes Min-Max scaling, Z-score normalization, and robust scaling for handling outliers in feature distributions.", "Many algorithms (SVM, KNN, neural nets) are sensitive to feature magnitude. Scaling ensures equal contribution and faster convergence.", "https://scikit-learn.org/stable/modules/preprocessing.html", "CatalogueUser", "", "", "").lastInsertRowid;
    insAssetCat.run(a2, catId("Design Pattern"));
    insAssetAct.run(a2, actId("Feature engineering"));
    insAssetAct.run(a2, actId("Data engineering"));
    insAssetQual.run(a2, qualId("Performance"));
    insAssetTag.run(a2, tagId("preprocessing"));
    insAssetTag.run(a2, tagId("feature-engineering"));
    insAssetTag.run(a2, tagId("pipeline"));
    insExemplification.run(a2, "Apply StandardScaler before SVM or KNN models for consistent distance-based calculations.");
    insDo.run(a2, "Fit scaler on training data only, then transform both train and test", "Prevents information leakage from test set statistics");
    insDont.run(a2, "Apply scaling after train-test split to avoid data leakage", "Test set statistics would contaminate training");

    const a3 = insAsset.run("Data Versioning with DVC", "DVC", "A conceptual resource for tracking dataset versions alongside code.", "Ensures reproducibility by linking specific data snapshots to model training runs.", "DVC tracks large data files alongside Git commits so every experiment can be traced to exact data, code, and config versions.", "https://dvc.org/doc", "CatalogueUser", "DVC Documentation", "https://dvc.org/doc", "Official DVC documentation and tutorials.").lastInsertRowid;
    insAssetCat.run(a3, catId("Design Pattern"));
    insAssetAct.run(a3, actId("Data engineering"));
    insAssetAct.run(a3, actId("Development process"));
    insAssetQual.run(a3, qualId("Reproducibility"));
    insAssetTag.run(a3, tagId("versioning"));
    insAssetTag.run(a3, tagId("reproducibility"));
    insAssetTag.run(a3, tagId("dvc"));
    insExemplification.run(a3, "Tag each training run with the DVC commit hash of the dataset version used.");
    insSolve.run(a3, "Inability to reproduce model results due to dataset changes", "Track data versions alongside code with DVC", "Full traceability of experiments", "Adds tooling complexity", "Every experiment is reproducible");

    const a4 = insAsset.run("SHAP-based Model Explainability", "SHAP", "Apply SHAP values to interpret individual predictions and global feature importance.", "Provides consistent and theoretically grounded explanations for any ML model.", "SHAP assigns each feature a contribution score based on cooperative game theory, ensuring fair attribution across all input features.", "https://shap.readthedocs.io/en/latest/", "CatalogueUser", "", "", "").lastInsertRowid;
    insAssetCat.run(a4, catId("Design Pattern"));
    insAssetAct.run(a4, actId("Model building"));
    insAssetQual.run(a4, qualId("Explainability"));
    insAssetQual.run(a4, qualId("Interpretability"));
    insAssetTag.run(a4, tagId("explainability"));
    insAssetTag.run(a4, tagId("shap"));
    insAssetTag.run(a4, tagId("interpretability"));
    insExemplification.run(a4, "Generate SHAP summary plots to identify which features drive predictions most.");
    insConsider.run(a4, "SHAP computation can be expensive for large datasets", "Consider sampling or using TreeSHAP for tree-based models");

    const a5 = insAsset.run("Bias Detection Checklist", "", "A structured checklist for identifying potential sources of bias.", "Covers demographic parity, equalized odds, and calibration across protected groups.", "Systematic bias auditing prevents discriminatory outcomes by checking model fairness metrics across protected subgroups before deployment.", "", "InternalOnly", "Fairness and Machine Learning", "https://fairmlbook.org/", "Textbook on fairness considerations in ML.").lastInsertRowid;
    insAssetCat.run(a5, catId("Design Pattern"));
    insAssetAct.run(a5, actId("Model building"));
    insAssetAct.run(a5, actId("Governance"));
    insAssetQual.run(a5, qualId("Responsibility"));
    insAssetTag.run(a5, tagId("fairness"));
    insAssetTag.run(a5, tagId("bias"));
    insAssetTag.run(a5, tagId("checklist"));
    insAssetTag.run(a5, tagId("ethics"));
    insExemplification.run(a5, "Evaluate model predictions across age, gender, and ethnicity subgroups before deployment.");
    insDo.run(a5, "Document bias audit results and mitigation steps taken", "Creates accountability and audit trail for compliance");
    insBeAware.run(a5, "Bias can be introduced at data collection, labeling, or model training stages", "Each stage requires different detection and mitigation strategies");

    const a6 = insAsset.run("Hyperparameter Tuning with Bayesian Optimization", "Optuna / Hyperopt", "Conceptual guide for using Bayesian optimization to efficiently search hyperparameter spaces.", "Reduces compute cost compared to grid or random search while finding better configurations.", "Bayesian optimization builds a probabilistic surrogate model of the objective function and uses acquisition functions to decide which hyperparameters to evaluate next.", "https://optuna.readthedocs.io/en/stable/", "CatalogueUser", "", "", "").lastInsertRowid;
    insAssetCat.run(a6, catId("Design Pattern"));
    insAssetAct.run(a6, actId("Model training"));
    insAssetQual.run(a6, qualId("Performance"));
    insAssetTag.run(a6, tagId("hyperparameter-tuning"));
    insAssetTag.run(a6, tagId("optimization"));
    insAssetTag.run(a6, tagId("bayesian"));
    insExemplification.run(a6, "Use Optuna's TPE sampler with 100 trials to tune XGBoost max_depth, learning_rate, and n_estimators.");
    insConsider.run(a6, "Early stopping with pruning reduces wasted compute on poor configurations", "Prune unpromising trials early to allocate budget to better regions of search space");

    const a7 = insAsset.run("Model Monitoring Dashboard Pattern", "", "A reusable design pattern for monitoring deployed ML models.", "Tracks data drift, prediction drift, and performance degradation over time using statistical tests and visualization dashboards.", "Continuous monitoring catches silent model degradation caused by data distribution shifts, enabling timely retraining or rollback decisions.", "", "CatalogueUser", "", "", "").lastInsertRowid;
    insAssetCat.run(a7, catId("Architecture Pattern"));
    insAssetAct.run(a7, actId("Operation"));
    insAssetAct.run(a7, actId("Deployment"));
    insAssetQual.run(a7, qualId("Scalability"));
    insAssetTag.run(a7, tagId("monitoring"));
    insAssetTag.run(a7, tagId("drift-detection"));
    insAssetTag.run(a7, tagId("deployment"));
    insExemplification.run(a7, "Set up alerts when PSI (Population Stability Index) exceeds 0.2 for any input feature.");
    insSolve.run(a7, "Silent model degradation in production due to data distribution shift", "Deploy monitoring dashboards with drift detection alerts", "Early warning of performance drops", "Requires infrastructure investment", "Enables timely retraining or rollback");

    const a8 = insAsset.run("Adversarial Robustness Testing", "ART", "Framework for testing model resilience against adversarial inputs.", "Includes FGSM, PGD, and other attack methods to evaluate model robustness before deployment in safety-critical applications.", "Adversarial testing reveals model fragility by crafting minimal input perturbations that cause misclassification, guiding defensive hardening.", "https://adversarial-robustness-toolbox.readthedocs.io/en/latest/", "CatalogueUser", "", "", "").lastInsertRowid;
    insAssetCat.run(a8, catId("Design Pattern"));
    insAssetAct.run(a8, actId("Software testing"));
    insAssetAct.run(a8, actId("Model building"));
    insAssetQual.run(a8, qualId("Performance"));
    insAssetTag.run(a8, tagId("adversarial"));
    insAssetTag.run(a8, tagId("robustness"));
    insAssetTag.run(a8, tagId("security"));
    insAssetTag.run(a8, tagId("testing"));
    insExemplification.run(a8, "Generate FGSM adversarial examples and measure accuracy drop to quantify robustness.");
    insBeAware.run(a8, "Models robust against one attack type may still be vulnerable to others", "Test against multiple attack methods (FGSM, PGD, C&W) for comprehensive coverage");

    const a9 = insAsset.run("CI/CD Pipeline for ML Models", "MLOps CI/CD", "End-to-end continuous integration and deployment pipeline template for ML workflows.", "Covers automated testing, model validation gates, containerized serving, and rollback strategies.", "Automating the ML lifecycle reduces human error, enforces quality gates, and enables rapid iteration from experiment to production.", "", "CatalogueUser", "", "", "").lastInsertRowid;
    insAssetCat.run(a9, catId("Architecture Pattern"));
    insAssetAct.run(a9, actId("Deployment"));
    insAssetAct.run(a9, actId("Development process"));
    insAssetAct.run(a9, actId("Operation"));
    insAssetQual.run(a9, qualId("Scalability"));
    insAssetTag.run(a9, tagId("ci-cd"));
    insAssetTag.run(a9, tagId("automation"));
    insAssetTag.run(a9, tagId("deployment"));
    insAssetTag.run(a9, tagId("mlops"));
    insExemplification.run(a9, "Use GitHub Actions to trigger model retraining, validation, and container deployment on data changes.");
    insDo.run(a9, "Include model performance gates that block deployment if metrics drop below threshold", "Prevents regression from reaching production");

    const a10 = insAsset.run("Data Augmentation Cookbook", "", "Collection of data augmentation techniques for various data modalities.", "Includes image transformations, text paraphrasing, and tabular data synthesis using SMOTE and similar methods.", "Augmentation artificially increases training set diversity, reducing overfitting and improving generalization without collecting new data.", "https://pytorch.org/vision/stable/transforms.html", "CatalogueUser", "", "", "").lastInsertRowid;
    insAssetCat.run(a10, catId("Design Pattern"));
    insAssetAct.run(a10, actId("Feature engineering"));
    insAssetAct.run(a10, actId("Data engineering"));
    insAssetQual.run(a10, qualId("Performance"));
    insAssetQual.run(a10, qualId("Data quality"));
    insAssetTag.run(a10, tagId("augmentation"));
    insAssetTag.run(a10, tagId("preprocessing"));
    insAssetTag.run(a10, tagId("deep-learning"));
    insExemplification.run(a10, "Apply random rotation, flip, and color jitter to image datasets to improve CNN generalization.");
    insDont.run(a10, "Augment validation/test sets — only training data should be augmented", "Augmenting eval data inflates metrics and hides true performance");

    const a11 = insAsset.run("Privacy-Preserving ML with Differential Privacy", "DP-SGD", "Conceptual resource for integrating differential privacy into ML training pipelines.", "Provides guidance on noise calibration, privacy budgets (epsilon), and trade-offs between privacy and model utility.", "Differential privacy adds calibrated noise to gradients during training, providing a mathematical guarantee that individual records cannot be inferred.", "https://github.com/pytorch/opacus", "InternalOnly", "Opacus: Training PyTorch models with Differential Privacy", "https://opacus.ai/", "Internal reference — sensitivity-aware training guidelines.").lastInsertRowid;
    insAssetCat.run(a11, catId("Design Pattern"));
    insAssetAct.run(a11, actId("Model training"));
    insAssetAct.run(a11, actId("Governance"));
    insAssetQual.run(a11, qualId("Privacy"));
    insAssetQual.run(a11, qualId("Responsibility"));
    insAssetTag.run(a11, tagId("privacy"));
    insAssetTag.run(a11, tagId("differential-privacy"));
    insAssetTag.run(a11, tagId("ethics"));
    insExemplification.run(a11, "Use Opacus to train a PyTorch model with epsilon=1.0 differential privacy guarantee.");
    insConsider.run(a11, "Stronger privacy (lower epsilon) typically reduces model accuracy", "Tune epsilon carefully to balance privacy guarantee with acceptable utility loss");

    const a12 = insAsset.run("Transfer Learning Decision Guide", "TL", "Decision framework for determining when and how to apply transfer learning.", "Covers domain similarity assessment, layer freezing strategies, and fine-tuning best practices for NLP and computer vision tasks.", "Transfer learning leverages features learned on large datasets, dramatically reducing training time and data requirements for new tasks.", "https://huggingface.co/docs/transformers/training", "CatalogueUser", "", "", "").lastInsertRowid;
    insAssetCat.run(a12, catId("Design Pattern"));
    insAssetAct.run(a12, actId("Model training"));
    insAssetAct.run(a12, actId("Model type selection"));
    insAssetQual.run(a12, qualId("Performance"));
    insAssetTag.run(a12, tagId("transfer-learning"));
    insAssetTag.run(a12, tagId("fine-tuning"));
    insAssetTag.run(a12, tagId("nlp"));
    insAssetTag.run(a12, tagId("computer-vision"));
    insExemplification.run(a12, "Fine-tune a pretrained BERT model on domain-specific text classification with frozen lower layers.");
    insDo.run(a12, "Start with frozen pretrained weights and gradually unfreeze layers during fine-tuning", "Prevents catastrophic forgetting of pretrained knowledge");
    insConsider.run(a12, "If source and target domains are very different, transfer learning benefit may be minimal", "Evaluate domain similarity before investing in transfer learning approach");

    // Cross-references
    insRef.run(a1, a8);
    insRef.run(a4, a5);
    insRef.run(a6, a12);
    insRef.run(a7, a9);
    insRef.run(a2, a10);
    insRef.run(a3, a9);
    insRef.run(a11, a5);
  });

  seed();
  const count = db.prepare("SELECT COUNT(*) AS cnt FROM assets").get().cnt;
  console.log(`Auto-seeded ${count} demo assets.`);
})();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// Helpers: load full asset with relations
// ---------------------------------------------------------------------------
function loadAssetFull(assetId) {
  const asset = db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId);
  if (!asset) return null;

  asset.categories = db.prepare(`
    SELECT c.id, c.name FROM categories c
    JOIN asset_categories ac ON ac.category_id = c.id
    WHERE ac.asset_id = ? ORDER BY c.name
  `).all(assetId);

  asset.activities = db.prepare(`
    SELECT a.id, a.name, a.group_name FROM activities a
    JOIN asset_activities aa ON aa.activity_id = a.id
    WHERE aa.asset_id = ? ORDER BY a.group_name, a.name
  `).all(assetId);

  asset.qualities = db.prepare(`
    SELECT q.id, q.name, q.group_name FROM qualities q
    JOIN asset_qualities aq ON aq.quality_id = q.id
    WHERE aq.asset_id = ? ORDER BY q.group_name, q.name
  `).all(assetId);

  asset.tags = db.prepare(`
    SELECT t.id, t.name FROM tags t
    JOIN asset_tags at2 ON at2.tag_id = t.id
    WHERE at2.asset_id = ? ORDER BY t.name
  `).all(assetId);

  asset.solves = db.prepare("SELECT id, problem, solution, pros, cons, consequences FROM asset_solves WHERE asset_id = ?").all(assetId);
  asset.dos = db.prepare("SELECT id, what, reason FROM asset_dos WHERE asset_id = ?").all(assetId);
  asset.donts = db.prepare("SELECT id, what, reason FROM asset_donts WHERE asset_id = ?").all(assetId);
  asset.considers = db.prepare("SELECT id, what, reason FROM asset_considers WHERE asset_id = ?").all(assetId);
  asset.be_awares = db.prepare("SELECT id, of_what, reason FROM asset_be_awares WHERE asset_id = ?").all(assetId);

  asset.exemplifications = db.prepare("SELECT id, text FROM asset_exemplifications WHERE asset_id = ?").all(assetId);

  asset.related = db.prepare(`
    SELECT a.id, a.name FROM assets a
    JOIN asset_references ar ON ar.related_id = a.id
    WHERE ar.asset_id = ?
    UNION
    SELECT a.id, a.name FROM assets a
    JOIN asset_references ar ON ar.asset_id = a.id
    WHERE ar.related_id = ?
  `).all(assetId, assetId);

  return asset;
}

// ---------------------------------------------------------------------------
// API: Assets
// ---------------------------------------------------------------------------

// LIST with filters + sorting
app.get("/api/assets", (req, res) => {
  const { search, category, activity, quality, tag, sort, include_internal } = req.query;

  let sql = "SELECT DISTINCT a.* FROM assets a";
  const joins = [];
  const wheres = [];
  const params = [];

  if (category) {
    joins.push("JOIN asset_categories ac ON ac.asset_id = a.id JOIN categories c ON c.id = ac.category_id");
    wheres.push("c.name = ?");
    params.push(category);
  }
  if (activity) {
    joins.push("JOIN asset_activities aa ON aa.asset_id = a.id JOIN activities act ON act.id = aa.activity_id");
    wheres.push("act.name = ?");
    params.push(activity);
  }
  if (quality) {
    joins.push("JOIN asset_qualities aq ON aq.asset_id = a.id JOIN qualities q ON q.id = aq.quality_id");
    wheres.push("q.name = ?");
    params.push(quality);
  }
  if (tag) {
    joins.push("JOIN asset_tags at2 ON at2.asset_id = a.id JOIN tags t ON t.id = at2.tag_id");
    wheres.push("t.name = ?");
    params.push(tag);
  }
  if (search) {
    wheres.push("(a.name LIKE ? OR a.short_presentation LIKE ? OR a.context LIKE ? OR a.why_and_how LIKE ? OR a.source_url LIKE ? OR a.reference_title LIKE ? OR a.reference_url LIKE ? OR a.reference_note LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term, term, term, term, term, term);
  }
  if (include_internal !== "1") {
    wheres.push("a.visibility = 'CatalogueUser'");
  }

  sql += " " + joins.join(" ");
  if (wheres.length) sql += " WHERE " + wheres.join(" AND ");

  // Sorting
  switch (sort) {
    case "category":
      if (!category) {
        sql = sql.replace("SELECT DISTINCT a.*", "SELECT DISTINCT a.*, COALESCE(csort.name,'') AS _csort");
        sql += " LEFT JOIN asset_categories acsort ON acsort.asset_id = a.id LEFT JOIN categories csort ON csort.id = acsort.category_id";
      }
      sql += " ORDER BY " + (category ? "c.name" : "_csort") + ", a.name";
      break;
    case "activity_group":
      if (!activity) {
        sql = sql.replace("SELECT DISTINCT a.*", "SELECT DISTINCT a.*, COALESCE(asort.group_name,'') AS _agsort");
        sql += " LEFT JOIN asset_activities aasort ON aasort.asset_id = a.id LEFT JOIN activities asort ON asort.id = aasort.activity_id";
      }
      sql += " ORDER BY " + (activity ? "act.group_name" : "_agsort") + ", a.name";
      break;
    case "quality_group":
      if (!quality) {
        sql = sql.replace("SELECT DISTINCT a.*", "SELECT DISTINCT a.*, COALESCE(qsort.group_name,'') AS _qgsort");
        sql += " LEFT JOIN asset_qualities aqsort ON aqsort.asset_id = a.id LEFT JOIN qualities qsort ON qsort.id = aqsort.quality_id";
      }
      sql += " ORDER BY " + (quality ? "q.group_name" : "_qgsort") + ", a.name";
      break;
    case "name":
      sql += " ORDER BY a.name";
      break;
    default:
      sql += " ORDER BY a.updated_at DESC";
  }

  const rows = db.prepare(sql).all(...params);

  // Enrich each row with relations
  const assets = rows.map(r => {
    const full = loadAssetFull(r.id);
    return full;
  });

  res.json(assets);
});

// FILTERS
app.get("/api/assets/filters", (_req, res) => {
  const categories = db.prepare("SELECT id, name FROM categories ORDER BY name").all();
  const activities = db.prepare("SELECT id, name, group_name FROM activities ORDER BY group_name, name").all();
  const qualities = db.prepare("SELECT id, name, group_name FROM qualities ORDER BY group_name, name").all();
  const tags = db.prepare("SELECT id, name FROM tags ORDER BY name").all();

  res.json({ categories, activities, qualities, tags });
});

// GET single
app.get("/api/assets/:id", (req, res) => {
  const asset = loadAssetFull(req.params.id);
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  res.json(asset);
});

// Helper: sync many-to-many
function syncRelation(assetId, table, assetCol, refCol, ids) {
  db.prepare(`DELETE FROM ${table} WHERE ${assetCol} = ?`).run(assetId);
  const ins = db.prepare(`INSERT OR IGNORE INTO ${table} (${assetCol}, ${refCol}) VALUES (?, ?)`);
  for (const id of ids) ins.run(assetId, id);
}

// Helper: sync knowledge blocks (multi-field)
function syncKnowledgeBlock(assetId, table, items) {
  db.prepare(`DELETE FROM ${table} WHERE asset_id = ?`).run(assetId);
  const ins = db.prepare(`INSERT INTO ${table} (asset_id, text) VALUES (?, ?)`);
  for (const item of items) {
    if (typeof item === "string") {
      if (item.trim()) ins.run(assetId, item.trim());
    }
  }
}

function syncSolves(assetId, items) {
  db.prepare("DELETE FROM asset_solves WHERE asset_id = ?").run(assetId);
  const ins = db.prepare("INSERT INTO asset_solves (asset_id, problem, solution, pros, cons, consequences) VALUES (?, ?, ?, ?, ?, ?)");
  for (const it of items) {
    if (it.problem || it.solution || it.pros || it.cons || it.consequences) {
      ins.run(assetId, (it.problem || "").trim(), (it.solution || "").trim(), (it.pros || "").trim(), (it.cons || "").trim(), (it.consequences || "").trim());
    }
  }
}

function syncWhatReason(assetId, table, items) {
  db.prepare(`DELETE FROM ${table} WHERE asset_id = ?`).run(assetId);
  const col = table === "asset_be_awares" ? "of_what" : "what";
  const ins = db.prepare(`INSERT INTO ${table} (asset_id, ${col}, reason) VALUES (?, ?, ?)`);
  for (const it of items) {
    const primary = table === "asset_be_awares" ? it.of_what : it.what;
    if (primary || it.reason) {
      ins.run(assetId, (primary || "").trim(), (it.reason || "").trim());
    }
  }
}

// CREATE
app.post("/api/assets", (req, res) => {
  const b = req.body;
  if (!b.name || !b.name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  const exemplifications = (b.exemplifications || []).filter(t => t && t.trim());
  if (exemplifications.length === 0) {
    return res.status(400).json({ error: "At least one exemplification is required." });
  }

  const visibility = (b.visibility === "InternalOnly") ? "InternalOnly" : "CatalogueUser";

  const save = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO assets (name, aka, short_presentation, context, why_and_how, source_url, visibility, reference_title, reference_url, reference_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.name.trim(),
      (b.aka || "").trim(),
      (b.short_presentation || "").trim(),
      (b.context || "").trim(),
      (b.why_and_how || "").trim(),
      (b.source_url || "").trim(),
      visibility,
      (b.reference_title || "").trim(),
      (b.reference_url || "").trim(),
      (b.reference_note || "").trim()
    );
    const id = info.lastInsertRowid;

    syncRelation(id, "asset_categories", "asset_id", "category_id", b.category_ids || []);
    syncRelation(id, "asset_activities", "asset_id", "activity_id", b.activity_ids || []);
    syncRelation(id, "asset_qualities", "asset_id", "quality_id", b.quality_ids || []);
    syncRelation(id, "asset_tags", "asset_id", "tag_id", b.tag_ids || []);
    syncRelation(id, "asset_references", "asset_id", "related_id", b.related_ids || []);

    syncSolves(id, b.solves || []);
    syncWhatReason(id, "asset_dos", b.dos || []);
    syncWhatReason(id, "asset_donts", b.donts || []);
    syncWhatReason(id, "asset_considers", b.considers || []);
    syncWhatReason(id, "asset_be_awares", b.be_awares || []);
    syncKnowledgeBlock(id, "asset_exemplifications", b.exemplifications || []);

    return id;
  });

  const id = save();
  res.status(201).json(loadAssetFull(id));
});

// UPDATE
app.put("/api/assets/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM assets WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Asset not found" });

  const b = req.body;
  if (!b.name || !b.name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (b.exemplifications !== undefined) {
    const exemplifications = (b.exemplifications || []).filter(t => t && t.trim());
    if (exemplifications.length === 0) {
      return res.status(400).json({ error: "At least one exemplification is required." });
    }
  }

  const visibility = (b.visibility === "InternalOnly") ? "InternalOnly" : "CatalogueUser";

  const save = db.transaction(() => {
    db.prepare(`
      UPDATE assets SET name = ?, aka = ?, short_presentation = ?, context = ?, why_and_how = ?, source_url = ?,
        visibility = ?, reference_title = ?, reference_url = ?, reference_note = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      b.name.trim(),
      (b.aka || "").trim(),
      (b.short_presentation || "").trim(),
      (b.context || "").trim(),
      (b.why_and_how || "").trim(),
      (b.source_url || "").trim(),
      visibility,
      (b.reference_title || "").trim(),
      (b.reference_url || "").trim(),
      (b.reference_note || "").trim(),
      req.params.id
    );

    const id = Number(req.params.id);
    if (b.category_ids !== undefined) syncRelation(id, "asset_categories", "asset_id", "category_id", b.category_ids);
    if (b.activity_ids !== undefined) syncRelation(id, "asset_activities", "asset_id", "activity_id", b.activity_ids);
    if (b.quality_ids !== undefined)  syncRelation(id, "asset_qualities", "asset_id", "quality_id", b.quality_ids);
    if (b.tag_ids !== undefined)      syncRelation(id, "asset_tags", "asset_id", "tag_id", b.tag_ids);

    // Related: clear both directions, re-insert — only if key provided
    if (b.related_ids !== undefined) {
      db.prepare("DELETE FROM asset_references WHERE asset_id = ? OR related_id = ?").run(id, id);
      const insRef = db.prepare("INSERT OR IGNORE INTO asset_references (asset_id, related_id) VALUES (?, ?)");
      for (const rid of b.related_ids) {
        if (rid !== id) insRef.run(id, rid);
      }
    }

    if (b.solves !== undefined)           syncSolves(id, b.solves);
    if (b.dos !== undefined)              syncWhatReason(id, "asset_dos", b.dos);
    if (b.donts !== undefined)            syncWhatReason(id, "asset_donts", b.donts);
    if (b.considers !== undefined)        syncWhatReason(id, "asset_considers", b.considers);
    if (b.be_awares !== undefined)        syncWhatReason(id, "asset_be_awares", b.be_awares);
    if (b.exemplifications !== undefined) syncKnowledgeBlock(id, "asset_exemplifications", b.exemplifications);
  });

  save();
  res.json(loadAssetFull(req.params.id));
});

// DELETE
app.delete("/api/assets/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM assets WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Asset not found" });
  db.prepare("DELETE FROM assets WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// API: Tags CRUD
// ---------------------------------------------------------------------------
app.get("/api/tags", (_req, res) => {
  res.json(db.prepare("SELECT * FROM tags ORDER BY name").all());
});

app.post("/api/tags", (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Tag name is required" });
  const trimmed = name.trim();
  const existing = db.prepare("SELECT * FROM tags WHERE name = ?").get(trimmed);
  if (existing) return res.status(409).json({ error: "Tag already exists" });
  const info = db.prepare("INSERT INTO tags (name) VALUES (?)").run(trimmed);
  res.status(201).json(db.prepare("SELECT * FROM tags WHERE id = ?").get(info.lastInsertRowid));
});

app.put("/api/tags/:id", (req, res) => {
  const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(req.params.id);
  if (!tag) return res.status(404).json({ error: "Tag not found" });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Tag name is required" });
  const newName = name.trim();
  if (newName !== tag.name) {
    const conflict = db.prepare("SELECT * FROM tags WHERE name = ? AND id != ?").get(newName, req.params.id);
    if (conflict) return res.status(409).json({ error: "A tag with that name already exists" });
    db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(newName, req.params.id);
  }
  res.json(db.prepare("SELECT * FROM tags WHERE id = ?").get(req.params.id));
});

app.delete("/api/tags/:id", (req, res) => {
  const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(req.params.id);
  if (!tag) return res.status(404).json({ error: "Tag not found" });
  db.prepare("DELETE FROM asset_tags WHERE tag_id = ?").run(req.params.id);
  db.prepare("DELETE FROM tags WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// API: All assets (minimal, for related-asset picker)
// ---------------------------------------------------------------------------
app.get("/api/assets-list", (_req, res) => {
  res.json(db.prepare("SELECT id, name FROM assets ORDER BY name").all());
});

// ---------------------------------------------------------------------------
// Export — CSV
// ---------------------------------------------------------------------------
app.get("/api/assets/export/csv", (req, res) => {
  const { search, category, activity, quality, tag, sort, include_internal } = req.query;

  // Build same query as list endpoint
  let sql = "SELECT DISTINCT a.* FROM assets a";
  const joins = [];
  const wheres = [];
  const params = [];

  if (category) {
    joins.push("JOIN asset_categories ac ON ac.asset_id = a.id JOIN categories c ON c.id = ac.category_id");
    wheres.push("c.name = ?");
    params.push(category);
  }
  if (activity) {
    joins.push("JOIN asset_activities aa ON aa.asset_id = a.id JOIN activities act ON act.id = aa.activity_id");
    wheres.push("act.name = ?");
    params.push(activity);
  }
  if (quality) {
    joins.push("JOIN asset_qualities aq ON aq.asset_id = a.id JOIN qualities q ON q.id = aq.quality_id");
    wheres.push("q.name = ?");
    params.push(quality);
  }
  if (tag) {
    joins.push("JOIN asset_tags at2 ON at2.asset_id = a.id JOIN tags t ON t.id = at2.tag_id");
    wheres.push("t.name = ?");
    params.push(tag);
  }
  if (search) {
    wheres.push("(a.name LIKE ? OR a.short_presentation LIKE ? OR a.context LIKE ? OR a.why_and_how LIKE ? OR a.reference_title LIKE ? OR a.reference_url LIKE ? OR a.reference_note LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term, term, term, term, term);
  }
  if (include_internal !== "1") {
    wheres.push("a.visibility = 'CatalogueUser'");
  }

  sql += " " + joins.join(" ");
  if (wheres.length) sql += " WHERE " + wheres.join(" AND ");
  sql += " ORDER BY a.name";

  const rows = db.prepare(sql).all(...params);
  const assets = rows.map(r => loadAssetFull(r.id));

  const headers = [
    "ID", "Name", "AKA", "Short Presentation", "Context", "Why and How",
    "Visibility", "Reference Title", "Reference URL", "Reference Note",
    "Categories", "Activities", "Qualities", "Tags",
    "Solves", "Do", "Don't", "Consider", "Be Aware",
    "Exemplifications", "Related Assets", "Source URL", "Created At", "Updated At",
  ];

  function csvCell(val) {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const lines = [headers.map(csvCell).join(",")];
  for (const a of assets) {
    lines.push([
      a.id, a.name, a.aka, a.short_presentation, a.context, a.why_and_how,
      a.visibility, a.reference_title, a.reference_url, a.reference_note,
      a.categories.map(c => c.name).join("; "),
      a.activities.map(act => `${act.group_name}: ${act.name}`).join("; "),
      a.qualities.map(q => `${q.group_name}: ${q.name}`).join("; "),
      a.tags.map(t => t.name).join("; "),
      a.solves.map(s => [s.problem, s.solution, s.pros, s.cons, s.consequences].filter(Boolean).join(" | ")).join("; "),
      a.dos.map(d => [d.what, d.reason].filter(Boolean).join(" | ")).join("; "),
      a.donts.map(d => [d.what, d.reason].filter(Boolean).join(" | ")).join("; "),
      a.considers.map(c => [c.what, c.reason].filter(Boolean).join(" | ")).join("; "),
      a.be_awares.map(b => [b.of_what, b.reason].filter(Boolean).join(" | ")).join("; "),
      a.exemplifications.map(e => e.text).join("; "),
      a.related.map(r => r.name).join("; "),
      a.source_url, a.created_at, a.updated_at,
    ].map(csvCell).join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=ml-assets.csv");
  res.send(lines.join("\n"));
});

// ---------------------------------------------------------------------------
// Export — PDF
// ---------------------------------------------------------------------------
app.get("/api/assets/export/pdf", (req, res) => {
  const { search, category, activity, quality, tag, include_internal } = req.query;

  let sql = "SELECT DISTINCT a.* FROM assets a";
  const joins = [];
  const wheres = [];
  const params = [];

  if (category) {
    joins.push("JOIN asset_categories ac ON ac.asset_id = a.id JOIN categories c ON c.id = ac.category_id");
    wheres.push("c.name = ?");
    params.push(category);
  }
  if (activity) {
    joins.push("JOIN asset_activities aa ON aa.asset_id = a.id JOIN activities act ON act.id = aa.activity_id");
    wheres.push("act.name = ?");
    params.push(activity);
  }
  if (quality) {
    joins.push("JOIN asset_qualities aq ON aq.asset_id = a.id JOIN qualities q ON q.id = aq.quality_id");
    wheres.push("q.name = ?");
    params.push(quality);
  }
  if (tag) {
    joins.push("JOIN asset_tags at2 ON at2.asset_id = a.id JOIN tags t ON t.id = at2.tag_id");
    wheres.push("t.name = ?");
    params.push(tag);
  }
  if (search) {
    wheres.push("(a.name LIKE ? OR a.short_presentation LIKE ? OR a.context LIKE ? OR a.why_and_how LIKE ? OR a.reference_title LIKE ? OR a.reference_url LIKE ? OR a.reference_note LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term, term, term, term, term);
  }
  if (include_internal !== "1") {
    wheres.push("a.visibility = 'CatalogueUser'");
  }

  sql += " " + joins.join(" ");
  if (wheres.length) sql += " WHERE " + wheres.join(" AND ");
  sql += " ORDER BY a.name";

  const rows = db.prepare(sql).all(...params);
  const assets = rows.map(r => loadAssetFull(r.id));

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=ml-assets.pdf");
  doc.pipe(res);

  doc.fontSize(20).font("Helvetica-Bold").text("ML Asset Catalogue", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").fillColor("#666666")
    .text(`${assets.length} asset${assets.length !== 1 ? "s" : ""} exported on ${new Date().toLocaleDateString()}`, { align: "center" });
  doc.moveDown(1);

  const filters = [];
  if (search) filters.push(`Search: "${search}"`);
  if (category) filters.push(`Category: ${category}`);
  if (activity) filters.push(`Activity: ${activity}`);
  if (quality) filters.push(`Quality: ${quality}`);
  if (tag) filters.push(`Tag: ${tag}`);
  if (filters.length > 0) {
    doc.fontSize(9).fillColor("#888888").text("Active filters: " + filters.join(" | "));
    doc.moveDown(0.8);
  }

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  assets.forEach((a, idx) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 150) doc.addPage();

    if (idx > 0) {
      doc.moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.margins.left + pageWidth, doc.y)
        .strokeColor("#dddddd").lineWidth(0.5).stroke();
      doc.moveDown(0.6);
    }

    doc.fontSize(13).font("Helvetica-Bold").fillColor("#0f3460").text(a.name);
    doc.moveDown(0.2);

    function field(label, value) {
      if (!value) return;
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#64748b").text(label.toUpperCase(), { continued: true });
      doc.font("Helvetica").fillColor("#1e293b").text("  " + value);
    }

    if (a.aka) field("AKA", a.aka);
    if (a.short_presentation) {
      doc.fontSize(9).font("Helvetica").fillColor("#333333").text(a.short_presentation);
      doc.moveDown(0.3);
    }
    if (a.context) field("Context", a.context);
    if (a.why_and_how) field("Why and How", a.why_and_how);
    field("Categories", a.categories.map(c => c.name).join(", "));
    field("Activities", a.activities.map(act => `${act.group_name}: ${act.name}`).join(", "));
    field("Qualities", a.qualities.map(q => `${q.group_name}: ${q.name}`).join(", "));
    field("Tags", a.tags.map(t => t.name).join(", "));
    if (a.solves.length) field("Solves", a.solves.map(s => [s.problem, s.solution, s.pros, s.cons, s.consequences].filter(Boolean).join(" | ")).join("; "));
    if (a.dos.length) field("Do", a.dos.map(d => [d.what, d.reason].filter(Boolean).join(" | ")).join("; "));
    if (a.donts.length) field("Don't", a.donts.map(d => [d.what, d.reason].filter(Boolean).join(" | ")).join("; "));
    if (a.considers.length) field("Consider", a.considers.map(c => [c.what, c.reason].filter(Boolean).join(" | ")).join("; "));
    if (a.be_awares.length) field("Be Aware", a.be_awares.map(b => [b.of_what, b.reason].filter(Boolean).join(" | ")).join("; "));
    if (a.exemplifications.length) field("Exemplifications", a.exemplifications.map(e => e.text).join("; "));
    if (a.related.length) field("Related Assets", a.related.map(r => r.name).join(", "));
    field("Source URL", a.source_url);
    if (a.visibility === "InternalOnly") field("Visibility", "Internal Only");
    if (a.reference_title || a.reference_url || a.reference_note) {
      field("Reference", [a.reference_title, a.reference_url, a.reference_note].filter(Boolean).join(" — "));
    }

    doc.moveDown(0.7);
  });

  if (assets.length === 0) {
    doc.fontSize(12).font("Helvetica").fillColor("#999999").text("No assets match the current filters.", { align: "center" });
  }

  doc.end();
});

// ---------------------------------------------------------------------------
// Fallback — SPA
// ---------------------------------------------------------------------------
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`ML Asset Catalogue running on port ${PORT}`);
});
