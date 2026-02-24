// Shared seed data — used by seed.js and server.js auto-seed
module.exports = [
  {
    title: "Cross-Validation Strategy",
    description:
      "A reusable pattern for evaluating model performance using k-fold cross-validation. Helps ensure that the model generalizes well to unseen data by partitioning the dataset into k equally sized folds and iterating training and validation across them.",
    category: "Modeling",
    activity: "Model Evaluation",
    quality_attribute: "Reliability",
    tags: "validation,evaluation,best-practice",
    source_url: "https://scikit-learn.org/stable/modules/cross_validation.html",
  },
  {
    title: "Feature Scaling Pipeline",
    description:
      "Standardization and normalization techniques applied as a preprocessing step. Includes Min-Max scaling, Z-score normalization, and robust scaling for handling outliers in feature distributions.",
    category: "Data Management",
    activity: "Data Preprocessing",
    quality_attribute: "Performance",
    tags: "preprocessing,feature-engineering,pipeline",
    source_url: "https://scikit-learn.org/stable/modules/preprocessing.html",
  },
  {
    title: "Data Versioning with DVC",
    description:
      "A conceptual resource for tracking dataset versions alongside code using DVC (Data Version Control). Ensures reproducibility by linking specific data snapshots to model training runs.",
    category: "Data Management",
    activity: "Data Collection",
    quality_attribute: "Reproducibility",
    tags: "versioning,reproducibility,dvc",
    source_url: "https://dvc.org/doc",
  },
  {
    title: "SHAP-based Model Explainability",
    description:
      "Apply SHAP (SHapley Additive exPlanations) values to interpret individual predictions and global feature importance. Provides consistent and theoretically grounded explanations for any ML model.",
    category: "Responsible AI",
    activity: "Model Interpretation",
    quality_attribute: "Explainability",
    tags: "explainability,shap,interpretability",
    source_url: "https://shap.readthedocs.io/en/latest/",
  },
  {
    title: "Bias Detection Checklist",
    description:
      "A structured checklist for identifying potential sources of bias in training data and model predictions. Covers demographic parity, equalized odds, and calibration across protected groups.",
    category: "Responsible AI",
    activity: "Fairness Assessment",
    quality_attribute: "Fairness",
    tags: "fairness,bias,checklist,ethics",
    source_url: "",
  },
  {
    title: "Hyperparameter Tuning with Bayesian Optimization",
    description:
      "Conceptual guide for using Bayesian optimization (e.g., Optuna, Hyperopt) to efficiently search hyperparameter spaces. Reduces compute cost compared to grid or random search while finding better configurations.",
    category: "Modeling",
    activity: "Training",
    quality_attribute: "Performance",
    tags: "hyperparameter-tuning,optimization,bayesian",
    source_url: "https://optuna.readthedocs.io/en/stable/",
  },
  {
    title: "Model Monitoring Dashboard Pattern",
    description:
      "A reusable design pattern for monitoring deployed ML models. Tracks data drift, prediction drift, and performance degradation over time using statistical tests and visualization dashboards.",
    category: "Deployment",
    activity: "Monitoring",
    quality_attribute: "Reliability",
    tags: "monitoring,drift-detection,deployment",
    source_url: "",
  },
  {
    title: "Adversarial Robustness Testing",
    description:
      "Framework for testing model resilience against adversarial inputs. Includes FGSM, PGD, and other attack methods to evaluate model robustness before deployment in safety-critical applications.",
    category: "Testing",
    activity: "Model Evaluation",
    quality_attribute: "Robustness",
    tags: "adversarial,robustness,security,testing",
    source_url: "https://adversarial-robustness-toolbox.readthedocs.io/en/latest/",
  },
  {
    title: "CI/CD Pipeline for ML Models",
    description:
      "End-to-end continuous integration and deployment pipeline template for ML workflows. Covers automated testing, model validation gates, containerized serving, and rollback strategies.",
    category: "Deployment",
    activity: "Deployment Automation",
    quality_attribute: "Maintainability",
    tags: "ci-cd,automation,deployment,mlops",
    source_url: "",
  },
  {
    title: "Data Augmentation Cookbook",
    description:
      "Collection of data augmentation techniques for various data modalities including image transformations, text paraphrasing, and tabular data synthesis using SMOTE and similar methods.",
    category: "Data Management",
    activity: "Data Preprocessing",
    quality_attribute: "Performance",
    tags: "augmentation,preprocessing,deep-learning",
    source_url: "https://pytorch.org/vision/stable/transforms.html",
  },
  {
    title: "Privacy-Preserving ML with Differential Privacy",
    description:
      "Conceptual resource for integrating differential privacy into ML training pipelines. Provides guidance on noise calibration, privacy budgets (epsilon), and trade-offs between privacy and model utility.",
    category: "Responsible AI",
    activity: "Privacy Engineering",
    quality_attribute: "Privacy",
    tags: "privacy,differential-privacy,ethics",
    source_url: "https://github.com/pytorch/opacus",
  },
  {
    title: "Transfer Learning Decision Guide",
    description:
      "Decision framework for determining when and how to apply transfer learning. Covers domain similarity assessment, layer freezing strategies, and fine-tuning best practices for NLP and computer vision tasks.",
    category: "Modeling",
    activity: "Training",
    quality_attribute: "Efficiency",
    tags: "transfer-learning,fine-tuning,nlp,computer-vision",
    source_url: "https://huggingface.co/docs/transformers/training",
  },
];
