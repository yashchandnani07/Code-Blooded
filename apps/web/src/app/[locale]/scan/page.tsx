"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { DashboardNav } from "@/components/nav";
import { RoleGuard } from "@/components/lumina/role-guard";
import { DoctorScanPanel } from "@/features/qr/doctor-scan-panel";
import { PatientRecordView } from "@/features/qr/patient-record-view";

export default function ScanPage() {
  const locale = useLocale();
  const [patientId, setPatientId] = useState<string | null>(null);

  return (
    <RoleGuard allowed={["doctor"]} redirectTo="/patient">
      <div className="min-h-screen bg-[#F7F8FA] text-[#0D1B2A]">
        <DashboardNav />
        <main className="mx-auto max-w-[900px] px-6 pb-24 pt-28">
          <p className="section-label mb-3">Patient lookup</p>
          <h1 className="text-[32px] font-normal leading-tight tracking-[-0.02em]">
            Scan a patient code
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#4A5568]">
            Pull up a patient&rsquo;s history at the point of care, with their consent.
          </p>

          <div className="mt-10 space-y-6">
            {/* Suspense: the panel reads ?code= from the URL when a scan lands here. */}
            <Suspense
              fallback={
                <div className="rounded border border-[#DDE3ED] bg-white p-6 text-[13.5px] text-[#8A94A6]">
                  Loading…
                </div>
              }
            >
              <DoctorScanPanel onGranted={setPatientId} />
            </Suspense>

            {patientId && (
              <section className="rounded border border-[#DDE3ED] bg-white p-6">
                <h2 className="text-[18px] font-normal tracking-[-0.02em]">Patient record</h2>
                <p className="mt-1.5 text-[13.5px] leading-6 text-[#4A5568]">
                  Consent confirmed. Everything this patient has on file:
                </p>
                <div className="mt-5">
                  <PatientRecordView patientId={patientId} />
                </div>
                <Link
                  href={`/${locale}/patient-queue`}
                  className="mt-6 inline-flex h-10 items-center rounded bg-[#0D1B2A] px-6 text-[13.5px] text-white transition-colors hover:bg-[#1C3352]"
                >
                  Open patient queue
                </Link>
              </section>
            )}
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
