# Data Source Download Guide

This document describes how to obtain the source datasets required for Lumina's knowledge base.

## Freely Scriptable Sources

### 1. HPO (Human Phenotype Ontology)

**Files needed:**
- `hp.obo` - Ontology in OBO format
- `phenotype.hpoa` - Phenotype annotations (disease-HPO associations)
- `genes_to_phenotype.txt` - Gene-to-phenotype mappings
- `phenotype_to_genes.txt` - Phenotype-to-gene mappings (transitive)

**Download script:**
```bash
uv run python scripts/fetch_hpo.py
```

**Output directory:** `data/hpo/`

**Source URLs:**
- hp.obo: https://purl.obolibrary.org/obo/hp.obo
- phenotype.hpoa: https://github.com/obophenotype/human-phenotype-ontology/releases/latest/download/phenotype.hpoa
- genes_to_phenotype.txt: https://github.com/obophenotype/human-phenotype-ontology/releases/latest/download/genes_to_phenotype.txt
- phenotype_to_genes.txt: https://github.com/obophenotype/human-phenotype-ontology/releases/latest/download/phenotype_to_genes.txt

### 2. ClinVar Gene-Disease Mappings

**Files needed:**
- `gene_condition_source_id` - TSV file mapping genes to diseases/conditions

**Download script:**
```bash
uv run python scripts/fetch_clinvar.py
```

**Output directory:** `data/clinvar/`

**Source URL:**
- https://ftp.ncbi.nlm.nih.gov/pub/clinvar/tab_delimited/gene_condition_source_id.gz

### 3. Orphadata (Orphanet)

Orphanet publishes these under **CC-BY 4.0** at a stable path, so no account or
manual download is needed.

**Files needed (XML products):**
- `en_product1.xml` - Rare diseases and classifications / Cross-referencing
- `en_product4.xml` - Rare diseases with associated phenotypes
- `en_product6.xml` - Genes associated with rare diseases
- `en_product9_prev.xml` - Epidemiological data / Rare disease epidemiology

**Download script:**
```bash
uv run python scripts/fetch_orphadata.py
```

**Output directory:** `data/orphadata/` (~140 MB)

The script writes into the nested layout `packages/ingest/orphadata.py` expects:
   ```
   data/orphadata/
   ├── "Rare diseases and classifications"/
   │   └── "Cross-referencing of rare diseases"/
   │       └── XML/
   │           └── en_product1.xml
   ├── "Rare diseases with associated phenotypes"/
   │   └── en_product4.xml
   ├── "Genes associated with rare diseases"/
   │   └── en_product6.xml
   └── "Epidemiological data"/
       └── "Rare disease epidemiology"/
           └── en_product9_prev.xml
   ```

**Note:** The directory structure must match exactly what `packages/ingest/orphadata.py` expects (see `ORPHADATA` variable and `PRODUCT1`, `PRODUCT4`, `PRODUCT6`, `PRODUCT9_PREV` paths).

### 4. FGDD (Facial Genomics Dataset for Dysmorphology)

**⚠️ Research dataset - requires access request**

**Files needed:**
- `FGDD.csv` - Patient metadata with disease labels
- `diseases.csv` - Disease information
- `relation_sample_phenotype.csv` - Patient-HPO phenotype associations

**Manual steps:**
1. Contact the FGDD data providers (typically through the research group that published the dataset)
2. Request access and sign any required data use agreements
3. Download the dataset files
4. Place in directory structure:
   ```
   data/fgdd/data/
   ├── FGDD.csv
   ├── diseases.csv
   └── relation_sample_phenotype.csv
   ```

---

## Full Ingestion Pipeline

Once all data files are in place, run the complete ingestion:

```bash
cd apps/api
uv run python -m ingest.run
```

Or run individual ingest scripts:
```bash
# Load Orphadata (diseases, phenotypes, genes, prevalence)
uv run python -m ingest.orphadata

# Load HPO ontology and annotations
uv run python -m ingest.hpo

# Load ClinVar gene-disease mappings
uv run python -m ingest.clinvar

# Load FGDD facial phenotype data
uv run python -m ingest.fgdd
```

---

## Training the XGBoost Model

After ingestion completes and `disease_phenotype` is populated:

```bash
cd apps/api
uv run python ../../scripts/train_xgb.py --n-augment 10 --n-estimators 20
```

This trains a multi-class XGBoost classifier and saves it to `packages/scoring/xgb_model.pkl`.

Note that XGBoost builds `n_estimators × n_classes` trees. With ~4,300 diseases
carrying weighted phenotypes, the defaults (200 × 50) mean ~871,000 trees and
roughly 16 hours; the values above finish in ~25 minutes. Scoring works without
a trained model — the ranker falls back to the rule-based path.

---

## Running Tests

Tests require the full Orphadata to be ingested (specifically Dravet syndrome ORPHA:33069 with HPO terms HP:0007359, HP:0001336, HP:0002376).

```bash
cd apps/api
uv run pytest tests/ -v
```

---

## Expected Test Fixtures

The following tests assert on real data that only exists after full Orphadata ingestion:

| Test | Expected ORPHA | Expected Name | Required HPO Terms |
|------|---------------|---------------|-------------------|
| `test_dravet_ranks_top1_with_specific_terms` | 33069 | "Dravet syndrome" | HP:0007359, HP:0001336, HP:0002376 |
| `test_disease_dravet` | 33069 | "Dravet" in name | - |
| `test_score_returns_results` | 33069 | - | HP:0007359, HP:0001336 |

Without the full Orphadata, these tests will fail or be skipped.