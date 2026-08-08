"use client";

import { useState } from "react";
import { useApiActor } from "@/lib/use-api-actor";
import { scanQr, type ScanResult } from "@/features/qr/api";

const OUTCOME_COPY: Record<string, { title: string; body: string; tone: "ok" | "wait" | "bad" }> = {
  granted: {
    title: "Access granted",
    body: "This patient has approved you. Their record is available below.",
    tone: "ok",
  },
  consent_pending: {
    title: "Waiting for the patient",
    body: "A request has been sent. The patient approves it on their device, then scan again.",
    tone: "wait",
  },
  consent_denied: {
    title: "Patient declined",
    body: "This patient has declined you access to their history.",
    tone: "bad",
  },
};

export function DoctorScanPanel({
  onGranted,
}: {
  onGranted?: (patientOwnerId: string) => void;
}) {
  const actor = useApiActor();
  const [code, setCode] = useState("");
  const [purpose, setPurpose] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!actor || actor.role !== "doctor" || !code.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await scanQr(actor, code.trim(), purpose.trim() || undefined);
      setResult(res);
      if (res.outcome === "granted" && res.patient_owner_id) {
        onGranted?.(res.patient_owner_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that code");
    } finally {
      setBusy(false);
    }
  }

  if (!actor || actor.role !== "doctor") return null;

  const copy = result ? OUTCOME_COPY[result.outcome] : null;
  const toneClass =
    copy?.tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : copy?.tone === "wait"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-700";

  return (
    <section className="rounded border border-[#DDE3ED] bg-white p-6">
      <h2 className="text-[18px] font-normal tracking-[-0.02em]">Scan a patient code</h2>
      <p className="mt-1.5 max-w-xl text-[13.5px] leading-6 text-[#4A5568]">
        Enter the code the patient is showing you. Access still depends on their
        approval, and every scan is recorded against your name.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="qr-code" className="block text-[13px] text-[#4A5568]">
            Patient code
          </label>
          <input
            id="qr-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste or type the code"
            autoComplete="off"
            className="mt-1 h-11 w-full rounded border border-[#DDE3ED] px-3 text-[14px] outline-none focus:border-[#0AAFCE]"
          />
        </div>
        <div>
          <label htmlFor="qr-purpose" className="block text-[13px] text-[#4A5568]">
            Reason for access <span className="text-[#8A94A6]">(recorded in the audit log)</span>
          </label>
          <input
            id="qr-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. emergency consultation"
            autoComplete="off"
            className="mt-1 h-11 w-full rounded border border-[#DDE3ED] px-3 text-[14px] outline-none focus:border-[#0AAFCE]"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="inline-flex h-10 items-center rounded bg-[#0AAFCE] px-6 text-[13.5px] text-white transition-colors hover:bg-[#0997B3] disabled:opacity-50"
        >
          {busy ? "Checking…" : "Look up patient"}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </p>
      )}

      {copy && (
        <div className={`mt-4 rounded border px-4 py-3 ${toneClass}`}>
          <p className="text-[14px]">{copy.title}</p>
          <p className="mt-1 text-[13px] leading-5">{copy.body}</p>
        </div>
      )}
    </section>
  );
}
