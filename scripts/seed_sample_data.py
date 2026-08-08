#!/usr/bin/env python3
"""Seed sample data for Lumina Rare Disease Triage database.

Populates `data/lumina_app.sqlite` with comprehensive patient submissions,
clinical cases, doctor request messages, history consents, QR tokens, and audit logs.
Also updates `database_data_dump.sql`.
"""

import json
import sqlite3
import time
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
DB_PATH = REPO_ROOT / "data" / "lumina_app.sqlite"
DUMP_PATH = REPO_ROOT / "database_data_dump.sql"

def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def create_tables(conn):
    cur = conn.cursor()
    cur.executescript("""
    CREATE TABLE IF NOT EXISTS app_patient_submission (
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

    CREATE TABLE IF NOT EXISTS app_doctor_request_message (
        id TEXT PRIMARY KEY,
        submission_id TEXT,
        doctor_id TEXT,
        message TEXT,
        timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS app_clinical_case (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        updated_at INTEGER,
        doctor_owner_id TEXT,
        submission_id TEXT,
        patient_owner_id TEXT,
        case_json TEXT
    );

    CREATE TABLE IF NOT EXISTS app_patient_history_consent (
        id TEXT PRIMARY KEY,
        patient_owner_id TEXT,
        doctor_id TEXT,
        status TEXT,
        triggered_by_submission_id TEXT,
        requested_at INTEGER,
        decided_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS app_patient_history_summary (
        id TEXT PRIMARY KEY,
        patient_owner_id TEXT UNIQUE,
        summary_markdown TEXT,
        source_case_ids_json TEXT,
        generated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS app_patient_qr_token (
        id TEXT PRIMARY KEY,
        patient_owner_id TEXT,
        token TEXT UNIQUE,
        created_at INTEGER,
        expires_at INTEGER,
        revoked_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS app_qr_scan_audit (
        id TEXT PRIMARY KEY,
        token_id TEXT,
        patient_owner_id TEXT,
        doctor_id TEXT,
        scanned_at INTEGER,
        outcome TEXT,
        purpose TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_app_patient_submission_status ON app_patient_submission(status);
    CREATE INDEX IF NOT EXISTS idx_app_patient_submission_patient_owner_id ON app_patient_submission(patient_owner_id);
    CREATE INDEX IF NOT EXISTS idx_app_patient_submission_doctor_reviewer_id ON app_patient_submission(doctor_reviewer_id);
    CREATE INDEX IF NOT EXISTS idx_app_doctor_request_message_submission_id ON app_doctor_request_message(submission_id);
    CREATE INDEX IF NOT EXISTS idx_app_clinical_case_submission_id ON app_clinical_case(submission_id);
    CREATE INDEX IF NOT EXISTS idx_app_patient_history_consent_patient ON app_patient_history_consent(patient_owner_id);
    CREATE INDEX IF NOT EXISTS idx_app_patient_qr_token_token ON app_patient_qr_token(token);
    """)
    conn.commit()

def seed_data(conn):
    cur = conn.cursor()
    # Clear existing sample data
    tables = [
        "app_patient_submission",
        "app_doctor_request_message",
        "app_clinical_case",
        "app_patient_history_consent",
        "app_patient_history_summary",
        "app_patient_qr_token",
        "app_qr_scan_audit",
    ]
    for t in tables:
        cur.execute(f"DELETE FROM {t};")

    now = int(time.time() * 1000)
    t_day = 86400 * 1000

    # 1. Submissions
    submissions = [
        (
            "sub_marfan_01",
            now - (5 * t_day),
            now - (4 * t_day),
            "pat_alex_mercer",
            "doc_sarah_jenkins",
            "Alex Mercer",
            "16 years",
            "M",
            "16-year-old male presenting with disproportionate tall stature (99th percentile), pectus excavatum, joint hypermobility (Beighton score 7/9), wrist and thumb signs positive, and mild exertion dyspnea.",
            "marfan_pectus.jpg",
            "uploads/sub_marfan_01/photo.jpg",
            "image/jpeg",
            "echocardiogram_report.pdf",
            "uploads/sub_marfan_01/lab.pdf",
            "application/pdf",
            json.dumps({"gene": "FBN1", "variant": "c.1211C>T (p.Pro404Leu)", "zygosity": "heterozygous", "classification": "Pathogenic"}),
            "released",
            "case_marfan_01",
            "Your echocardiogram confirms aortic root dilatation (4.2cm Z-score +3.5). I have issued your urgent Cardiovascular Genetics referral letter and released your summary.",
            json.dumps({
                "summary": "Alex Mercer (16M) was evaluated for tall stature, chest wall deformity, and hypermobility. Clinical scoring strongly indicates Marfan Syndrome supported by a pathogenic FBN1 variant. Referral to Cardiovascular Genetics has been completed.",
                "key_findings": ["Disproportionate tall stature (HP:0001519)", "Aortic root aneurysm/dilatation (HP:0002616)", "Ectopia lentis (HP:0001083)", "Pectus excavatum (HP:0000765)"],
                "next_steps": "Urgent cardiology evaluation and beta-blocker initiation."
            }),
            """# Specialist Referral Letter

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

*Signed electronically by Dr. Sarah Jenkins, MD*""",
            "case_marfan_01",
            now - (4 * t_day),
            "Cardiovascular Genetics & Pediatric Cardiology"
        ),
        (
            "sub_dravet_01",
            now - (3 * t_day),
            now - (2 * t_day),
            "pat_leo_vance",
            "doc_marcus_vance",
            "Leo Vance",
            "6 months",
            "M",
            "6-month-old male infant with recurrent prolonged febrile seizures (hemiclonic, >20 mins) following 4-month vaccination, progressing to status epilepticus. Mild motor developmental delay noted.",
            None, None, None,
            "eeg_telemetry.pdf",
            "uploads/sub_dravet_01/lab.pdf",
            "application/pdf",
            json.dumps({"gene": "SCN1A", "variant": "c.2584C>T (p.Arg862Ter)", "zygosity": "heterozygous", "classification": "Pathogenic", "consequence": "stop_gained"}),
            "case_created",
            "case_dravet_01",
            "Clinical triage completed. SCN1A variant confirms Dravet Syndrome. Referral and treatment plan drafted for review.",
            json.dumps({
                "summary": "Leo Vance (6mo M) presented with fever-induced status epilepticus. SCN1A pathogenic variant confirms Dravet Syndrome (ORPHA:34587). Contraindicated sodium channel blockers highlighted for safety.",
                "key_findings": ["Febrile seizures (HP:0002373)", "Seizures (HP:0001250)", "Global developmental delay (HP:0001263)"]
            }),
            None,
            None,
            None,
            "Pediatric Epilepsy & Neurogenetics"
        ),
        (
            "sub_fabry_01",
            now - (2 * t_day),
            now - (1 * t_day),
            "pat_evan_wright",
            "doc_elena_rostova",
            "Evan Wright",
            "22 years",
            "M",
            "22-year-old male reporting burning acroparesthesia in hands and feet exacerbated by exercise and warm temperature, hypohidrosis, reddish-purple macules (angiokeratomas) on lower trunk, and trace proteinuria.",
            "angiokeratoma_skin.jpg",
            "uploads/sub_fabry_01/photo.jpg",
            "image/jpeg",
            "urinalysis_panel.pdf",
            "uploads/sub_fabry_01/lab.pdf",
            "application/pdf",
            json.dumps({"gene": "GLA", "variant": "c.658C>T (p.Arg220Cys)", "classification": "Pathogenic"}),
            "under_review",
            None,
            "I have reviewed your burning pain symptoms and skin photos. Ordering leukocyte alpha-galactosidase A enzyme test to confirm.",
            None, None, None, None,
            "Metabolic Genetics & Nephrology"
        ),
        (
            "sub_gaucher_01",
            now - (1 * t_day),
            now - (1 * t_day),
            "pat_clara_oswald",
            None,
            "Clara Oswald",
            "42 years",
            "F",
            "42-year-old female presenting with severe splenomegaly (spleen 18 cm), bone pain in femur, easy bruising, fatigue, and persistent thrombocytopenia (platelets 55,000/mcL).",
            None, None, None,
            "cbc_blood_smear.pdf",
            "uploads/sub_gaucher_01/lab.pdf",
            "application/pdf",
            None,
            "submitted",
            None,
            None,
            None, None, None, None,
            "Hematology & Lysosomal Storage Disorders Clinic"
        ),
        (
            "sub_dmd_01",
            now - (7 * t_day),
            now - (6 * t_day),
            "pat_toby_miller",
            "doc_marcus_vance",
            "Toby Miller",
            "5 years",
            "M",
            "5-year-old male with progressive proximal lower extremity weakness, difficulty climbing stairs, positive Gowers sign, calf pseudohypertrophy, and serum CK 14,500 U/L.",
            "gowers_sign_photo.jpg",
            "uploads/sub_dmd_01/photo.jpg",
            "image/jpeg",
            "ck_lab_results.pdf",
            "uploads/sub_dmd_01/lab.pdf",
            "application/pdf",
            json.dumps({"gene": "DMD", "variant": "Exon 45-50 deletion", "classification": "Pathogenic"}),
            "released",
            "case_dmd_01",
            "Urgent referral issued to Neuromuscular Clinic. Corticosteroid consult recommended.",
            json.dumps({
                "summary": "Toby Miller (5M) evaluated for progressive proximal muscle weakness and extreme serum CK elevation. DMD deletion confirms Duchenne Muscular Dystrophy (ORPHA:98896).",
                "next_steps": "Pediatric Neuromuscular Specialist consultation."
            }),
            """# Specialist Referral Letter

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
Immediate evaluation for corticosteroid initiation, cardiac MRI baseline, and physical therapy.""",
            "case_dmd_01",
            now - (6 * t_day),
            "Pediatric Neuromuscular Clinic"
        ),
        (
            "sub_rett_01",
            now - (12 * 3600 * 1000),
            now - (12 * 3600 * 1000),
            "pat_maya_lin",
            None,
            "Maya Lin",
            "2 years",
            "F",
            "2-year-old female who exhibited normal development until 14 months, followed by regression of spoken words, loss of purposeful hand movements, emergence of stereotypic hand-wringing, and deceleration of head growth.",
            None, None, None,
            "developmental_milestones.pdf",
            "uploads/sub_rett_01/lab.pdf",
            "application/pdf",
            json.dumps({"gene": "MECP2", "variant": "c.502C>T (p.Arg168Ter)", "classification": "Pathogenic"}),
            "submitted",
            None,
            None,
            None, None, None, None,
            "Pediatric Neurodevelopmental Genetics"
        )
    ]

    cur.executemany("""
    INSERT INTO app_patient_submission (
        id, timestamp, updated_at, patient_owner_id, doctor_reviewer_id,
        patient_name, age, sex, notes, photo_file_name, photo_path, photo_content_type,
        lab_file_name, lab_path, lab_content_type, genetic_evidence_json, status,
        linked_case_id, latest_doctor_message, patient_summary_json, released_letter_markdown,
        released_case_id, release_timestamp, visit_recommendation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, submissions)

    # 2. Doctor Request Messages
    messages = [
        ("msg_01", "sub_marfan_01", "doc_sarah_jenkins", "Please upload your recent echocardiogram and eye exam records if available.", now - (5 * t_day) + 3600000),
        ("msg_02", "sub_marfan_01", "doc_sarah_jenkins", "Your echocardiogram confirms aortic root dilatation (4.2cm Z-score +3.5). Referral generated.", now - (4 * t_day)),
        ("msg_03", "sub_fabry_01", "doc_elena_rostova", "I am reviewing your symptoms and requesting a plasma alpha-galactosidase A enzyme test to confirm.", now - (1 * t_day)),
        ("msg_04", "sub_dravet_01", "doc_marcus_vance", "Genetic report received confirming SCN1A mutation. Avoid sodium channel blocker anti-epileptics.", now - (2 * t_day))
    ]
    cur.executemany("""
    INSERT INTO app_doctor_request_message (id, submission_id, doctor_id, message, timestamp)
    VALUES (?, ?, ?, ?, ?)
    """, messages)

    # 3. Clinical Cases
    cases = [
        (
            "case_marfan_01",
            now - (4 * t_day),
            now - (4 * t_day),
            "doc_sarah_jenkins",
            "sub_marfan_01",
            "pat_alex_mercer",
            json.dumps({
                "diagnosis": "Marfan syndrome",
                "orpha_code": 558,
                "confidence": 88,
                "accepted_terms": [
                    {"hpo_id": "HP:0001519", "label": "Disproportionate tall stature"},
                    {"hpo_id": "HP:0002616", "label": "Aortic root aneurysm"},
                    {"hpo_id": "HP:0001083", "label": "Ectopia lentis"},
                    {"hpo_id": "HP:0000765", "label": "Pectus excavatum"}
                ],
                "rejected_terms": [
                    {"hpo_id": "HP:0001250", "label": "Seizures"}
                ],
                "candidate_diseases": [
                    {"orpha_code": 558, "name": "Marfan syndrome", "score": 0.88, "matched_hpo_count": 4},
                    {"orpha_code": 284, "name": "Loeys-Dietz syndrome", "score": 0.71, "matched_hpo_count": 3},
                    {"orpha_code": 2140, "name": "Homocystinuria", "score": 0.62, "matched_hpo_count": 2}
                ]
            })
        ),
        (
            "case_dravet_01",
            now - (2 * t_day),
            now - (2 * t_day),
            "doc_marcus_vance",
            "sub_dravet_01",
            "pat_leo_vance",
            json.dumps({
                "diagnosis": "Dravet syndrome",
                "orpha_code": 34587,
                "confidence": 82,
                "accepted_terms": [
                    {"hpo_id": "HP:0002373", "label": "Febrile seizures"},
                    {"hpo_id": "HP:0001250", "label": "Seizures"},
                    {"hpo_id": "HP:0001263", "label": "Global developmental delay"}
                ],
                "rejected_terms": [],
                "candidate_diseases": [
                    {"orpha_code": 34587, "name": "Dravet syndrome", "score": 0.82, "matched_hpo_count": 3},
                    {"orpha_code": 1949, "name": "PCDH19 female limited epilepsy", "score": 0.65, "matched_hpo_count": 2}
                ]
            })
        ),
        (
            "case_dmd_01",
            now - (6 * t_day),
            now - (6 * t_day),
            "doc_marcus_vance",
            "sub_dmd_01",
            "pat_toby_miller",
            json.dumps({
                "diagnosis": "Duchenne muscular dystrophy",
                "orpha_code": 98896,
                "confidence": 90,
                "accepted_terms": [
                    {"hpo_id": "HP:0003236", "label": "Elevated serum creatine kinase"},
                    {"hpo_id": "HP:0001324", "label": "Muscle weakness"},
                    {"hpo_id": "HP:0003701", "label": "Proximal muscle weakness"}
                ],
                "rejected_terms": [],
                "candidate_diseases": [
                    {"orpha_code": 98896, "name": "Duchenne muscular dystrophy", "score": 0.90, "matched_hpo_count": 3},
                    {"orpha_code": 206549, "name": "Becker muscular dystrophy", "score": 0.76, "matched_hpo_count": 3}
                ]
            })
        )
    ]
    cur.executemany("""
    INSERT INTO app_clinical_case (id, timestamp, updated_at, doctor_owner_id, submission_id, patient_owner_id, case_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, cases)

    # 4. Patient History Consents
    consents = [
        ("con_01", "pat_alex_mercer", "doc_sarah_jenkins", "approved", "sub_marfan_01", now - (5 * t_day), now - (5 * t_day) + 600000),
        ("con_02", "pat_evan_wright", "doc_elena_rostova", "approved", "sub_fabry_01", now - (2 * t_day), now - (2 * t_day) + 300000),
        ("con_03", "pat_clara_oswald", "doc_sarah_jenkins", "pending", "sub_gaucher_01", now - (1 * t_day), None),
        ("con_04", "pat_toby_miller", "doc_marcus_vance", "approved", "sub_dmd_01", now - (7 * t_day), now - (7 * t_day) + 1200000)
    ]
    cur.executemany("""
    INSERT INTO app_patient_history_consent (id, patient_owner_id, doctor_id, status, triggered_by_submission_id, requested_at, decided_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, consents)

    # 5. Patient History Summaries
    summaries = [
        (
            "sum_alex",
            "pat_alex_mercer",
            """# Longitudinal Patient History Summary

**Patient:** Alex Mercer (16M)  
**Primary Diagnosis:** Marfan Syndrome (ORPHA:558, FBN1 pathogenic variant)  

### Trajectory Timeline
- **April 2026:** Presented with tall stature, chest deformity, and hypermobility. Echocardiogram revealed aortic root dilatation (4.2cm).
- **Current Status:** Released specialist referral to Cardiovascular Genetics; beta-blocker protocol initiated.""",
            json.dumps(["case_marfan_01"]),
            now - (4 * t_day)
        ),
        (
            "sum_toby",
            "pat_toby_miller",
            """# Longitudinal Patient History Summary

**Patient:** Toby Miller (5M)  
**Primary Diagnosis:** Duchenne Muscular Dystrophy (ORPHA:98896, DMD exon 45-50 deletion)  

### Trajectory Timeline
- **March 2026:** Motor weakness, Gowers sign (+), serum CK 14,500 U/L.
- **Current Status:** Referred to Neuromuscular Care Team.""",
            json.dumps(["case_dmd_01"]),
            now - (6 * t_day)
        )
    ]
    cur.executemany("""
    INSERT INTO app_patient_history_summary (id, patient_owner_id, summary_markdown, source_case_ids_json, generated_at)
    VALUES (?, ?, ?, ?, ?)
    """, summaries)

    # 6. QR Tokens
    tokens = [
        ("qr_alex", "pat_alex_mercer", "LUMINA-QR-ALEX-9921", now - (5 * t_day), now + (30 * t_day), None),
        ("qr_evan", "pat_evan_wright", "LUMINA-QR-EVAN-4412", now - (2 * t_day), now + (30 * t_day), None),
        ("qr_clara", "pat_clara_oswald", "LUMINA-QR-CLARA-1189", now - (1 * t_day), now + (30 * t_day), None)
    ]
    cur.executemany("""
    INSERT INTO app_patient_qr_token (id, patient_owner_id, token, created_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, tokens)

    # 7. QR Scan Audit
    audits = [
        ("audit_01", "qr_alex", "pat_alex_mercer", "doc_sarah_jenkins", now - (5 * t_day) + 300000, "granted", "Specialist Consultation Triage"),
        ("audit_02", "qr_evan", "pat_evan_wright", "doc_elena_rostova", now - (2 * t_day) + 150000, "granted", "Metabolic Pain Assessment")
    ]
    cur.executemany("""
    INSERT INTO app_qr_scan_audit (id, token_id, patient_owner_id, doctor_id, scanned_at, outcome, purpose)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, audits)

    conn.commit()
    print("Database sample data inserted successfully into", DB_PATH)

def dump_sql(conn):
    with open(DUMP_PATH, "w") as f:
        f.write("-- SQLite database data dump for Lumina project\n")
        f.write("PRAGMA foreign_keys=OFF;\n")
        f.write("BEGIN TRANSACTION;\n\n")
        
        for line in conn.iterdump():
            if line.startswith("CREATE TABLE") or line.startswith("CREATE INDEX") or line.startswith("INSERT INTO") or line.startswith("PRAGMA"):
                f.write(line + "\n")
                
        f.write("\nCOMMIT;\n")
    print("Data dump exported successfully to", DUMP_PATH)

def main():
    conn = get_connection()
    create_tables(conn)
    seed_data(conn)
    dump_sql(conn)
    conn.close()

if __name__ == "__main__":
    main()
