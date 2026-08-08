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

function headers(actor: ApiActor): HeadersInit {
  return {
    "Content-Type": "application/json",
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

export async function getMyQr(actor: ApiActor): Promise<QrToken> {
  const res = await fetch(`${API}/patients/me/qr`, { headers: headers(actor) });
  if (!res.ok) throw await detail(res, "Could not load your code");
  return res.json();
}

export async function issueMyQr(actor: ApiActor): Promise<QrToken> {
  const res = await fetch(`${API}/patients/me/qr`, {
    method: "POST",
    headers: headers(actor),
  });
  if (!res.ok) throw await detail(res, "Could not generate a code");
  return res.json();
}

export async function revokeMyQr(actor: ApiActor): Promise<{ revoked: number }> {
  const res = await fetch(`${API}/patients/me/qr`, {
    method: "DELETE",
    headers: headers(actor),
  });
  if (!res.ok) throw await detail(res, "Could not revoke your code");
  return res.json();
}

export async function getMyScans(actor: ApiActor): Promise<QrScan[]> {
  const res = await fetch(`${API}/patients/me/qr/scans`, { headers: headers(actor) });
  if (!res.ok) throw await detail(res, "Could not load your access log");
  return res.json();
}

export async function scanQr(
  actor: ApiActor,
  token: string,
  purpose?: string,
): Promise<ScanResult> {
  const res = await fetch(`${API}/qr/scan`, {
    method: "POST",
    headers: headers(actor),
    body: JSON.stringify({ token, purpose: purpose ?? null }),
  });
  if (!res.ok) throw await detail(res, "Could not read that code");
  return res.json();
}
