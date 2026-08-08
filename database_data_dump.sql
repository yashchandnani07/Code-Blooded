-- SQLite database data dump for Lumina project
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

CREATE TABLE app_clinical_case (
    id TEXT PRIMARY KEY,
    timestamp INTEGER,
    updated_at INTEGER,
    doctor_owner_id TEXT,
    submission_id TEXT,
    patient_owner_id TEXT,
    case_json TEXT
);
INSERT INTO "app_clinical_case" VALUES('case_marfan_01',1785811326265,1785811326265,'doc_sarah_jenkins','sub_marfan_01','pat_alex_mercer','{"diagnosis": "Marfan syndrome", "orpha_code": 558, "confidence": 88, "accepted_terms": [{"hpo_id": "HP:0001519", "label": "Disproportionate tall stature"}, {"hpo_id": "HP:0002616", "label": "Aortic root aneurysm"}, {"hpo_id": "HP:0001083", "label": "Ectopia lentis"}, {"hpo_id": "HP:0000765", "label": "Pectus excavatum"}], "rejected_terms": [{"hpo_id": "HP:0001250", "label": "Seizures"}], "candidate_diseases": [{"orpha_code": 558, "name": "Marfan syndrome", "score": 0.88, "matched_hpo_count": 4}, {"orpha_code": 284, "name": "Loeys-Dietz syndrome", "score": 0.71, "matched_hpo_count": 3}, {"orpha_code": 2140, "name": "Homocystinuria", "score": 0.62, "matched_hpo_count": 2}]}');
INSERT INTO "app_clinical_case" VALUES('case_dravet_01',1785984126265,1785984126265,'doc_marcus_vance','sub_dravet_01','pat_leo_vance','{"diagnosis": "Dravet syndrome", "orpha_code": 34587, "confidence": 82, "accepted_terms": [{"hpo_id": "HP:0002373", "label": "Febrile seizures"}, {"hpo_id": "HP:0001250", "label": "Seizures"}, {"hpo_id": "HP:0001263", "label": "Global developmental delay"}], "rejected_terms": [], "candidate_diseases": [{"orpha_code": 34587, "name": "Dravet syndrome", "score": 0.82, "matched_hpo_count": 3}, {"orpha_code": 1949, "name": "PCDH19 female limited epilepsy", "score": 0.65, "matched_hpo_count": 2}]}');
INSERT INTO "app_clinical_case" VALUES('case_dmd_01',1785638526265,1785638526265,'doc_marcus_vance','sub_dmd_01','pat_toby_miller','{"diagnosis": "Duchenne muscular dystrophy", "orpha_code": 98896, "confidence": 90, "accepted_terms": [{"hpo_id": "HP:0003236", "label": "Elevated serum creatine kinase"}, {"hpo_id": "HP:0001324", "label": "Muscle weakness"}, {"hpo_id": "HP:0003701", "label": "Proximal muscle weakness"}], "rejected_terms": [], "candidate_diseases": [{"orpha_code": 98896, "name": "Duchenne muscular dystrophy", "score": 0.9, "matched_hpo_count": 3}, {"orpha_code": 206549, "name": "Becker muscular dystrophy", "score": 0.76, "matched_hpo_count": 3}]}');
CREATE TABLE app_doctor_request_message (
    id TEXT PRIMARY KEY,
    submission_id TEXT,
    doctor_id TEXT,
    message TEXT,
    timestamp INTEGER
);
INSERT INTO "app_doctor_request_message" VALUES('msg_01','sub_marfan_01','doc_sarah_jenkins','Please upload your recent echocardiogram and eye exam records if available.',1785728526265);
INSERT INTO "app_doctor_request_message" VALUES('msg_02','sub_marfan_01','doc_sarah_jenkins','Your echocardiogram confirms aortic root dilatation (4.2cm Z-score +3.5). Referral generated.',1785811326265);
INSERT INTO "app_doctor_request_message" VALUES('msg_03','sub_fabry_01','doc_elena_rostova','I am reviewing your symptoms and requesting a plasma alpha-galactosidase A enzyme test to confirm.',1786070526265);
INSERT INTO "app_doctor_request_message" VALUES('msg_04','sub_dravet_01','doc_marcus_vance','Genetic report received confirming SCN1A mutation. Avoid sodium channel blocker anti-epileptics.',1785984126265);
CREATE TABLE app_patient_history_consent (
        id TEXT PRIMARY KEY,
        patient_owner_id TEXT,
        doctor_id TEXT,
        status TEXT,
        triggered_by_submission_id TEXT,
        requested_at INTEGER,
        decided_at INTEGER
    );
INSERT INTO "app_patient_history_consent" VALUES('con_01','pat_alex_mercer','doc_sarah_jenkins','approved','sub_marfan_01',1785724926265,1785725526265);
INSERT INTO "app_patient_history_consent" VALUES('con_02','pat_evan_wright','doc_elena_rostova','approved','sub_fabry_01',1785984126265,1785984426265);
INSERT INTO "app_patient_history_consent" VALUES('con_03','pat_clara_oswald','doc_sarah_jenkins','pending','sub_gaucher_01',1786070526265,NULL);
INSERT INTO "app_patient_history_consent" VALUES('con_04','pat_toby_miller','doc_marcus_vance','approved','sub_dmd_01',1785552126265,1785553326265);
CREATE TABLE app_patient_history_summary (
        id TEXT PRIMARY KEY,
        patient_owner_id TEXT UNIQUE,
        summary_markdown TEXT,
        source_case_ids_json TEXT,
        generated_at INTEGER
    );
INSERT INTO "app_patient_history_summary" VALUES('sum_alex','pat_alex_mercer','# Longitudinal Patient History Summary

**Patient:** Alex Mercer (16M)  
**Primary Diagnosis:** Marfan Syndrome (ORPHA:558, FBN1 pathogenic variant)  

### Trajectory Timeline
- **April 2026:** Presented with tall stature, chest deformity, and hypermobility. Echocardiogram revealed aortic root dilatation (4.2cm).
- **Current Status:** Released specialist referral to Cardiovascular Genetics; beta-blocker protocol initiated.','["case_marfan_01"]',1785811326265);
INSERT INTO "app_patient_history_summary" VALUES('sum_toby','pat_toby_miller','# Longitudinal Patient History Summary

**Patient:** Toby Miller (5M)  
**Primary Diagnosis:** Duchenne Muscular Dystrophy (ORPHA:98896, DMD exon 45-50 deletion)  

### Trajectory Timeline
- **March 2026:** Motor weakness, Gowers sign (+), serum CK 14,500 U/L.
- **Current Status:** Referred to Neuromuscular Care Team.','["case_dmd_01"]',1785638526265);
CREATE TABLE app_patient_qr_token (
        id TEXT PRIMARY KEY,
        patient_owner_id TEXT,
        token TEXT UNIQUE,
        created_at INTEGER,
        expires_at INTEGER,
        revoked_at INTEGER
    );
INSERT INTO "app_patient_qr_token" VALUES('qr_alex','pat_alex_mercer','LUMINA-QR-ALEX-9921',1785724926265,1788748926265,NULL);
INSERT INTO "app_patient_qr_token" VALUES('qr_evan','pat_evan_wright','LUMINA-QR-EVAN-4412',1785984126265,1788748926265,NULL);
INSERT INTO "app_patient_qr_token" VALUES('qr_clara','pat_clara_oswald','LUMINA-QR-CLARA-1189',1786070526265,1788748926265,NULL);
CREATE TABLE app_patient_submission (
    id TEXT PRIMARY KEY,
    timestamp INTEGER,
    updated_at INTEGER,
    patient_owner_id TEXT,
    doctor_reviewer_id TEXT,
    patient_name TEXT,
    age TEXT,
    sex TEXT,
    notes TEXT,
    photo_file_name TEXT,
    photo_path TEXT,
    photo_content_type TEXT,
    lab_file_name TEXT,
    lab_path TEXT,
    lab_content_type TEXT,
    genetic_evidence_json TEXT,
    status TEXT,
    linked_case_id TEXT,
    latest_doctor_message TEXT,
    patient_summary_json TEXT,
    released_letter_markdown TEXT,
    released_case_id TEXT,
    release_timestamp INTEGER,
    visit_recommendation TEXT
);
INSERT INTO "app_patient_submission" VALUES('sub_marfan_01',1785724926265,1785811326265,'pat_alex_mercer','doc_sarah_jenkins','Alex Mercer','16 years','M','16-year-old male presenting with disproportionate tall stature (99th percentile), pectus excavatum, joint hypermobility (Beighton score 7/9), wrist and thumb signs positive, and mild exertion dyspnea.','marfan_pectus.jpg','uploads/sub_marfan_01/photo.jpg','image/jpeg','echocardiogram_report.pdf','uploads/sub_marfan_01/lab.pdf','application/pdf','{"gene": "FBN1", "variant": "c.1211C>T (p.Pro404Leu)", "zygosity": "heterozygous", "classification": "Pathogenic"}','released','case_marfan_01','Your echocardiogram confirms aortic root dilatation (4.2cm Z-score +3.5). I have issued your urgent Cardiovascular Genetics referral letter and released your summary.','{"summary": "Alex Mercer (16M) was evaluated for tall stature, chest wall deformity, and hypermobility. Clinical scoring strongly indicates Marfan Syndrome supported by a pathogenic FBN1 variant. Referral to Cardiovascular Genetics has been completed.", "key_findings": ["Disproportionate tall stature (HP:0001519)", "Aortic root aneurysm/dilatation (HP:0002616)", "Ectopia lentis (HP:0001083)", "Pectus excavatum (HP:0000765)"], "next_steps": "Urgent cardiology evaluation and beta-blocker initiation."}','# Specialist Referral Letter

**To:** Cardiovascular Genetics & Pediatric Cardiology Clinic  
**From:** Dr. Sarah Jenkins, MD (Clinical Genetics)  
**Date:** August 2026  
**Patient:** Alex Mercer (16M, ID: pat_alex_mercer)  

---

### Clinical Summary
Alex presents with physical and cardiovascular findings fulfilling Ghent II diagnostic criteria for **Marfan Syndrome (ORPHA:558)**, further confirmed by a heterozygous pathogenic variant in *FBN1* (c.1211C>T).

### Phenotypic Profile (HPO)
- **HP:0001519**: Disproportionate tall stature
- **HP:0002616**: Aortic root dilatation (4.2 cm, Z-score +3.5)
- **HP:0001083**: Ectopia lentis (bilateral subluxation)
- **HP:0000765**: Pectus excavatum

### Recommendation
1. Urgent cardiology consult for beta-blocker / ARB therapy initiation.
2. Annual echocardiographic monitoring of aortic diameter.
3. Ophthalmologic evaluation for lens dislocation management.

*Signed electronically by Dr. Sarah Jenkins, MD*','case_marfan_01',1785811326265,'Cardiovascular Genetics & Pediatric Cardiology');
INSERT INTO "app_patient_submission" VALUES('sub_dravet_01',1785897726265,1785984126265,'pat_leo_vance','doc_marcus_vance','Leo Vance','6 months','M','6-month-old male infant with recurrent prolonged febrile seizures (hemiclonic, >20 mins) following 4-month vaccination, progressing to status epilepticus. Mild motor developmental delay noted.',NULL,NULL,NULL,'eeg_telemetry.pdf','uploads/sub_dravet_01/lab.pdf','application/pdf','{"gene": "SCN1A", "variant": "c.2584C>T (p.Arg862Ter)", "zygosity": "heterozygous", "classification": "Pathogenic", "consequence": "stop_gained"}','case_created','case_dravet_01','Clinical triage completed. SCN1A variant confirms Dravet Syndrome. Referral and treatment plan drafted for review.','{"summary": "Leo Vance (6mo M) presented with fever-induced status epilepticus. SCN1A pathogenic variant confirms Dravet Syndrome (ORPHA:34587). Contraindicated sodium channel blockers highlighted for safety.", "key_findings": ["Febrile seizures (HP:0002373)", "Seizures (HP:0001250)", "Global developmental delay (HP:0001263)"]}',NULL,NULL,NULL,'Pediatric Epilepsy & Neurogenetics');
INSERT INTO "app_patient_submission" VALUES('sub_fabry_01',1785984126265,1786070526265,'pat_evan_wright','doc_elena_rostova','Evan Wright','22 years','M','22-year-old male reporting burning acroparesthesia in hands and feet exacerbated by exercise and warm temperature, hypohidrosis, reddish-purple macules (angiokeratomas) on lower trunk, and trace proteinuria.','angiokeratoma_skin.jpg','uploads/sub_fabry_01/photo.jpg','image/jpeg','urinalysis_panel.pdf','uploads/sub_fabry_01/lab.pdf','application/pdf','{"gene": "GLA", "variant": "c.658C>T (p.Arg220Cys)", "classification": "Pathogenic"}','under_review',NULL,'I have reviewed your burning pain symptoms and skin photos. Ordering leukocyte alpha-galactosidase A enzyme test to confirm.',NULL,NULL,NULL,NULL,'Metabolic Genetics & Nephrology');
INSERT INTO "app_patient_submission" VALUES('sub_gaucher_01',1786070526265,1786070526265,'pat_clara_oswald',NULL,'Clara Oswald','42 years','F','42-year-old female presenting with severe splenomegaly (spleen 18 cm), bone pain in femur, easy bruising, fatigue, and persistent thrombocytopenia (platelets 55,000/mcL).',NULL,NULL,NULL,'cbc_blood_smear.pdf','uploads/sub_gaucher_01/lab.pdf','application/pdf',NULL,'submitted',NULL,NULL,NULL,NULL,NULL,NULL,'Hematology & Lysosomal Storage Disorders Clinic');
INSERT INTO "app_patient_submission" VALUES('sub_dmd_01',1785552126265,1785638526265,'pat_toby_miller','doc_marcus_vance','Toby Miller','5 years','M','5-year-old male with progressive proximal lower extremity weakness, difficulty climbing stairs, positive Gowers sign, calf pseudohypertrophy, and serum CK 14,500 U/L.','gowers_sign_photo.jpg','uploads/sub_dmd_01/photo.jpg','image/jpeg','ck_lab_results.pdf','uploads/sub_dmd_01/lab.pdf','application/pdf','{"gene": "DMD", "variant": "Exon 45-50 deletion", "classification": "Pathogenic"}','released','case_dmd_01','Urgent referral issued to Neuromuscular Clinic. Corticosteroid consult recommended.','{"summary": "Toby Miller (5M) evaluated for progressive proximal muscle weakness and extreme serum CK elevation. DMD deletion confirms Duchenne Muscular Dystrophy (ORPHA:98896).", "next_steps": "Pediatric Neuromuscular Specialist consultation."}','# Specialist Referral Letter

**To:** Pediatric Neuromuscular Care Center  
**From:** Dr. Marcus Vance, MD (Neurology)  
**Date:** August 2026  
**Patient:** Toby Miller (5M, ID: pat_toby_miller)  

### Clinical Evaluation
Toby presents with hallmark clinical signs of **Duchenne Muscular Dystrophy (ORPHA:98896)**:
- Gowers sign positive
- Calf muscle pseudohypertrophy (HP:0003701)
- Serum CK > 14,000 U/L (HP:0003236)
- DMD hemizygous exon 45-50 deletion

### Plan
Immediate evaluation for corticosteroid initiation, cardiac MRI baseline, and physical therapy.','case_dmd_01',1785638526265,'Pediatric Neuromuscular Clinic');
INSERT INTO "app_patient_submission" VALUES('sub_rett_01',1786113726265,1786113726265,'pat_maya_lin',NULL,'Maya Lin','2 years','F','2-year-old female who exhibited normal development until 14 months, followed by regression of spoken words, loss of purposeful hand movements, emergence of stereotypic hand-wringing, and deceleration of head growth.',NULL,NULL,NULL,'developmental_milestones.pdf','uploads/sub_rett_01/lab.pdf','application/pdf','{"gene": "MECP2", "variant": "c.502C>T (p.Arg168Ter)", "classification": "Pathogenic"}','submitted',NULL,NULL,NULL,NULL,NULL,NULL,'Pediatric Neurodevelopmental Genetics');
CREATE TABLE app_qr_scan_audit (
        id TEXT PRIMARY KEY,
        token_id TEXT,
        patient_owner_id TEXT,
        doctor_id TEXT,
        scanned_at INTEGER,
        outcome TEXT,
        purpose TEXT
    );
INSERT INTO "app_qr_scan_audit" VALUES('audit_01','qr_alex','pat_alex_mercer','doc_sarah_jenkins',1785725226265,'granted','Specialist Consultation Triage');
INSERT INTO "app_qr_scan_audit" VALUES('audit_02','qr_evan','pat_evan_wright','doc_elena_rostova',1785984276265,'granted','Metabolic Pain Assessment');
CREATE TABLE clinvar_gene_disease (
	id INTEGER NOT NULL, 
	gene_id INTEGER, 
	gene_symbol VARCHAR NOT NULL, 
	concept_id VARCHAR NOT NULL, 
	disease_name VARCHAR NOT NULL, 
	source_name VARCHAR, 
	source_id VARCHAR, 
	disease_mim INTEGER, 
	PRIMARY KEY (id)
);
CREATE TABLE cross_ref (
	id INTEGER NOT NULL, 
	orpha_code INTEGER NOT NULL, 
	source VARCHAR NOT NULL, 
	reference VARCHAR NOT NULL, 
	mapping_relation VARCHAR NOT NULL, 
	PRIMARY KEY (id)
);
CREATE TABLE disease (
	orpha_code INTEGER NOT NULL, 
	name VARCHAR NOT NULL, 
	disorder_type VARCHAR NOT NULL, 
	disorder_group VARCHAR NOT NULL, 
	PRIMARY KEY (orpha_code)
);
CREATE TABLE disease_gene (
	id INTEGER NOT NULL, 
	orpha_code INTEGER NOT NULL, 
	gene_symbol VARCHAR NOT NULL, 
	gene_name VARCHAR NOT NULL, 
	ensembl_id VARCHAR, 
	PRIMARY KEY (id)
);
CREATE TABLE disease_phenotype (
	id INTEGER NOT NULL, 
	orpha_code INTEGER NOT NULL, 
	hpo_id VARCHAR NOT NULL, 
	hpo_term VARCHAR NOT NULL, 
	frequency_label VARCHAR NOT NULL, 
	frequency_weight FLOAT NOT NULL, 
	PRIMARY KEY (id)
);
CREATE TABLE facial_disease_phenotype (
	id INTEGER NOT NULL, 
	disease_id INTEGER, 
	disease_name VARCHAR NOT NULL, 
	hpo_id VARCHAR NOT NULL, 
	count INTEGER NOT NULL, 
	PRIMARY KEY (id)
);
CREATE TABLE hpo_ancestor (
	id INTEGER NOT NULL, 
	hpo_id VARCHAR NOT NULL, 
	ancestor_id VARCHAR NOT NULL, 
	PRIMARY KEY (id)
);
CREATE TABLE hpo_term (
	hpo_id VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	definition VARCHAR, 
	ic FLOAT, 
	PRIMARY KEY (hpo_id)
);
CREATE TABLE prevalence (
	id INTEGER NOT NULL, 
	orpha_code INTEGER NOT NULL, 
	prevalence_type VARCHAR NOT NULL, 
	prevalence_class VARCHAR, 
	val_moy FLOAT, 
	geographic VARCHAR NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX idx_app_patient_submission_status ON app_patient_submission(status);
CREATE INDEX idx_app_patient_submission_patient_owner_id ON app_patient_submission(patient_owner_id);
CREATE INDEX idx_app_patient_submission_doctor_reviewer_id ON app_patient_submission(doctor_reviewer_id);
CREATE INDEX idx_app_doctor_request_message_submission_id ON app_doctor_request_message(submission_id);
CREATE INDEX idx_app_clinical_case_submission_id ON app_clinical_case(submission_id);
CREATE INDEX ix_cross_ref_orpha_code ON cross_ref (orpha_code);
CREATE INDEX ix_disease_phenotype_hpo_id ON disease_phenotype (hpo_id);
CREATE INDEX ix_disease_phenotype_orpha_code ON disease_phenotype (orpha_code);
CREATE INDEX ix_disease_gene_gene_symbol ON disease_gene (gene_symbol);
CREATE INDEX ix_disease_gene_orpha_code ON disease_gene (orpha_code);
CREATE INDEX ix_prevalence_orpha_code ON prevalence (orpha_code);
CREATE INDEX ix_hpo_ancestor_hpo_id ON hpo_ancestor (hpo_id);
CREATE INDEX ix_hpo_ancestor_ancestor_id ON hpo_ancestor (ancestor_id);
CREATE INDEX ix_clinvar_gene_disease_gene_symbol ON clinvar_gene_disease (gene_symbol);
CREATE INDEX ix_facial_disease_phenotype_hpo_id ON facial_disease_phenotype (hpo_id);
CREATE INDEX idx_app_patient_history_consent_patient ON app_patient_history_consent(patient_owner_id);
CREATE INDEX idx_app_patient_qr_token_token ON app_patient_qr_token(token);

COMMIT;
