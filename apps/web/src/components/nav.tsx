"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Check, Menu, X, Globe } from "lucide-react";
import { useAuth, useUser, UserButton } from "@clerk/nextjs";
import { getApiHealth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { readStoredUserRole } from "@/lib/user-role";

import { useTranslations, useLocale } from "next-intl";

const LOCALES = [
  { code: "en", labelKey: "localeNames.english" },
  { code: "hi", labelKey: "localeNames.hindi" },
  { code: "de", labelKey: "localeNames.german" },
  { code: "fr", labelKey: "localeNames.french" },
  { code: "es", labelKey: "localeNames.spanish" },
  { code: "zh", labelKey: "localeNames.chinese" },
  { code: "ja", labelKey: "localeNames.japanese" },
] as const;

function useLocalePath() {
  const locale = useLocale();
  return (href: string) => {
    if (href.startsWith("#")) return href;
    return `/${locale}${href === "/" ? "" : href}`;
  };
}

function Dropdown({
  label,
  items,
  badge,
}: {
  label: string;
  items: Array<{ label: string; href: string; disabled?: boolean; translationKey: string }>;
  badge?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toLocalePath = useLocalePath();
  const t = useTranslations("nav");

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-1 text-[13.5px] font-normal text-[#4A5568] transition-colors hover:text-[#0D1B2A]"
      >
        {badge && (
          <span className="rounded-sm bg-[#0AAFCE] px-1.5 py-0.5 text-[9px] font-normal leading-none text-white">
            {badge}
          </span>
        )}
        {label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[220px] rounded-xl border border-[#DDE3ED] bg-white py-1.5 shadow-[0_8px_24px_rgba(13,27,42,0.12)]">
          {items.map((item) => (
            <Link
              key={item.translationKey}
              href={toLocalePath(item.href)}
              onClick={() => setOpen(false)}
              className={cn(
                "block px-4 py-2.5 text-[13.5px] font-normal text-[#4A5568] transition-colors hover:bg-[#F7F8FA] hover:text-[#0D1B2A]",
                item.disabled && "pointer-events-none text-[#8A94A6]"
              )}
            >
              {t(item.translationKey)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function LanguageDropdown() {
  const pathname = usePathname();
  const router = useRouter();
  const activeLocale = useLocale();
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function switchLocale(code: string) {
    const segments = pathname.split("/");
    const hasLocale = LOCALES.some((item) => item.code === segments[1]);
    const next = hasLocale ? `/${code}/${segments.slice(2).join("/")}` : `/${code}${pathname}`;
    router.push(next.replace(/\/$/, "") || `/${code}`);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-1.5 text-[13.5px] font-normal text-[#4A5568] transition-colors hover:text-[#0D1B2A]"
      >
        <Globe className="h-4 w-4" />
        <span className="hidden sm:inline">
          {tc(LOCALES.find((l) => l.code === activeLocale)?.labelKey ?? "localeNames.english")}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[180px] rounded-xl border border-[#DDE3ED] bg-white py-1.5 shadow-[0_8px_24px_rgba(13,27,42,0.12)]">
          {LOCALES.map((locale) => (
            <button
              key={locale.code}
              type="button"
              onClick={() => switchLocale(locale.code)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px] font-normal text-[#4A5568] transition-colors hover:bg-[#F7F8FA] hover:text-[#0D1B2A]"
            >
              {tc(locale.labelKey)}
              {activeLocale === locale.code && <Check className="h-3.5 w-3.5 text-[#0AAFCE]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LuminaLogo() {
  const t = useTranslations("common");
  const brandName = t("brandName");
  return (
    <span
      className="inline-flex items-center gap-2 select-none"
      aria-label={brandName}
    >
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <path d="M14 0L16.2 11.8L28 14L16.2 16.2L14 28L11.8 16.2L0 14L11.8 11.8L14 0Z" fill="#06B6D4"/>
        <circle cx="14" cy="14" r="3" fill="#FFFFFF"/>
      </svg>
      <span className="text-[20px] font-normal tracking-tight text-slate-900 dark:text-white leading-none">
        {brandName}
      </span>
    </span>
  );
}

/* -- Mobile language picker — collapsed single row, expands on tap -------- */
function MobileLangPicker({
  activeLocale,
  onSwitch,
}: {
  activeLocale: string;
  onSwitch: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tc = useTranslations("common");

  return (
    <div className="mt-4 border-t border-[#DDE3ED] pt-4">
      {/* Collapsed row — always visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-[#DDE3ED] px-4 py-3 text-[13.5px] font-normal text-[#0D1B2A] transition-colors hover:border-[#0AAFCE]"
      >
        <span className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-[#8A94A6]" />
          {tc(LOCALES.find((l) => l.code === activeLocale)?.labelKey ?? "localeNames.english")}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-[#8A94A6] transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {/* Expanded list */}
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {LOCALES.map((locale) => (
            <button
              key={locale.code}
              type="button"
              onClick={() => { onSwitch(locale.code); setOpen(false); }}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-[13px] font-normal transition-colors",
                activeLocale === locale.code
                  ? "border-[#0AAFCE] bg-[#E5F8FC] text-[#0D1B2A]"
                  : "border-[#DDE3ED] text-[#4A5568] hover:border-[#0AAFCE] hover:text-[#0D1B2A]"
              )}
            >
              {tc(locale.labelKey)}
              {activeLocale === locale.code && <Check className="h-3.5 w-3.5 text-[#0AAFCE]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Nav({ transparent = false }: { transparent?: boolean } = {}) {
  void transparent;
  const t = useTranslations("nav");
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const toLocalePath = useLocalePath();
  const [storedRole] = useState<"doctor" | "patient">(() => readStoredUserRole());
  const role = typeof user?.publicMetadata?.role === "string" ? user.publicMetadata.role : storedRole;
  const workspaceHref = role === "patient" ? "/patient" : "/dashboard";
  const activeLocale = useLocale();
  const [apiReady, setApiReady] = useState<boolean | null>(null);

  const clinicLinks = [
    { label: t("docDashboard"), href: "/doctor-dashboard-info", translationKey: "docDashboard" },
    { label: t("patientPreIntake"), href: "/patient-pre-intake", translationKey: "patientPreIntake" },
    { label: t("clinicalReviewer"), href: "/clinical-reviewer", translationKey: "clinicalReviewer" },
    { label: t("docProfile"), href: "/doctor-profile-info", translationKey: "docProfile" },
  ];

  const providerLinks = [
    { label: t("referralLetters"), href: "/referral-letters", translationKey: "referralLetters" },
    { label: t("hpoWorkflow"), href: "/hpo-workflow", translationKey: "hpoWorkflow" },
    { label: t("rareDiseaseScoring"), href: "/rare-disease-scoring", translationKey: "rareDiseaseScoring" },
    { label: t("fhirExport"), href: "/fhir-export", translationKey: "fhirExport" },
  ];

  const securityLinks = [
    { label: t("privacy"), href: "/privacy", translationKey: "privacy" },
    { label: t("support"), href: "/support", translationKey: "support" },
  ];

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    getApiHealth()
      .then(() => { if (!cancelled) setApiReady(true); })
      .catch(() => { if (!cancelled) setApiReady(false); });
    return () => { cancelled = true; };
  }, [isSignedIn]);

  function switchMobileLocale(code: string) {
    const segments = pathname.split("/");
    const hasLocale = LOCALES.some((item) => item.code === segments[1]);
    const next = hasLocale ? `/${code}/${segments.slice(2).join("/")}` : `/${code}${pathname}`;
    router.push(next.replace(/\/$/, "") || `/${code}`);
    setMobileOpen(false);
  }

  const navLink = "inline-flex h-10 items-center text-[13.5px] font-normal text-[#4A5568] transition-colors hover:text-[#0D1B2A]";

  return (
    <header className="sticky top-0 z-50 border-b border-[#DDE3ED] bg-white/95 backdrop-blur-sm">
      <nav className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between px-6">
        {/* Logo */}
        <div className="flex shrink-0 items-center">
          <Link href={toLocalePath("/")} className="flex items-center">
            <LuminaLogo />
          </Link>
        </div>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 lg:flex">
          {!isSignedIn ? (
            <>
              <Dropdown label={t("forClinics")} badge={t("newBadge")} items={clinicLinks} />
              <Dropdown label={t("forProviders")} items={providerLinks} />
              <Dropdown label={t("securityHelp")} items={securityLinks} />
              <LanguageDropdown />
            </>
          ) : role === "patient" ? (
            <>
              <Link href={toLocalePath("/patient")} className={navLink}>{t("patientDashboard")}</Link>
              <Link href={toLocalePath("/patient/submissions")} className={navLink}>{t("submissions")}</Link>
              <Link href={toLocalePath("/patient/new")} className={navLink}>{t("newSubmission")}</Link>
              <Link href={toLocalePath("/patient/reports")} className={navLink}>{t("reports")}</Link>
              <Link href={toLocalePath("/patient/qr")} className={navLink}>{t("myQrCode")}</Link>
              <LanguageDropdown />
            </>
          ) : (
            <>
              <Link href={toLocalePath("/dashboard")} className={navLink}>{t("docDashboard")}</Link>
              <Link href={toLocalePath("/cases")} className={navLink}>{t("cases")}</Link>
              <Link href={toLocalePath("/new-case")} className={navLink}>{t("newCase")}</Link>
              <Link href={toLocalePath("/scan")} className={navLink}>{t("scanPatientCode")}</Link>
              <Link href={toLocalePath("/settings/profile")} className={navLink}>{t("docProfile")}</Link>
              <LanguageDropdown />
            </>
          )}

          {!isSignedIn ? (
            <Link
              href={toLocalePath("/sign-in")}
              className="inline-flex h-9 items-center rounded-lg border border-[#DDE3ED] px-5 text-[13.5px] font-normal text-[#0D1B2A] transition-colors hover:border-[#0D1B2A] hover:bg-[#F7F8FA]"
            >
              {t("loginSignup")}
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href={toLocalePath(workspaceHref)}
                className="inline-flex items-center gap-2 text-[13px] font-normal text-[#4A5568]"
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    apiReady === false ? "bg-[#C0392B]" : "bg-[#1A7F4B]"
                  )}
                />
                {apiReady === false ? t("apiStatusUnavailable") : t("apiStatusReady")}
              </Link>
              <UserButton />
            </div>
          )}
        </div>

        {/* Mobile auth controls & theme */}
        <div className="flex items-center gap-2 lg:hidden">
          {!isSignedIn ? (
            <Link
              href={toLocalePath("/sign-in")}
              className="inline-flex h-8 items-center rounded-lg border border-[#DDE3ED] bg-white px-3.5 text-[13px] font-normal text-[#0D1B2A] transition-colors hover:border-[#0AAFCE] hover:text-[#0AAFCE]"
            >
              {t("signIn")}
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  apiReady === false ? "bg-[#C0392B]" : "bg-[#1A7F4B]"
                )}
                title={apiReady === false ? t("apiStatusUnavailable") : t("apiStatusReady")}
              />
              <UserButton />
            </div>
          )}

          {/* Hamburger */}
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#4A5568] transition-colors hover:bg-[#F7F8FA] hover:text-[#0D1B2A]"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={t("toggleMenu")}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-[#DDE3ED] bg-white px-6 py-4 lg:hidden">
          <div className="space-y-0.5">
            {(isSignedIn
              ? role === "patient"
                ? [
                    { label: t("patientDashboard"), href: "/patient", translationKey: "patientDashboard" },
                    { label: t("submissions"), href: "/patient/submissions", translationKey: "submissions" },
                    { label: t("newSubmission"), href: "/patient/new", translationKey: "newSubmission" },
                    { label: t("reports"), href: "/patient/reports", translationKey: "reports" },
                  ]
                : [
                    { label: t("docDashboard"), href: "/dashboard", translationKey: "docDashboard" },
                    { label: t("cases"), href: "/cases", translationKey: "cases" },
                    { label: t("newCase"), href: "/new-case", translationKey: "newCase" },
                    { label: t("docProfile"), href: "/settings/profile", translationKey: "docProfile" },
                  ]
              : [
                  ...clinicLinks,
                  ...providerLinks,
                  ...securityLinks,
                ]
            ).map((item) => (
              <Link
                key={item.label}
                href={toLocalePath(item.href)}
                className="block rounded-lg px-3 py-3 text-[15px] font-normal text-[#0D1B2A] transition-colors hover:bg-[#F7F8FA]"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Language picker — collapsed, shows only current language */}
          <MobileLangPicker
            activeLocale={activeLocale}
            onSwitch={(code) => { switchMobileLocale(code); }}
          />

          {/* Mobile CTA */}
          <Link
            href={toLocalePath(isSignedIn ? workspaceHref : "/sign-in")}
            onClick={() => setMobileOpen(false)}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-[#0D1B2A] text-[14px] font-normal text-white transition-colors hover:bg-[#1C3352]"
          >
            {isSignedIn
              ? role === "patient" ? t("patientDashboard") : t("docDashboard")
              : t("loginSignup")}
          </Link>
        </div>
      )}
    </header>
  );
}

export function DashboardNav() {
  return <Nav />;
}
