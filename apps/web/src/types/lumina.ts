export interface HPOTerm {
  hpo_id: string;
  confidence: number;
  source: string;
  assertion?: "present" | "absent";
  source_type?: "notes" | "lab" | "photo" | "vcf" | "text_panel" | "unknown";
  label?: string;
  definition?: string | null;
  review_status?: "pending" | "accepted" | "rejected" | null;
}

export interface GeneticEvidence {
  gene_symbol: string;
  variant?: string;
  classification: string;
  zygosity?: string;
  inheritance?: string;
  source?: string;
}

export interface RankTermContext {
  hpo_id: string;
  label: string;
  frequency?: number | null;
  patient_confidence?: number | null;
  source?: string | null;
  assertion?: "present" | "absent" | null;
  matched_hpo_id?: string | null;
  matched_label?: string | null;
}

export interface PatientContext {
  patientName?: string;
  age?: string;
  sex?: string;
  dateOfBirth?: string;
  referringPhysicianName?: string;
  referringClinic?: string;
  recipientSpecialist?: string;
  recipientHospital?: string;
  urgency?: string;
}

export interface RankResult {
  orpha_code: number;
  name: string;
  score: number;
  confidence: number;
  contributing_terms: string[];
  missing_terms: string[];
  distinguishing_terms: string[];
  contributing_term_details?: RankTermContext[];
  missing_term_details?: RankTermContext[];
  distinguishing_term_details?: RankTermContext[];
}

export interface CaseData {
  id: string;
  timestamp: number;
  sourceSubmissionId?: string;
  patientOwnerId?: string;
  notes?: string;
  referralLetterDraft?: string;
  inputHistory?: InputSnapshot[];
  modalities: string[];
  hpoTerms: HPOTerm[];
  rankings: RankResult[];
  patientContext?: PatientContext;
  geneticEvidence?: GeneticEvidence[];
  outcome?: CaseOutcome;
}

export interface InputSnapshot {
  timestamp: number;
  notes?: string;
  photo?: {
    fileName?: string;
    isFacial?: boolean;
  };
  lab?: {
    fileName?: string;
  };
  vcf?: {
    fileName?: string;
  };
  genetic?: GeneticEvidence;
}

export type CaseOutcome = "confirmed" | "ruled_out" | "pending";

export interface CaseSummary {
  id: string;
  timestamp: number;
  topDiagnosis: string;
  confidence: number;
  modalities: string[];
  hpoCount: number;
  patientName?: string;
  status?: CaseOutcome;
}

export type VisitRecommendation =
  | "urgent_clinic"
  | "nearest_clinic"
  | "routine_specialist"
  | "more_data_first"
  | "no_visit_needed";

export interface PatientSummary {
  headline: string;
  body: string;
  clinical_area: string;
  recommended_next_step: string;
  specialist: string;
  safety_note: string;
}

export type PatientSubmissionStatus =
  | "submitted"
  | "doctor_review_pending"
  | "in_review"
  | "needs_more_data"
  | "approved"
  | "scorecard_ready"
  | "doctor_completed"
  | "released_to_patient";

export interface PatientSubmission {
  id: string;
  timestamp: number;
  updatedAt?: number;
  patientOwnerId?: string;
  doctorReviewerId?: string | null;
  patientName?: string;
  age?: string;
  sex?: string;
  notes?: string;
  photoFileName?: string;
  labFileName?: string;
  geneticEvidence?: GeneticEvidence;
  status: PatientSubmissionStatus;
  linkedCaseId?: string;
  doctorMessage?: string | null;
  patientSummary?: PatientSummary | null;
  releasedLetterMarkdown?: string | null;
  releasedCaseId?: string | null;
  releaseTimestamp?: number | null;
  visitRecommendation?: VisitRecommendation | null;
  messages?: Array<{ id: string; doctorId: string; message: string; timestamp: number }>;
}

export interface ConsentRequest {
  id: string;
  doctorId: string;
  status: "pending" | "approved" | "denied";
  requestedAt: number;
  decidedAt?: number | null;
  submissionId?: string | null;
}

export interface PatientHistoryTimelineEntry {
  caseId: string;
  doctorId: string;
  date: number;
  topDiagnosis: string;
  visitRecommendation?: string | null;
}

export interface PatientHistoryResponse {
  summary: string;
  timeline: PatientHistoryTimelineEntry[];
}

export interface VoiceSession {
  token: string;
  model: string;
  expiresAt: number;
  sessionExpiresAt: number;
  systemPrompt: string;
  voiceName: string;
  languageCode: string;
}
