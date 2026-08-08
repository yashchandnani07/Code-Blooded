"use client";

import { DashboardNav } from "@/components/nav";
import { RoleGuard } from "@/components/lumina/role-guard";
import { PatientQrCard } from "@/features/qr/patient-qr-card";

export default function PatientQrPage() {
  return (
    <RoleGuard allowed={["patient"]} redirectTo="/dashboard">
      <div className="min-h-screen bg-[#F7F8FA] text-[#0D1B2A]">
        <DashboardNav />
        <main className="mx-auto max-w-[900px] px-6 pb-24 pt-28">
          <p className="section-label mb-3">Medical record access</p>
          <h1 className="text-[32px] font-normal leading-tight tracking-[-0.02em]">
            Share your records with a doctor
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#4A5568]">
            Instead of recounting your history at every appointment, show this code.
            You stay in control — the doctor sees nothing until you approve them.
          </p>
          <div className="mt-10">
            <PatientQrCard />
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
