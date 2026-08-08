# ML & Data Workspace

Everything needed to populate the knowledge base and train the disease ranker,
kept out of `apps/` and `packages/` so the app tree stays small.

```
ml/
├── data/            source datasets (gitignored, ~130 MB and growing)
│   ├── hpo/           auto-downloaded
│   ├── clinvar/       auto-downloaded
│   ├── orphadata/     MANUAL — see below
│   └── fgdd/data/     MANUAL — access request
├── models/          trained artifacts (gitignored)
└── README.md
```

The ingest reads `LUMINA_DATA_DIR` from the root `.env`; it already points here.
Unset it and everything falls back to `<repo>/data` as before.

All commands run from `apps/api`, which owns the virtualenv:

```bash
cd apps/api
```

## 1. Fetch the open datasets

```bash
uv run python ../../scripts/fetch_hpo.py     --data-dir ../../ml/data/hpo
uv run python ../../scripts/fetch_clinvar.py --data-dir ../../ml/data/clinvar
```

Downloads ~134 MB: `hp.obo`, `phenotype.hpoa`, `genes_to_phenotype.txt`,
`phenotype_to_genes.txt`, and ClinVar's `gene_condition_source_id`.

## 2. Add the gated datasets by hand

Neither can be scripted — both need terms accepted or access granted.

**Orphadata** — https://www.orphadata.com/, accept terms, download the English
XML products and unzip into the exact layout `packages/ingest/orphadata.py`
expects:

```
ml/data/orphadata/
├── Rare diseases and classifications/
│   └── Cross-referencing of rare diseases/XML/en_product1.xml
├── Rare diseases with associated phenotypes/en_product4.xml
├── Genes associated with rare diseases/en_product6.xml
└── Epidemiological data/Rare disease epidemiology/en_product9_prev.xml
```

**FGDD** — request access from the publishing group, then place `FGDD.csv`,
`diseases.csv`, and `relation_sample_phenotype.csv` in `ml/data/fgdd/data/`.

## 3. Ingest into Supabase

Individually — each is independent and re-runnable (they truncate their own
tables first):

```bash
uv run python -m ingest.hpo        # hpo_term, hpo_ancestor
uv run python -m ingest.clinvar    # clinvar_gene_disease
uv run python -m ingest.orphadata  # disease, disease_phenotype, disease_gene, …
uv run python -m ingest.fgdd       # facial_disease_phenotype
```

Or all four in dependency order, once every dataset is present:

```bash
uv run python -m ingest.run
```

## 4. Train the ranker

Requires `disease_phenotype` to be populated, i.e. Orphadata ingested first.

```bash
uv run python ../../scripts/train_xgb.py --n-augment 50
```

Writes `packages/scoring/xgb_model.pkl` alongside the `_xgb_hpo_vocab.json`
feature vocabulary.

## Checking what actually landed

```bash
uv run python -c "
from sqlalchemy import text
from ingest.db import get_engine
with get_engine().connect() as c:
    for t in ('hpo_term','hpo_ancestor','clinvar_gene_disease','disease',
              'disease_phenotype','disease_gene','cross_ref','prevalence'):
        print(f'{t:<22}', c.execute(text(f'select count(*) from {t}')).scalar())
"
```

## Notes
 
- `DATA_SOURCES.md` at the repo root says `ingest.pipeline`; the module is
  actually `ingest.run`. It also predates the Supabase migration, so ignore its
  references to `data/orpha.sqlite` — everything writes to `DATABASE_URL` now.
- The HPO fetch tracks the `latest` GitHub release. It previously pinned
  `v2024-03-01`, which upstream removed, so all three annotation files 404'd.
- ClinVar's `gene_condition_source_id` lives at the clinvar FTP root and is
  served uncompressed, not under `tab_delimited/` and not gzipped.
- `ingest.hpo` prefers `ml/data/hpo` when present and otherwise falls back to
  the ontology bundled with `pyhpo`. The fallback carries the full term set but
  no Orpha annotations, so information content comes back empty — fine for term
  extraction, not for IC-weighted scoring.
