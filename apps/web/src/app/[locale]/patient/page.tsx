"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DashboardNav } from "@/components/nav";
import { RoleGuard } from "@/components/lumina/role-guard";
import { VoiceAgentWidget } from "@/components/lumina/voice-agent-widget";
import { getPatientSubmissions, getPatientSubmissionsRemote } from "@/lib/api";
import { useApiActor } from "@/lib/use-api-actor";
import type { PatientSubmission } from "@/types/lumina";
import { Plus, FileText, Inbox } from "lucide-react";

export default function PatientDashboardPage() {
  const locale = useLocale();
  const t = useTranslations("patientDashboard");
  const actor = useApiActor();
  const [fallbackSubmissions] = useState<PatientSubmission[]>(() => getPatientSubmissions());
  const [submissions, setSubmissions] = useState<PatientSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!actor) return;
    getPatientSubmissionsRemote(actor)
      .then(setSubmissions)
      .catch(() => setSubmissions(fallbackSubmissions))
      .finally(() => setLoading(false));
  }, [actor]);

  const ready = submissions.filter((item) => item.status === "released_to_patient").length;

  function statusLabel(status: PatientSubmission["status"]) {
    if (status === "released_to_patient") return t("statusScorecardReady");
    if (status === "needs_more_data") return t("statusNeedsMoreData");
    if (status === "doctor_completed") return t("statusDoctorCompleted");
    if (status === "in_review") return t("statusInReview");
    if (status === "doctor_review_pending") return t("statusPending");
    return t("statusSubmitted");
  }

  function statusBadge(status: PatientSubmission["status"]) {
    if (status === "released_to_patient") return "badge badge-accepted";
    if (status === "needs_more_data" || status === "doctor_review_pending") return "badge badge-amber";
    return "badge badge-cyan";
  }

  return (
    <RoleGuard allowed={["patient"]} redirectTo="/dashboard">
      <div className="min-h-screen bg-[#F7F8FA] text-[#0D1B2A]">
        <DashboardNav />
        <main className="mx-auto max-w-[1200px] px-6 pb-24 pt-28">

          {/* Header */}
          <section className="grid items-center gap-10 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="section-label mb-3">{t("title")}</p>
              <h1 className="text-[36px] font-normal leading-tight tracking-[-0.03em] sm:text-[42px]" dangerouslySetInnerHTML={{ __html: t("headline") }}></h1>
              <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#4A5568]">
                {t("desc")}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href={`/${locale}/patient/new`}
                  className="inline-flex h-10 items-center gap-2 rounded bg-[#0AAFCE] px-6 text-[13.5px] font-normal text-white transition-colors hover:bg-[#0997B3]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("newSubmission")}
                </Link>
                <Link
                  href={`/${locale}/patient/reports`}
                  className="inline-flex h-10 items-center rounded border border-[#DDE3ED] bg-white px-6 text-[13.5px] font-normal text-[#0D1B2A] transition-colors hover:border-[#0D1B2A]"
                >
                  {t("approvedReports")}
                </Link>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: t("submittedCases"), value: submissions.length },
                { label: t("approvedReports"), value: ready },
              ].map((s) => (
                <div key={s.label} className="rounded border border-[#DDE3ED] bg-white p-5 shadow-[0_2px_8px_rgba(13,27,42,0.04)]">
                  <p className="text-[34px] font-normal tracking-[-0.04em] text-[#0D1B2A]">{s.value}</p>
                  <p className="mt-0.5 text-[12px] font-normal text-[#8A94A6]">{s.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Voice agent */}
          <section className="mt-12 rounded border border-[#DDE3ED] bg-white p-6">
            <p className="text-[12px] font-normal uppercase tracking-[0.08em] text-[#8A94A6]">
              {t("voiceSectionTitle")}
            </p>
            <p className="mt-1.5 max-w-xl text-[14px] leading-6 text-[#4A5568]">
              {t("voiceSectionDesc")}
            </p>
            <VoiceAgentWidget />
          </section>

          {/* Submission list */}
          <section className="mt-12">
            <p className="mb-3 text-[12px] font-normal uppercase tracking-[0.08em] text-[#8A94A6]">{t("submissionStatus")}</p>
            <section className="rounded border border-[#DDE3ED] bg-white p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-normal tracking-[-0.02em]">{t("latestSubmission")}</h2>
                <Link
                  href={`/${locale}/patient/submissions`}
                  className="inline-flex h-10 items-center rounded border border-[#DDE3ED] bg-white px-5 text-[13px] font-normal text-[#0D1B2A] transition-colors hover:border-[#0AAFCE] hover:text-[#0AAFCE]"
                >
                  {t("viewSubmissions")}
                </Link>
              </div>
              {loading ? (
                <p className="text-[14px] text-[#4A5568]">{t("loading")}</p>
              ) : submissions.length ? (
                <div className="space-y-3">
                  {submissions.map((item) => (
                    <div key={item.id} className="flex flex-col gap-3 rounded-sm border border-[#E7ECF3] bg-[#FBFCFE] p-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[#E5F8FC]">
                          <FileText className="h-5 w-5 text-[#0AAFCE]" />
                        </div>
                        <div>
                          <p className="text-[15px] font-normal text-[#0D1B2A]">
                            {item.patientName ?? t("unnamedPatient")}
                          </p>
                          <p className="mt-1 text-[12.5px] text-[#8A94A6]">
                            {item.id.slice(0, 8)} · {new Intl.DateTimeFormat(locale, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }).format(new Date(item.timestamp))}
                          </p>
                          {item.doctorMessage && (
                            <p className="mt-2 text-[13px] leading-6 text-[#B54708]">
                              {t("doctorRequestedMoreData")}: {item.doctorMessage}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className={statusBadge(item.status)}>{statusLabel(item.status)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-[#F0F2F5]">
                    <Inbox className="h-6 w-6 text-[#8A94A6]" />
                  </div>
                  <h2 className="mt-4 text-[20px] font-normal">{t("noSubmissionsTitle")}</h2>
                  <p className="mt-1.5 text-[14px] text-[#4A5568]">{t("noSubmissionDesc")}</p>
                </div>
              )}
            </section>
          </section>
        </main>
      </div>
    </RoleGuard>
  );
}
