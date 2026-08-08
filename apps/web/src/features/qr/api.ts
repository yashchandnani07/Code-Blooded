/**
 * Client for the QR record-access endpoints.
 *
 * Kept in its own feature folder rather than lib/api.ts so this can land without
 * touching a file other work edits.
 */

import type { ApiActor } from "@/lib/api";

const API = "/api";

export type QrToken = {
  token: string | null;
  active: boolean;
  created_at?: number;
  expires_at?: number;
  revoked_at?: number | null;
};

export type ScanOutcome =
  | "granted"
  | "consent_pending"
  | "consent_denied"
  | "expired"
  | "revoked"
  | "unknown_token";

export type ScanResult = {
  outcome: ScanOutcome;
  patient_owner_id: string | null;
};

export type QrScan = {
  id: string;
  doctor_id: string;
  scanned_at: number;
  outcome: ScanOutcome;
  purpose: string | null;
};

/**
 * These endpoints verify the Clerk session server-side rather than trusting the
 * x-lumina-* headers the rest of the API uses, so every call must carry a token.
 * The headers are still sent for parity with other routes, but they are ignored.
 */
function headers(actor: ApiActor, token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "x-lumina-user-id": actor.userId,
    "x-lumina-role": actor.role,
  };
}

/** Surface the server's message rather than a generic failure string. */
async function detail(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string" && body.detail.trim()) {
      return new Error(body.detail);
    }
  } catch {
    // fall through to the generic message
  }
  return new Error(fallback);
}

export async function getMyQr(actor: ApiActor, token: string): Promise<QrToken> {
  const res = await fetch(`${API}/patients/me/qr`, { headers: headers(actor, token) });
  if (!res.ok) throw await detail(res, "Could not load your code");
  return res.json();
}

export async function issueMyQr(actor: ApiActor, token: string): Promise<QrToken> {
  const res = await fetch(`${API}/patients/me/qr`, {
    method: "POST",
    headers: headers(actor, token),
  });
  if (!res.ok) throw await detail(res, "Could not generate a code");
  return res.json();
}

export async function revokeMyQr(actor: ApiActor, token: string): Promise<{ revoked: number }> {
  const res = await fetch(`${API}/patients/me/qr`, {
    method: "DELETE",
    headers: headers(actor, token),
  });
  if (!res.ok) throw await detail(res, "Could not revoke your code");
  return res.json();
}

export async function getMyScans(actor: ApiActor, token: string): Promise<QrScan[]> {
  const res = await fetch(`${API}/patients/me/qr/scans`, { headers: headers(actor, token) });
  if (!res.ok) throw await detail(res, "Could not load your access log");
  return res.json();
}

export type PatientRecord = {
  patient_owner_id: string;
  demographics: { name?: string | null; age?: string | null; sex?: string | null };
  diagnoses: {
    case_id: string;
    date: number;
    doctor_id: string;
    top_diagnosis: string | null;
    differentials: string[];
    visit_recommendation: string | null;
  }[];
  submissions: {
    id: string;
    date: number;
    status: string;
    notes: string | null;
    has_photo: boolean;
    has_lab_report: boolean;
    lab_file_name: string | null;
    genetic_evidence: string | null;
    visit_recommendation: string | null;
  }[];
  counts: { submissions: number; diagnoses: number };
};

export async function getPatientRecord(
  actor: ApiActor,
  token: string,
  patientId: string,
): Promise<PatientRecord> {
  const res = await fetch(`${API}/qr/patients/${encodeURIComponent(patientId)}/record`, {
    headers: headers(actor, token),
  });
  if (!res.ok) throw await detail(res, "Could not load the patient record");
  return res.json();
}

export async function scanQr(
  actor: ApiActor,
  authToken: string,
  code: string,
  purpose?: string,
): Promise<ScanResult> {
  const res = await fetch(`${API}/qr/scan`, {
    method: "POST",
    headers: headers(actor, authToken),
    body: JSON.stringify({ token: code, purpose: purpose ?? null }),
  });
  if (!res.ok) throw await detail(res, "Could not read that code");
  return res.json();
}
