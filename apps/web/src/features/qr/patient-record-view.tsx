"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApiActor } from "@/lib/use-api-actor";
import { getPatientRecord, type PatientRecord } from "@/features/qr/api";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_LABEL: Record<string, string> = {
  doctor_review_pending: "Awaiting review",
  in_review: "In review",
  needs_more_data: "More information requested",
  doctor_completed: "Reviewed",
  released_to_patient: "Released to patient",
};

/** Everything on file for a patient, shown once consent is confirmed. */
export function PatientRecordView({ patientId }: { patientId: string }) {
  const actor = useApiActor();
  const { getToken } = useAuth();
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!actor || actor.role !== "doctor") return;
      try {
        const auth = await getToken();
        if (!auth) throw new Error("Please sign in again");
        const data = await getPatientRecord(actor, auth, patientId);
        if (!cancelled) setRecord(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load record");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actor, getToken, patientId]);

  if (error) {
    return (
      <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
        {error}
      </p>
    );
  }

  if (!record) {
    return <p className="text-[13.5px] text-[#8A94A6]">Loading record…</p>;
  }

  const { demographics: d } = record;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-8 gap-y-2 rounded bg-[#F7F8FA] px-4 py-3">
        <span className="text-[14px] text-[#0D1B2A]">{d.name || "Name not recorded"}</span>
        {d.age && <span className="text-[13.5px] text-[#4A5568]">Age {d.age}</span>}
        {d.sex && <span className="text-[13.5px] text-[#4A5568]">{d.sex}</span>}
        <span className="text-[13px] text-[#8A94A6]">
          {record.counts.diagnoses} prior assessment{record.counts.diagnoses === 1 ? "" : "s"} ·{" "}
          {record.counts.submissions} submission{record.counts.submissions === 1 ? "" : "s"}
        </span>
      </div>

      <section>
        <h3 className="text-[15px] font-normal text-[#0D1B2A]">Prior assessments</h3>
        {record.diagnoses.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-[#8A94A6]">No completed assessments yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {record.diagnoses.map((dx) => (
              <li key={dx.case_id} className="rounded border border-[#DDE3ED] p-4">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[14px] text-[#0D1B2A]">
                    {dx.top_diagnosis || "No ranked diagnosis"}
                  </span>
                  <span className="text-[12.5px] text-[#8A94A6]">{formatDate(dx.date)}</span>
                </div>
                {dx.differentials.length > 0 && (
                  <p className="mt-1.5 text-[13px] text-[#4A5568]">
                    Differentials: {dx.differentials.join(", ")}
                  </p>
                )}
                {dx.visit_recommendation && (
                  <p className="mt-1.5 text-[13px] text-[#4A5568]">
                    Recommendation: {dx.visit_recommendation}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-[15px] font-normal text-[#0D1B2A]">Submitted evidence</h3>
        {record.submissions.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-[#8A94A6]">Nothing submitted yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {record.submissions.map((s) => (
              <li key={s.id} className="rounded border border-[#DDE3ED] p-4">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[12.5px] text-[#8A94A6]">{formatDate(s.date)}</span>
                  <span className="text-[12.5px] text-[#4A5568]">
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </div>
                {s.notes && (
                  <p className="mt-2 text-[13.5px] leading-6 text-[#0D1B2A]">{s.notes}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.has_photo && (
                    <span className="rounded bg-[#E5F8FC] px-2 py-0.5 text-[12px] text-[#0AAFCE]">
                      clinical photo
                    </span>
                  )}
                  {s.has_lab_report && (
                    <span className="rounded bg-[#E5F8FC] px-2 py-0.5 text-[12px] text-[#0AAFCE]">
                      lab report{s.lab_file_name ? `: ${s.lab_file_name}` : ""}
                    </span>
                  )}
                  {s.genetic_evidence && (
                    <span className="rounded bg-[#E5F8FC] px-2 py-0.5 text-[12px] text-[#0AAFCE]">
                      genetic evidence
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
