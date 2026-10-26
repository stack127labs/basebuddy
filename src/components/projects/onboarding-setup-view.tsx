"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Database,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { BaseBuddyWordmark } from "@/components/basebuddy-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getBaseBuddyPasswordIssues,
  isValidBaseBuddyAccountEmail,
} from "@/lib/basebuddy-config/account-validation";
import type {
  BaseBuddyConfigSetupCheckStatus,
  BaseBuddyConfigSetupSection,
  BaseBuddyConfigSetupStatus,
} from "@/lib/basebuddy-config/setup";
import { cn } from "@/lib/utils";

type SetupFormState = {
  setupToken: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
};

type SetupStepId = "app-data" | "database" | "app-data-schema" | "account" | "checks";
type AppStateChoice = "basebuddy-data" | "supabase-same-project" | "supabase-split-project";
type TimelineStatus = BaseBuddyConfigSetupCheckStatus | "checking" | "pending";

type TimelineItem = {
  description?: string;
  label: string;
  message?: string | null;
  status: TimelineStatus;
};

const initialFormState: SetupFormState = {
  setupToken: "",
  ownerEmail: "",
  ownerName: "",
  ownerPassword: "",
};

const setupSteps: Array<{
  id: SetupStepId;
  label: string;
}> = [
  {
    id: "app-data",
    label: "Data",
  },
  {
    id: "database",
    label: "Database",
  },
  {
    id: "app-data-schema",
    label: "Tables",
  },
  {
    id: "account",
    label: "Account",
  },
  {
    id: "checks",
    label: "Check",
  },
];

const fallbackSetupStatus: BaseBuddyConfigSetupStatus = {
  configPath: "process.cwd()/basebuddy-data/basebuddy.config.json",
  sections: [
    {
      checks: [
        {
          key: "basebuddy.config.exists",
          label: "Config file exists",
          required: true,
          status: "missing",
          value: "Create basebuddy-data/basebuddy.config.json.",
        },
      ],
      description: "The BaseBuddy config file at process.cwd()/basebuddy-data/basebuddy.config.json.",
      status: "missing",
      title: "Config file",
    },
  ],
  topology: "config-file",
};

const getStatusCopy = (status: TimelineStatus) => {
  if (status === "ready") {
    return "Ready";
  }

  if (status === "checking") {
    return "Checking";
  }

  if (status === "pending") {
    return "Waiting";
  }

  if (status === "invalid") {
    return "Needs review";
  }

  return "Missing";
};

const getCombinedStatus = (
  statuses: BaseBuddyConfigSetupCheckStatus[],
): BaseBuddyConfigSetupCheckStatus => {
  if (statuses.some((status) => status === "invalid")) {
    return "invalid";
  }

  if (statuses.some((status) => status === "missing")) {
    return "missing";
  }

  return "ready";
};

const getSectionIssue = (section: BaseBuddyConfigSetupSection | undefined) =>
  section?.checks.find((check) => check.status !== "ready")?.value ?? section?.description ?? null;

const findSection = (status: BaseBuddyConfigSetupStatus, title: string) =>
  status.sections.find((section) => section.title.toLowerCase() === title.toLowerCase());

const createTimelineItems = ({
  accountReady,
  setupError,
  status,
}: {
  accountReady: boolean;
  setupError?: string | null;
  status: BaseBuddyConfigSetupStatus;
}): TimelineItem[] => {
  const configFile = findSection(status, "Config file");
  const owner = findSection(status, "Owner account");
  const environmentValues = findSection(status, "Environment values");
  const databaseConnection = findSection(status, "Database connection");
  const envStatus = environmentValues?.status ?? "missing";
  const requiredItems: TimelineItem[] = [
    {
      label: "Environment values",
      status: setupError ? "invalid" : envStatus,
      message: setupError ?? getSectionIssue(environmentValues),
    },
    {
      label: "Owner account",
      status: accountReady ? owner?.status ?? "missing" : "missing",
      message: accountReady ? getSectionIssue(owner) : "Enter the owner name, email, and password.",
    },
    {
      label: "Config file",
      status: configFile?.status ?? "missing",
      message: getSectionIssue(configFile),
    },
    {
      label: "Database connection",
      status: databaseConnection?.status ?? "missing",
      message: getSectionIssue(databaseConnection),
    },
  ];
  const requiredStatus = getCombinedStatus(
    requiredItems.map((item) => (item.status === "checking" || item.status === "pending" ? "missing" : item.status)),
  );

  return [
    ...requiredItems,
    {
      label: "Ready to open BaseBuddy",
      status: requiredStatus === "ready" ? "ready" : "pending",
      message: null,
    },
  ];
};

const createPendingTimelineItems = (): TimelineItem[] => [
  {
    label: "Environment values",
    status: "pending",
  },
  {
    label: "Owner account",
    status: "pending",
  },
  {
    label: "Config file",
    status: "pending",
  },
  {
    label: "Database connection",
    status: "pending",
  },
  {
    label: "Ready to open BaseBuddy",
    status: "pending",
  },
];

const getTimelineRevealCount = (items: TimelineItem[]) => {
  const firstBlockingIndex = items.findIndex(
    (item) => item.status === "invalid" || item.status === "missing",
  );

  return firstBlockingIndex === -1 ? items.length : firstBlockingIndex + 1;
};

const copyText = async (value: string) => {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return false;
  }

  await navigator.clipboard.writeText(value);
  return true;
};

function Field({
  autoComplete,
  disabled,
  error,
  helper,
  id,
  label,
  onChange,
  placeholder,
  required = false,
  type = "text",
  value,
}: {
  autoComplete?: string;
  disabled?: boolean;
  error?: string | null;
  helper?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium uppercase text-muted-foreground"
      >
        {label}
      </label>
      <Input
        id={id}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error || helper ? `${id}-message` : undefined}
        className={cn("border-border", error ? "border-destructive focus-visible:ring-destructive" : null)}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={`${id}-message`} className="mt-1.5 text-xs leading-5 text-destructive">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-message`} className="mt-1.5 text-xs leading-5 text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function EnvKeysBlock({
  keys,
  label,
}: {
  keys: string[];
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const value = keys.map((key) => (key.includes("=") ? key : `${key}=`)).join("\n");

  const handleCopy = async () => {
    const ok = await copyText(value);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5" onClick={handleCopy}>
          <Clipboard className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-6">
        <code>
          {keys.map((key) => (
            <span key={key} className="block whitespace-nowrap">
              {key.includes("=") ? (
                <>
                  <span className="text-primary">{key.split("=")[0]}</span>
                  <span className="text-muted-foreground">=</span>
                  <span className="text-foreground">{key.split("=").slice(1).join("=")}</span>
                </>
              ) : (
                <>
                  <span className="text-primary">{key}</span>
                  <span className="text-muted-foreground">=</span>
                </>
              )}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyText(value);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5" onClick={handleCopy}>
          <Clipboard className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-6 text-foreground">
        <code>{value}</code>
      </pre>
    </div>
  );
}

function ConfirmationRow({
  checked,
  id,
  label = "I added the env values",
  onChange,
}: {
  checked: boolean;
  id: string;
  label?: string;
  onChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/50"
    >
      <input
        id={id}
        checked={checked}
        className="h-4 w-4 accent-primary"
        type="checkbox"
        onChange={onChange}
      />
      <span className="block text-sm font-medium text-foreground">{label}</span>
    </label>
  );
}

function TimelineDot({ status }: { status: TimelineStatus }) {
  if (status === "checking") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-primary bg-background">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      </span>
    );
  }

  if (status === "ready") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-background">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (status === "invalid" || status === "missing") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-background">
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
    );
  }

  return <span className="block h-5 w-5 rounded-full border border-border bg-background" />;
}

function SetupTimeline({
  items,
  running,
  visibleCount,
}: {
  items: TimelineItem[];
  running: boolean;
  visibleCount: number;
}) {
  return (
    <ol className="relative space-y-0 pl-8">
      <div className="absolute left-2.5 top-2 h-[calc(100%-1rem)] w-px bg-border" aria-hidden />
      {items.map((item, index) => {
        const visible = index < visibleCount;
        const current = running && index === visibleCount;
        const status = visible ? item.status : current ? "checking" : "pending";
        const showMessage = visible && status !== "ready" && item.message;

        return (
          <li key={item.label} className="relative pb-6 last:pb-0">
            <div className="absolute -left-8 top-0">
              <TimelineDot status={status} />
            </div>
            <div className={cn("transition-opacity duration-150", visible || current ? "opacity-100" : "opacity-45")}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">{item.label}</h3>
                <span className="text-xs text-muted-foreground">{getStatusCopy(status)}</span>
              </div>
              {showMessage ? (
                <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm leading-6 text-destructive">
                  {item.message}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function OnboardingSetupView({
  readOnly = false,
  status,
}: {
  readOnly?: boolean;
  status?: BaseBuddyConfigSetupStatus;
}) {
  const [currentStatus, setCurrentStatus] = useState<BaseBuddyConfigSetupStatus>(
    status ?? fallbackSetupStatus,
  );
  const [activeStep, setActiveStep] = useState<SetupStepId>(readOnly ? "checks" : "app-data");
  const [appStateChoice, setAppStateChoice] = useState<AppStateChoice>("basebuddy-data");
  const [envConfirmed, setEnvConfirmed] = useState(false);
  const [appDataTablesConfirmed, setAppDataTablesConfirmed] = useState(false);
  const [formState, setFormState] = useState<SetupFormState>(initialFormState);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [runningChecks, setRunningChecks] = useState(false);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>(() =>
    readOnly
      ? createTimelineItems({
          accountReady: true,
          status: status ?? fallbackSetupStatus,
        })
      : createPendingTimelineItems(),
  );
  const [visibleTimelineCount, setVisibleTimelineCount] = useState(readOnly ? timelineItems.length : 0);
  const timelineTimeoutsRef = useRef<number[]>([]);
  const checksStartedRef = useRef(false);
  const needsAppDataSchemaStep = appStateChoice !== "basebuddy-data";
  const activeSetupSteps = needsAppDataSchemaStep
    ? setupSteps
    : setupSteps.filter((step) => step.id !== "app-data-schema");
  const activeStepIndex = Math.max(
    activeSetupSteps.findIndex((step) => step.id === activeStep),
    0,
  );
  const signInHref = createdEmail
    ? `/login?email=${encodeURIComponent(createdEmail)}`
    : "/login";
  const appStateEnvKeys =
    appStateChoice === "basebuddy-data"
      ? []
      : appStateChoice === "supabase-same-project"
        ? ["BASEBUDDY_APP_STATE_BACKEND=supabase-same-project"]
        : [
            "BASEBUDDY_APP_STATE_BACKEND=supabase-split-project",
            "BASEBUDDY_APP_STATE_DATABASE_URL",
          ];
  const requiredEnvKeys = [
    ...appStateEnvKeys,
    "BASEBUDDY_AUTH_SECRET",
    "BASEBUDDY_CONTENT_DATABASE_URL",
    "BASEBUDDY_SETUP_TOKEN",
  ];
  const supabaseStorageEnvKeys = [
    "BASEBUDDY_SUPABASE_URL",
    "BASEBUDDY_SUPABASE_PUBLISHABLE_KEY",
    "BASEBUDDY_SUPABASE_SECRET_KEY",
  ];
  const s3StorageEnvKeys = [
    "BASEBUDDY_S3_ACCESS_KEY_ID",
    "BASEBUDDY_S3_SECRET_ACCESS_KEY",
  ];
  const ownerEmail = formState.ownerEmail.trim();
  const ownerPasswordIssues = getBaseBuddyPasswordIssues(formState.ownerPassword);
  const ownerEmailError =
    ownerEmail && !isValidBaseBuddyAccountEmail(ownerEmail) ? "Enter a real email address." : null;
  const ownerPasswordError =
    formState.ownerPassword && ownerPasswordIssues.length > 0
      ? ownerPasswordIssues.join(" ")
      : null;
  const canContinueFromAccount =
    formState.setupToken.length >= 32 &&
    formState.ownerName.trim() &&
    ownerEmail &&
    !ownerEmailError &&
    formState.ownerPassword &&
    ownerPasswordIssues.length === 0;
  const finalTimelineReady =
    visibleTimelineCount >= timelineItems.length &&
    timelineItems.every((item) => item.status === "ready");

  const clearTimelineTimeouts = useCallback(() => {
    for (const timeoutId of timelineTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }

    timelineTimeoutsRef.current = [];
  }, []);

  useEffect(() => {
    if (status) {
      setCurrentStatus(status);
      if (readOnly) {
        const readOnlyItems = createTimelineItems({
          accountReady: true,
          status,
        });
        setTimelineItems(readOnlyItems);
        setVisibleTimelineCount(readOnlyItems.length);
      }
    }
  }, [readOnly, status]);

  useEffect(() => () => clearTimelineTimeouts(), [clearTimelineTimeouts]);

  const updateField = (key: keyof SetupFormState) => (value: string) => {
    setFormState((currentValue) => ({
      ...currentValue,
      [key]: value,
    }));
  };

  const revealTimeline = useCallback((items: TimelineItem[]) => {
    clearTimelineTimeouts();
    setTimelineItems(items);
    const revealCount = getTimelineRevealCount(items);
    setVisibleTimelineCount(revealCount > 0 ? 1 : 0);
    items.slice(1, revealCount).forEach((_, index) => {
      const timeoutId = window.setTimeout(() => {
        setVisibleTimelineCount(index + 2);
      }, 125 * (index + 1));
      timelineTimeoutsRef.current.push(timeoutId);
    });
  }, [clearTimelineTimeouts]);

  const runSetupChecks = useCallback(async () => {
    if (!canContinueFromAccount || runningChecks) {
      return;
    }

    setRunningChecks(true);
    setCreatedEmail(null);
    setTimelineItems(createPendingTimelineItems());
    setVisibleTimelineCount(0);

    let setupError: string | null = null;

    try {
      const setupResponse = await fetch("/api/setup", {
        body: JSON.stringify({
          ownerEmail: formState.ownerEmail.trim(),
          ownerName: formState.ownerName.trim(),
          ownerPassword: formState.ownerPassword,
          setupToken: formState.setupToken,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const setupPayload = (await setupResponse.json()) as {
        error?: unknown;
        ready?: boolean;
        status?: BaseBuddyConfigSetupStatus;
      };

      if (setupPayload.status) {
        setCurrentStatus(setupPayload.status);
      }

      if (!setupResponse.ok) {
        const message =
          typeof setupPayload.error === "string" ? setupPayload.error : "Could not create BaseBuddy setup.";

        if (!/already has an owner user/i.test(message)) {
          setupError = message;
        }
      }

      const checkResponse = await fetch("/api/setup/check", {
        body: "{}",
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const checkPayload = (await checkResponse.json()) as {
        error?: unknown;
        ready?: boolean;
        status?: BaseBuddyConfigSetupStatus;
      };
      const nextStatus = checkPayload.status ?? setupPayload.status ?? currentStatus;

      setCurrentStatus(nextStatus);

      if (!checkResponse.ok && !setupError) {
        setupError =
          typeof checkPayload.error === "string" ? checkPayload.error : "Could not check setup right now.";
      }

      const nextTimelineItems = createTimelineItems({
        accountReady: Boolean(canContinueFromAccount),
        setupError,
        status: nextStatus,
      });

      revealTimeline(nextTimelineItems);

      if (!setupError && nextTimelineItems.every((item) => item.status === "ready")) {
        setCreatedEmail(formState.ownerEmail.trim().toLowerCase());
      }
    } catch (error) {
      revealTimeline(
        createTimelineItems({
          accountReady: Boolean(canContinueFromAccount),
          setupError: error instanceof Error ? error.message : "Could not check setup right now.",
          status: currentStatus,
        }),
      );
    } finally {
      setRunningChecks(false);
    }
  }, [
    canContinueFromAccount,
    currentStatus,
    formState.ownerEmail,
    formState.ownerName,
    formState.ownerPassword,
    formState.setupToken,
    revealTimeline,
    runningChecks,
  ]);

  useEffect(() => {
    if (
      readOnly ||
      activeStep !== "checks" ||
      !canContinueFromAccount ||
      checksStartedRef.current
    ) {
      return;
    }

    checksStartedRef.current = true;
    void runSetupChecks();
  }, [activeStep, canContinueFromAccount, readOnly, runSetupChecks]);

  const goToPreviousStep = () => {
    if (activeStep === "checks") {
      checksStartedRef.current = false;
    }

    const previousStep = activeSetupSteps[Math.max(activeStepIndex - 1, 0)];
    setActiveStep(previousStep.id);
  };

  const goToNextStep = () => {
    const nextStep = activeSetupSteps[Math.min(activeStepIndex + 1, activeSetupSteps.length - 1)];
    setActiveStep(nextStep.id);
  };

  const renderStepRail = () => (
    <div className="mb-12">
      <div className="mx-auto flex max-w-2xl items-start">
        {activeSetupSteps.map((step, index) => {
          const reached = index <= activeStepIndex;
          const completed = index < activeStepIndex;

          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                aria-label={`Step ${index + 1} ${step.label}`}
                className="flex w-16 shrink-0 flex-col items-center gap-2 text-center sm:w-28 sm:flex-row sm:justify-center sm:text-left"
                disabled={index > activeStepIndex}
                onClick={() => {
                  if (index <= activeStepIndex) {
                    setActiveStep(step.id);
                  }
                }}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    reached ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {completed ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "max-w-full truncate text-[11px] font-medium sm:text-xs",
                    reached ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </button>
              {index < activeSetupSteps.length - 1 ? (
                <div className={cn("mt-3.5 h-px min-w-4 flex-1", completed ? "bg-primary" : "bg-border")} />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  const renderAppDataStep = () => (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Choose where to store BaseBuddy data
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          BaseBuddy stores users, projects, permissions, mapping, sidebar layout, and sessions here.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          {
            description: "Best when BaseBuddy runs on one server with persistent storage.",
            id: "basebuddy-data" as const,
            label: "Use basebuddy-data/ folder on same server",
          },
          {
            description: "Best when you want BaseBuddy data separate from your content database.",
            id: "supabase-split-project" as const,
            label: "A new Supabase/Postgres database",
          },
          {
            description: "Best when you want one database to hold both content and BaseBuddy data.",
            id: "supabase-same-project" as const,
            label: "Same database as your content",
          },
        ].map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={cn(
              "rounded-md border px-3 py-3 text-left transition-colors",
              appStateChoice === choice.id
                ? "border-primary bg-primary/5"
                : "border-border bg-background hover:bg-secondary/40",
            )}
            onClick={() => {
              setAppStateChoice(choice.id);
              setEnvConfirmed(false);
              setAppDataTablesConfirmed(false);
            }}
          >
            <span className="block text-sm font-medium text-foreground">{choice.label}</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              {choice.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderDatabaseStep = () => (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Connect to your database</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Add the values from your database host, then create a strong auth secret for BaseBuddy sessions.
        </p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Add storage keys only if you want images or files in BaseBuddy.
        </p>
      </div>

      <EnvKeysBlock label=".env" keys={requiredEnvKeys} />

      <details className="rounded-md border border-border bg-background">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
          Images and files
        </summary>
        <div className="space-y-3 border-t border-border p-3">
          <EnvKeysBlock label="For Supabase media bucket storage" keys={supabaseStorageEnvKeys} />
          <EnvKeysBlock label="For S3 bucket storage" keys={s3StorageEnvKeys} />
        </div>
      </details>

      <ConfirmationRow
        checked={envConfirmed}
        id="basebuddy-env-confirmed"
        onChange={() => setEnvConfirmed((currentValue) => !currentValue)}
      />
    </div>
  );

  const renderAppDataSchemaStep = () => (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Prepare BaseBuddy data tables
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Run this after the env values are set. It creates only BaseBuddy tables for users,
          projects, permissions, mapping, sessions, and audit events.
        </p>
      </div>

      <CodeBlock
        label="Terminal"
        value={[
          "pnpm basebuddy app-data:migrate",
          "pnpm basebuddy app-data:check",
        ].join("\n")}
      />

      <details className="rounded-md border border-border bg-background">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
          Run SQL manually instead
        </summary>
        <div className="space-y-3 border-t border-border p-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Use this if your BaseBuddy database role cannot create schemas or tables.
          </p>
          <CodeBlock label="Print SQL" value="pnpm basebuddy app-data:sql" />
          <p className="text-xs leading-5 text-muted-foreground">
            The SQL creates <span className="text-foreground">basebuddy.app_state</span> and{" "}
            <span className="text-foreground">basebuddy.audit_events</span>.
          </p>
        </div>
      </details>

      <ConfirmationRow
        checked={appDataTablesConfirmed}
        id="basebuddy-app-data-tables-confirmed"
        label="I prepared the BaseBuddy data tables"
        onChange={() => setAppDataTablesConfirmed((currentValue) => !currentValue)}
      />
    </div>
  );

  const renderAccountStep = () => (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Create your BaseBuddy account</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          This becomes the first owner account in BaseBuddy.
        </p>
      </div>

      <div className="space-y-4">
        <Field
          autoComplete="off"
          disabled={runningChecks}
          helper="Use the BASEBUDDY_SETUP_TOKEN value from your server environment. It authorizes creation of the first owner. You can also create the owner with the CLI."
          id="setup-token"
          label="Setup token"
          onChange={updateField("setupToken")}
          required
          type="password"
          value={formState.setupToken}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            autoComplete="name"
            disabled={runningChecks}
            id="setup-owner-name"
            label="Owner name"
            onChange={updateField("ownerName")}
            placeholder="Owner User"
            required
            value={formState.ownerName}
          />
          <Field
            autoComplete="email"
            disabled={runningChecks}
            error={ownerEmailError}
            id="setup-owner-email"
            label="Owner email"
            onChange={updateField("ownerEmail")}
            placeholder="owner@example.com"
            required
            type="email"
            value={formState.ownerEmail}
          />
        </div>
        <Field
          autoComplete="new-password"
          disabled={runningChecks}
          error={ownerPasswordError}
          helper="Use at least 8 characters with uppercase, lowercase, a number, and a symbol."
          id="setup-owner-password"
          label="Owner password"
          onChange={updateField("ownerPassword")}
          placeholder="Use a strong password"
          required
          type="password"
          value={formState.ownerPassword}
        />
      </div>
    </div>
  );

  const renderChecksStep = () => (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        {finalTimelineReady ? (
          <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
        ) : (
          <Database className="mt-0.5 h-5 w-5 text-primary" />
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {readOnly ? "Setup summary" : "Let's check the setup now"}
          </h1>
        </div>
      </div>

      <SetupTimeline items={timelineItems} running={runningChecks} visibleCount={visibleTimelineCount} />

      {finalTimelineReady ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="button" variant="hero" asChild>
            <Link href={signInHref}>Open BaseBuddy</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );

  const currentStepCanContinue =
    activeStep === "app-data"
      ? true
      : activeStep === "database"
        ? envConfirmed
        : activeStep === "app-data-schema"
          ? appDataTablesConfirmed
          : Boolean(canContinueFromAccount);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <div className="flex h-14 items-center">
              <BaseBuddyWordmark className="h-7 w-auto" />
            </div>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-sm text-foreground">{readOnly ? "Summary" : "Setup"}</span>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-6 py-16">
        {readOnly ? null : renderStepRail()}

        <div className="mx-auto max-w-2xl">
          <div className="animate-fade-in">
            {activeStep === "app-data" ? renderAppDataStep() : null}
            {activeStep === "database" ? renderDatabaseStep() : null}
            {activeStep === "app-data-schema" ? renderAppDataSchemaStep() : null}
            {activeStep === "account" ? renderAccountStep() : null}
            {activeStep === "checks" ? renderChecksStep() : null}
          </div>

          {readOnly ? null : (
            <div className="mt-10 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={activeStepIndex === 0 || runningChecks}
                onClick={goToPreviousStep}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </Button>
              {activeStep === "checks" ? null : (
                <Button
                  type="button"
                  variant="hero"
                  size="sm"
                  className="gap-2"
                  disabled={!currentStepCanContinue || runningChecks}
                  onClick={goToNextStep}
                >
                  Continue
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
