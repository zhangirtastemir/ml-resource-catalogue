const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "catalogue.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Drop old tables and recreate
// ---------------------------------------------------------------------------
db.exec("DROP TABLE IF EXISTS asset_references");
db.exec("DROP TABLE IF EXISTS asset_tags");
db.exec("DROP TABLE IF EXISTS asset_qualities");
db.exec("DROP TABLE IF EXISTS asset_activities");
db.exec("DROP TABLE IF EXISTS asset_categories");
db.exec("DROP TABLE IF EXISTS asset_exemplifications");
db.exec("DROP TABLE IF EXISTS asset_solves");
db.exec("DROP TABLE IF EXISTS asset_dos");
db.exec("DROP TABLE IF EXISTS asset_donts");
db.exec("DROP TABLE IF EXISTS asset_considers");
db.exec("DROP TABLE IF EXISTS asset_be_awares");
db.exec("DROP TABLE IF EXISTS assets");
db.exec("DROP TABLE IF EXISTS categories");
db.exec("DROP TABLE IF EXISTS activities");
db.exec("DROP TABLE IF EXISTS qualities");
db.exec("DROP TABLE IF EXISTS tags");
db.exec("DROP TABLE IF EXISTS resources");

// ---------------------------------------------------------------------------
// Create tables
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE activities (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    group_name TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE qualities (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    group_name TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE assets (
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
  CREATE TABLE asset_solves (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id      INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text          TEXT NOT NULL DEFAULT '',
    problem       TEXT NOT NULL DEFAULT '',
    solution      TEXT NOT NULL DEFAULT '',
    pros          TEXT NOT NULL DEFAULT '',
    cons          TEXT NOT NULL DEFAULT '',
    consequences  TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE asset_dos (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text     TEXT NOT NULL DEFAULT '',
    what     TEXT NOT NULL DEFAULT '',
    reason   TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE asset_donts (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text     TEXT NOT NULL DEFAULT '',
    what     TEXT NOT NULL DEFAULT '',
    reason   TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE asset_considers (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text     TEXT NOT NULL DEFAULT '',
    what     TEXT NOT NULL DEFAULT '',
    reason   TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE asset_be_awares (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text     TEXT NOT NULL DEFAULT '',
    of_what  TEXT NOT NULL DEFAULT '',
    reason   TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE asset_exemplifications (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    text     TEXT NOT NULL
  );
  CREATE TABLE asset_categories (
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, category_id)
  );
  CREATE TABLE asset_activities (
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, activity_id)
  );
  CREATE TABLE asset_qualities (
    asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    quality_id INTEGER NOT NULL REFERENCES qualities(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, quality_id)
  );
  CREATE TABLE asset_tags (
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, tag_id)
  );
  CREATE TABLE asset_references (
    asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    related_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, related_id),
    CHECK (asset_id != related_id)
  );
`);

// ---------------------------------------------------------------------------
// Seed lookup data
// ---------------------------------------------------------------------------
const insCategory = db.prepare("INSERT INTO categories (name) VALUES (?)");
insCategory.run("Design Pattern");
insCategory.run("Architecture Pattern");

const insActivity = db.prepare("INSERT INTO activities (name, group_name) VALUES (?, ?)");
// Software Engineering
insActivity.run("Architecture", "Software Engineering");
insActivity.run("Coding", "Software Engineering");
insActivity.run("Deployment", "Software Engineering");
insActivity.run("Development process", "Software Engineering");
insActivity.run("Software design", "Software Engineering");
insActivity.run("Software testing", "Software Engineering");
// Data Engineering
insActivity.run("Data engineering", "Data Engineering");
// ML Engineering
insActivity.run("Model type selection", "ML Engineering");
insActivity.run("Feature engineering", "ML Engineering");
insActivity.run("Model building", "ML Engineering");
insActivity.run("Operation", "ML Engineering");
insActivity.run("Model training", "ML Engineering");
insActivity.run("Data labeling", "ML Engineering");
// Management
insActivity.run("Governance", "Management");
insActivity.run("Project management", "Management");

const insQuality = db.prepare("INSERT INTO qualities (name, group_name) VALUES (?, ?)");
// Software Quality
insQuality.run("Privacy", "Software Quality");
insQuality.run("Scalability", "Software Quality");
insQuality.run("Performance", "Software Quality");
// ML Quality
insQuality.run("Explainability", "ML Quality");
insQuality.run("Interpretability", "ML Quality");
insQuality.run("Reproducibility", "ML Quality");
insQuality.run("Responsibility", "ML Quality");
// Data Quality
insQuality.run("Data quality", "Data Quality");

const insTag = db.prepare("INSERT INTO tags (name) VALUES (?)");
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
seedTags.forEach((t) => insTag.run(t));

// ---------------------------------------------------------------------------
// Helper: get IDs by name
// ---------------------------------------------------------------------------
function catId(name) { return db.prepare("SELECT id FROM categories WHERE name = ?").get(name).id; }
function actId(name) { return db.prepare("SELECT id FROM activities WHERE name = ?").get(name).id; }
function qualId(name) { return db.prepare("SELECT id FROM qualities WHERE name = ?").get(name).id; }
function tagId(name) { return db.prepare("SELECT id FROM tags WHERE name = ?").get(name).id; }

// ---------------------------------------------------------------------------
// Seed assets
// ---------------------------------------------------------------------------
const insAsset = db.prepare(`
  INSERT INTO assets (name, aka, short_presentation, context, why_and_how, source_url, visibility, reference_title, reference_url, reference_note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
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

const seedAll = db.transaction(() => {
  // --- Asset 1: Cross-Validation Strategy ---
  const a1 = insAsset.run(
    "Cross-Validation Strategy", "k-fold CV",
    "A reusable pattern for evaluating model performance using k-fold cross-validation.",
    "Ensures that the model generalizes well to unseen data by partitioning the dataset into k equally sized folds and iterating training and validation across them.",
    "Use k-fold CV to systematically rotate held-out validation sets, providing a robust estimate of generalization error without wasting data.",
    "https://scikit-learn.org/stable/modules/cross_validation.html",
    "CatalogueUser",
    "Cross-validation: evaluating estimator performance",
    "https://scikit-learn.org/stable/modules/cross_validation.html",
    "Official scikit-learn documentation on cross-validation strategies."
  ).lastInsertRowid;
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

  // --- Asset 2: Feature Scaling Pipeline ---
  const a2 = insAsset.run(
    "Feature Scaling Pipeline", "",
    "Standardization and normalization techniques applied as a preprocessing step.",
    "Includes Min-Max scaling, Z-score normalization, and robust scaling for handling outliers in feature distributions.",
    "Many algorithms (SVM, KNN, neural nets) are sensitive to feature magnitude. Scaling ensures equal contribution and faster convergence.",
    "https://scikit-learn.org/stable/modules/preprocessing.html",
    "CatalogueUser", "", "", ""
  ).lastInsertRowid;
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

  // --- Asset 3: Data Versioning with DVC ---
  const a3 = insAsset.run(
    "Data Versioning with DVC", "DVC",
    "A conceptual resource for tracking dataset versions alongside code.",
    "Ensures reproducibility by linking specific data snapshots to model training runs.",
    "DVC tracks large data files alongside Git commits so every experiment can be traced to exact data, code, and config versions.",
    "https://dvc.org/doc",
    "CatalogueUser",
    "DVC Documentation", "https://dvc.org/doc", "Official DVC documentation and tutorials."
  ).lastInsertRowid;
  insAssetCat.run(a3, catId("Design Pattern"));
  insAssetAct.run(a3, actId("Data engineering"));
  insAssetAct.run(a3, actId("Development process"));
  insAssetQual.run(a3, qualId("Reproducibility"));
  insAssetTag.run(a3, tagId("versioning"));
  insAssetTag.run(a3, tagId("reproducibility"));
  insAssetTag.run(a3, tagId("dvc"));
  insExemplification.run(a3, "Tag each training run with the DVC commit hash of the dataset version used.");
  insSolve.run(a3, "Inability to reproduce model results due to dataset changes", "Track data versions alongside code with DVC", "Full traceability of experiments", "Adds tooling complexity", "Every experiment is reproducible");

  // --- Asset 4: SHAP-based Model Explainability ---
  const a4 = insAsset.run(
    "SHAP-based Model Explainability", "SHAP",
    "Apply SHAP values to interpret individual predictions and global feature importance.",
    "Provides consistent and theoretically grounded explanations for any ML model.",
    "SHAP assigns each feature a contribution score based on cooperative game theory, ensuring fair attribution across all input features.",
    "https://shap.readthedocs.io/en/latest/",
    "CatalogueUser", "", "", ""
  ).lastInsertRowid;
  insAssetCat.run(a4, catId("Design Pattern"));
  insAssetAct.run(a4, actId("Model building"));
  insAssetQual.run(a4, qualId("Explainability"));
  insAssetQual.run(a4, qualId("Interpretability"));
  insAssetTag.run(a4, tagId("explainability"));
  insAssetTag.run(a4, tagId("shap"));
  insAssetTag.run(a4, tagId("interpretability"));
  insExemplification.run(a4, "Generate SHAP summary plots to identify which features drive predictions most.");
  insConsider.run(a4, "SHAP computation can be expensive for large datasets", "Consider sampling or using TreeSHAP for tree-based models");

  // --- Asset 5: Bias Detection Checklist (InternalOnly for demo) ---
  const a5 = insAsset.run(
    "Bias Detection Checklist", "",
    "A structured checklist for identifying potential sources of bias.",
    "Covers demographic parity, equalized odds, and calibration across protected groups.",
    "Systematic bias auditing prevents discriminatory outcomes by checking model fairness metrics across protected subgroups before deployment.",
    "",
    "InternalOnly",
    "Fairness and Machine Learning", "https://fairmlbook.org/", "Textbook on fairness considerations in ML."
  ).lastInsertRowid;
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

  // --- Asset 6: Hyperparameter Tuning with Bayesian Optimization ---
  const a6 = insAsset.run(
    "Hyperparameter Tuning with Bayesian Optimization", "Optuna / Hyperopt",
    "Conceptual guide for using Bayesian optimization to efficiently search hyperparameter spaces.",
    "Reduces compute cost compared to grid or random search while finding better configurations.",
    "Bayesian optimization builds a probabilistic surrogate model of the objective function and uses acquisition functions to decide which hyperparameters to evaluate next.",
    "https://optuna.readthedocs.io/en/stable/",
    "CatalogueUser", "", "", ""
  ).lastInsertRowid;
  insAssetCat.run(a6, catId("Design Pattern"));
  insAssetAct.run(a6, actId("Model training"));
  insAssetQual.run(a6, qualId("Performance"));
  insAssetTag.run(a6, tagId("hyperparameter-tuning"));
  insAssetTag.run(a6, tagId("optimization"));
  insAssetTag.run(a6, tagId("bayesian"));
  insExemplification.run(a6, "Use Optuna's TPE sampler with 100 trials to tune XGBoost max_depth, learning_rate, and n_estimators.");
  insConsider.run(a6, "Early stopping with pruning reduces wasted compute on poor configurations", "Prune unpromising trials early to allocate budget to better regions of search space");

  // --- Asset 7: Model Monitoring Dashboard Pattern ---
  const a7 = insAsset.run(
    "Model Monitoring Dashboard Pattern", "",
    "A reusable design pattern for monitoring deployed ML models.",
    "Tracks data drift, prediction drift, and performance degradation over time using statistical tests and visualization dashboards.",
    "Continuous monitoring catches silent model degradation caused by data distribution shifts, enabling timely retraining or rollback decisions.",
    "",
    "CatalogueUser", "", "", ""
  ).lastInsertRowid;
  insAssetCat.run(a7, catId("Architecture Pattern"));
  insAssetAct.run(a7, actId("Operation"));
  insAssetAct.run(a7, actId("Deployment"));
  insAssetQual.run(a7, qualId("Scalability"));
  insAssetTag.run(a7, tagId("monitoring"));
  insAssetTag.run(a7, tagId("drift-detection"));
  insAssetTag.run(a7, tagId("deployment"));
  insExemplification.run(a7, "Set up alerts when PSI (Population Stability Index) exceeds 0.2 for any input feature.");
  insSolve.run(a7, "Silent model degradation in production due to data distribution shift", "Deploy monitoring dashboards with drift detection alerts", "Early warning of performance drops", "Requires infrastructure investment", "Enables timely retraining or rollback");

  // --- Asset 8: Adversarial Robustness Testing ---
  const a8 = insAsset.run(
    "Adversarial Robustness Testing", "ART",
    "Framework for testing model resilience against adversarial inputs.",
    "Includes FGSM, PGD, and other attack methods to evaluate model robustness before deployment in safety-critical applications.",
    "Adversarial testing reveals model fragility by crafting minimal input perturbations that cause misclassification, guiding defensive hardening.",
    "https://adversarial-robustness-toolbox.readthedocs.io/en/latest/",
    "CatalogueUser", "", "", ""
  ).lastInsertRowid;
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

  // --- Asset 9: CI/CD Pipeline for ML Models ---
  const a9 = insAsset.run(
    "CI/CD Pipeline for ML Models", "MLOps CI/CD",
    "End-to-end continuous integration and deployment pipeline template for ML workflows.",
    "Covers automated testing, model validation gates, containerized serving, and rollback strategies.",
    "Automating the ML lifecycle reduces human error, enforces quality gates, and enables rapid iteration from experiment to production.",
    "",
    "CatalogueUser", "", "", ""
  ).lastInsertRowid;
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

  // --- Asset 10: Data Augmentation Cookbook ---
  const a10 = insAsset.run(
    "Data Augmentation Cookbook", "",
    "Collection of data augmentation techniques for various data modalities.",
    "Includes image transformations, text paraphrasing, and tabular data synthesis using SMOTE and similar methods.",
    "Augmentation artificially increases training set diversity, reducing overfitting and improving generalization without collecting new data.",
    "https://pytorch.org/vision/stable/transforms.html",
    "CatalogueUser", "", "", ""
  ).lastInsertRowid;
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

  // --- Asset 11: Privacy-Preserving ML with Differential Privacy (InternalOnly for demo) ---
  const a11 = insAsset.run(
    "Privacy-Preserving ML with Differential Privacy", "DP-SGD",
    "Conceptual resource for integrating differential privacy into ML training pipelines.",
    "Provides guidance on noise calibration, privacy budgets (epsilon), and trade-offs between privacy and model utility.",
    "Differential privacy adds calibrated noise to gradients during training, providing a mathematical guarantee that individual records cannot be inferred.",
    "https://github.com/pytorch/opacus",
    "InternalOnly",
    "Opacus: Training PyTorch models with Differential Privacy",
    "https://opacus.ai/",
    "Internal reference — sensitivity-aware training guidelines."
  ).lastInsertRowid;
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

  // --- Asset 12: Transfer Learning Decision Guide ---
  const a12 = insAsset.run(
    "Transfer Learning Decision Guide", "TL",
    "Decision framework for determining when and how to apply transfer learning.",
    "Covers domain similarity assessment, layer freezing strategies, and fine-tuning best practices for NLP and computer vision tasks.",
    "Transfer learning leverages features learned on large datasets, dramatically reducing training time and data requirements for new tasks.",
    "https://huggingface.co/docs/transformers/training",
    "CatalogueUser", "", "", ""
  ).lastInsertRowid;
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

  // --- Cross-references ---
  insRef.run(a1, a8);   // Cross-Validation <-> Adversarial Testing
  insRef.run(a4, a5);   // SHAP <-> Bias Detection
  insRef.run(a6, a12);  // Hyperparameter Tuning <-> Transfer Learning
  insRef.run(a7, a9);   // Monitoring Dashboard <-> CI/CD Pipeline
  insRef.run(a2, a10);  // Feature Scaling <-> Data Augmentation
  insRef.run(a3, a9);   // Data Versioning <-> CI/CD Pipeline
  insRef.run(a11, a5);  // Differential Privacy <-> Bias Detection
});

seedAll();

const assetCount = db.prepare("SELECT COUNT(*) AS cnt FROM assets").get().cnt;
const tagCount = db.prepare("SELECT COUNT(*) AS cnt FROM tags").get().cnt;
console.log(`Seeded ${assetCount} assets, ${tagCount} tags, and all lookup data into the catalogue.`);
db.close();
