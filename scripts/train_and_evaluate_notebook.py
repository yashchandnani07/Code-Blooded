"""
Model Training & Pipeline Evaluation Generator Script
------------------------------------------------------
Generates a clean, error-free Jupyter Notebook (model_training.ipynb)
with absolute path resolution and ASCII print statements compatible with Windows console encodings.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "packages"))
sys.path.insert(0, str(PROJECT_ROOT / "apps" / "api"))

from ingest.db import get_engine, DB_PATH
from scoring.ml_ranker import XGBoostRanker, MODEL_PATH
from extractors.models import HPOTerm


def generate_jupyter_notebook(notebook_path: Path):
    """Generates a clean Jupyter Notebook with absolute path imports and ASCII print formatting."""
    notebook_content = {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "# Lumina Pipeline: HPO + Orphanet + ClinVar Model Notebook\n",
                    "\n",
                    "## 6-Step Pipeline Architecture:\n",
                    "1. **Datasets**: HPO + Orphanet + ClinVar ingestion from `data/orpha.sqlite` database.\n",
                    "2. **Feature Engineering**: Combining HPO phenotype codes and ClinVar gene pathogenicity.\n",
                    "3. **Pre-trained Model Check & XGBoost**: Checks for pre-trained `xgb_model.pkl` FIRST; loads existing model without re-training.\n",
                    "4. **Disease Ranking**: Predicts top-k rare disease probabilities.\n",
                    "5. **Explainable Similarity Layer**: Computes Lin semantic distance (MICA) and contributing/missing symptoms.\n",
                    "6. **Doctor Validation**: Filters unapproved/rejected AI terms before ranking.\n"
                ]
            },
            {
                "cell_type": "code",
                "execution_count": 1,
                "metadata": {},
                "outputs": [],
                "source": [
                    "import sys\n",
                    "from pathlib import Path\n",
                    "import numpy as np\n",
                    "import pandas as pd\n",
                    "\n",
                    "# Absolute path resolution for VS Code & Jupyter kernels\n",
                    "root_dir = Path.cwd()\n",
                    "if not (root_dir / 'packages').exists() and (root_dir.parent / 'packages').exists():\n",
                    "    root_dir = root_dir.parent\n",
                    "\n",
                    "sys.path.insert(0, str(root_dir / 'packages'))\n",
                    "sys.path.insert(0, str(root_dir / 'apps' / 'api'))\n",
                    "\n",
                    "from ingest.db import get_engine\n",
                    "from scoring.ml_ranker import XGBoostRanker, MODEL_PATH\n",
                    "from extractors.models import HPOTerm\n",
                    "\n",
                    "print('[OK] All imports and environment paths resolved successfully!')\n"
                ]
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "## Step 1 & 2: Pre-trained Model Check (Loads `xgb_model.pkl` first)"
                ]
            },
            {
                "cell_type": "code",
                "execution_count": 2,
                "metadata": {},
                "outputs": [],
                "source": [
                    "engine = get_engine()\n",
                    "ranker = XGBoostRanker(MODEL_PATH)\n",
                    "\n",
                    "if ranker.is_trained():\n",
                    "    print(f'[OK] Loaded pre-trained XGBoost model from {MODEL_PATH}!')\n",
                    "    ranker.load_model()\n",
                    "else:\n",
                    "    print('[INFO] Training new XGBoost model on database dataset...')\n",
                    "    ranker.train(engine)\n"
                ]
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "## Step 3 & 4: Doctor Validation Gate & Disease Ranking\n",
                    "Input draft AI terms, filter rejected terms, and execute XGBoost + Lin semantic distance ranking."
                ]
            },
            {
                "cell_type": "code",
                "execution_count": 3,
                "metadata": {},
                "outputs": [],
                "source": [
                    "sample_query = [\n",
                    "    HPOTerm(hpo_id='HP:0002373', confidence=0.95, source='notes', review_status='accepted'),  # Febrile seizure\n",
                    "    HPOTerm(hpo_id='HP:0001250', confidence=0.92, source='notes', review_status='accepted'),  # Seizure\n",
                    "    HPOTerm(hpo_id='HP:0001519', confidence=0.90, source='notes', review_status='rejected'),  # Rejected Aortic Aneurysm\n",
                    "]\n",
                    "\n",
                    "results = ranker.rank(sample_query, top_k=5)\n",
                    "\n",
                    "print('=== Top Rare Disease Diagnoses ===')\n",
                    "for idx, r in enumerate(results, 1):\n",
                    "    print(f'{idx}. {r.name} (ORPHA:{r.orpha_code}) | Confidence Score: {r.confidence}% | XGB Prob: {r.xgb_probability}')\n"
                ]
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "## Step 5 & 6: Explainable Similarity Layer\n",
                    "Inspect contributing matched symptoms and missing high-frequency features."
                ]
            },
            {
                "cell_type": "code",
                "execution_count": 4,
                "metadata": {},
                "outputs": [],
                "source": [
                    "top_disease = results[0]\n",
                    "print(f'Leading Diagnosis: {top_disease.name}')\n",
                    "print('Contributing Matched HPO Terms:', top_disease.contributing_terms)\n",
                    "print('Missing Symptoms to Check:', top_disease.missing_terms)\n"
                ]
            }
        ],
        "metadata": {
            "language_info": {
                "name": "python"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 4
    }

    notebook_path.parent.mkdir(parents=True, exist_ok=True)
    notebook_path.write_text(json.dumps(notebook_content, indent=2), encoding="utf-8")
    print(f"Jupyter notebook created successfully at: {notebook_path}")


if __name__ == "__main__":
    notebook_path = PROJECT_ROOT / "model_training.ipynb"
    generate_jupyter_notebook(notebook_path)
    print(f"Script executed cleanly. Database path: {DB_PATH}, Model path: {MODEL_PATH}")
