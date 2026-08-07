"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useApiActor } from "@/lib/use-api-actor";
import {
  getMyQr,
  getMyScans,
  issueMyQr,
  revokeMyQr,
  type QrScan,
  type QrToken,
} from "@/features/qr/api";

const OUTCOME_LABEL: Record<string, string> = {
  granted: "Access granted",
  consent_pending: "Awaiting your approval",
  consent_denied: "You declined",
  expired: "Expired code",
  revoked: "Revoked code",
  unknown_token: "Unrecognised code",
};

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function PatientQrCard() {
  const actor = useApiActor();
  const [token, setToken] = useState<QrToken | null>(null);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [scans, setScans] = useState<QrScan[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!actor || actor.role !== "patient") return;
    try {
      setError(null);
      const [current, log] = await Promise.all([getMyQr(actor), getMyScans(actor)]);
      setToken(current);
      setScans(log);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your code");
    }
  }, [actor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Render the code client-side so the token is never placed in an <img src>
  // pointing at a third-party chart service.
  useEffect(() => {
    if (!token?.token || !token.active) {
      setDataUrl("");
      return;
    }
    QRCode.toDataURL(token.token, { width: 240, margin: 1 })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [token]);

  async function withBusy(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      setError(null);
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!actor || actor.role !== "patient") return null;

  return (
    <div className="space-y-6">
      <section className="rounded border border-[#DDE3ED] bg-white p-6">
        <h2 className="text-[18px] font-normal tracking-[-0.02em]">Your access code</h2>
        <p className="mt-1.5 max-w-xl text-[13.5px] leading-6 text-[#4A5568]">
          Show this to a doctor so they can request your records. The code holds no
          medical information — it only identifies you, and a doctor still needs your
          approval before seeing anything.
        </p>

        {error && (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex h-[240px] w-[240px] shrink-0 items-center justify-center rounded border border-[#DDE3ED] bg-white">
            {dataUrl ? (
              <img src={dataUrl} alt="Your access code" width={240} height={240} />
            ) : (
              <span className="px-4 text-center text-[13px] text-[#8A94A6]">
                No active code. Generate one to get started.
              </span>
            )}
          </div>

          <div className="flex-1 space-y-4">
            {token?.active && token.expires_at && (
              <p className="text-[13.5px] text-[#4A5568]">
                Expires {formatWhen(token.expires_at)}
              </p>
            )}

            {token?.active && token.token && (
              <div>
                <p className="text-[12px] uppercase tracking-[0.08em] text-[#8A94A6]">
                  Or read it out
                </p>
                <code className="mt-1 block break-all rounded bg-[#F7F8FA] px-3 py-2 text-[12.5px]">
                  {token.token}
                </code>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => withBusy(() => issueMyQr(actor))}
                className="inline-flex h-10 items-center rounded bg-[#0AAFCE] px-5 text-[13.5px] text-white transition-colors hover:bg-[#0997B3] disabled:opacity-50"
              >
                {token?.active ? "Generate new code" : "Generate code"}
              </button>
              {token?.active && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => withBusy(() => revokeMyQr(actor))}
                  className="inline-flex h-10 items-center rounded border border-[#DDE3ED] px-5 text-[13.5px] transition-colors hover:border-[#0D1B2A] disabled:opacity-50"
                >
                  Revoke
                </button>
              )}
            </div>
            <p className="text-[12.5px] leading-5 text-[#8A94A6]">
              Generating a new code immediately stops the old one working.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded border border-[#DDE3ED] bg-white p-6">
        <h2 className="text-[18px] font-normal tracking-[-0.02em]">Who has scanned your code</h2>
        <p className="mt-1.5 text-[13.5px] leading-6 text-[#4A5568]">
          Every attempt is recorded, including ones that were refused.
        </p>

        {scans.length === 0 ? (
          <p className="mt-4 text-[13.5px] text-[#8A94A6]">No scans yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#EEF1F6]">
            {scans.map((scan) => (
              <li key={scan.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <span className="text-[13.5px] text-[#0D1B2A]">
                  {OUTCOME_LABEL[scan.outcome] ?? scan.outcome}
                </span>
                <span className="text-[12.5px] text-[#8A94A6]">{formatWhen(scan.scanned_at)}</span>
                <span className="text-[12.5px] text-[#8A94A6]">doctor {scan.doctor_id}</span>
                {scan.purpose && (
                  <span className="text-[12.5px] text-[#4A5568]">— {scan.purpose}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
