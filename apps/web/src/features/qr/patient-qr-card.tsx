"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@clerk/nextjs";
import { useLocale } from "next-intl";
import { useApiActor } from "@/lib/use-api-actor";
import {
  approveConsentRequestRemote,
  denyConsentRequestRemote,
  getConsentRequestsRemote,
} from "@/lib/api";
import type { ConsentRequest } from "@/types/lumina";
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
  const { getToken } = useAuth();
  const locale = useLocale();
  const [token, setToken] = useState<QrToken | null>(null);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [scanUrl, setScanUrl] = useState<string>("");
  const [scans, setScans] = useState<QrScan[]>([]);
  const [requests, setRequests] = useState<ConsentRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!actor || actor.role !== "patient") return;
    try {
      setError(null);
      const auth = await getToken();
      if (!auth) throw new Error("Please sign in again");
      const [current, log, reqs] = await Promise.all([
        getMyQr(actor, auth),
        getMyScans(actor, auth),
        getConsentRequestsRemote(actor).catch(() => [] as ConsentRequest[]),
      ]);
      setToken(current);
      setScans(log);
      setRequests(reqs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your code");
    }
  }, [actor, getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A doctor scanning raises the request on their device, so poll for it rather
  // than making the patient reload to find out someone is waiting. The in-flight
  // guard matters: this round-trips to a remote database and can take over a
  // second, so without it the requests would overlap and stack up.
  const inFlight = useRef(false);
  useEffect(() => {
    if (!actor || actor.role !== "patient") return;
    const id = setInterval(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        setRequests(await getConsentRequestsRemote(actor));
      } catch {
        // transient; the next tick retries
      } finally {
        inFlight.current = false;
      }
    }, 2000);
    return () => clearInterval(id);
  }, [actor]);

  // Encode a deep link rather than the bare token, so any phone camera opens the
  // scan page with the code already filled in. Rendered client-side so the token
  // is never sent to a third-party chart service.
  useEffect(() => {
    if (!token?.token || !token.active) {
      setDataUrl("");
      setScanUrl("");
      return;
    }
    // NEXT_PUBLIC_APP_URL wins so the code stays scannable from a phone even when
    // this page is open on localhost, which a phone resolves to itself.
    const configured = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
    const origin = configured || (typeof window === "undefined" ? "" : window.location.origin);
    const url = `${origin}/${locale}/scan?code=${encodeURIComponent(token.token)}`;
    setScanUrl(url);
    QRCode.toDataURL(url, { width: 240, margin: 1 })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [token, locale]);

  async function withBusy(fn: (auth: string) => Promise<unknown>) {
    setBusy(true);
    try {
      setError(null);
      const auth = await getToken();
      if (!auth) throw new Error("Please sign in again");
      await fn(auth);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!actor || actor.role !== "patient") return null;

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section className="rounded border-2 border-amber-300 bg-amber-50 p-6">
          <h2 className="text-[18px] font-normal tracking-[-0.02em] text-amber-900">
            {pending.length === 1 ? "A doctor is requesting access" : "Doctors are requesting access"}
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-6 text-amber-800">
            They scanned your code. Nothing is shared until you approve.
          </p>
          <ul className="mt-4 space-y-3">
            {pending.map((req) => (
              <li
                key={req.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-[14px] text-[#0D1B2A]">Doctor {req.doctorId}</p>
                  <p className="text-[12.5px] text-[#8A94A6]">
                    Requested {formatWhen(req.requestedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy(() => approveConsentRequestRemote(req.id, actor))}
                    className="inline-flex h-9 items-center rounded bg-emerald-600 px-4 text-[13px] text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy(() => denyConsentRequestRemote(req.id, actor))}
                    className="inline-flex h-9 items-center rounded border border-[#DDE3ED] bg-white px-4 text-[13px] transition-colors hover:border-[#0D1B2A] disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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

            {scanUrl && (
              <div>
                <p className="text-[12px] uppercase tracking-[0.08em] text-[#8A94A6]">
                  Scanning opens
                </p>
                <code className="mt-1 block break-all rounded bg-[#F7F8FA] px-3 py-2 text-[12px] text-[#4A5568]">
                  {scanUrl}
                </code>
                {scanUrl.includes("localhost") && (
                  <p className="mt-1.5 text-[12.5px] leading-5 text-amber-700">
                    A phone cannot reach <code>localhost</code> — it resolves to the
                    phone itself. Set <code>NEXT_PUBLIC_APP_URL</code> to this
                    machine&rsquo;s network address and restart the dev server to make
                    this code scannable.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {!token?.active ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => withBusy((auth) => issueMyQr(actor, auth))}
                  className="inline-flex h-10 items-center rounded bg-[#0AAFCE] px-5 text-[13.5px] text-white transition-colors hover:bg-[#0997B3] disabled:opacity-50"
                >
                  Generate code
                </button>
              ) : (
                <>
                  {/* Secondary and confirmed: regenerating mid-consultation
                      invalidates the code a doctor is actively using. */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Replace your code?\n\nAny doctor part-way through scanning your current code will have to start again.",
                        )
                      ) {
                        void withBusy((auth) => issueMyQr(actor, auth));
                      }
                    }}
                    className="inline-flex h-10 items-center rounded border border-[#DDE3ED] px-5 text-[13.5px] transition-colors hover:border-[#0D1B2A] disabled:opacity-50"
                  >
                    Replace code
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy((auth) => revokeMyQr(actor, auth))}
                    className="inline-flex h-10 items-center rounded border border-[#DDE3ED] px-5 text-[13.5px] transition-colors hover:border-[#0D1B2A] disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </>
              )}
            </div>
            <p className="text-[12.5px] leading-5 text-[#8A94A6]">
              {token?.active
                ? "This code stays valid until you replace or revoke it — no need to regenerate before each doctor."
                : "Generating a new code immediately stops any old one working."}
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
