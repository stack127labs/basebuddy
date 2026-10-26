import React, { type ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingSetupView } from "@/components/projects/onboarding-setup-view";
import type { BaseBuddyConfigSetupStatus } from "@/lib/basebuddy-config/setup";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const incompleteStatus: BaseBuddyConfigSetupStatus = {
  configPath: "/repo/basebuddy-data/basebuddy.config.json",
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

const readyStatus: BaseBuddyConfigSetupStatus = {
  configPath: "/repo/basebuddy-data/basebuddy.config.json",
  sections: [
    {
      checks: [],
      description: "The BaseBuddy config file at process.cwd()/basebuddy-data/basebuddy.config.json.",
      status: "ready",
      title: "Config file",
    },
    {
      checks: [],
      description: "The first local user for this BaseBuddy install.",
      status: "ready",
      title: "Owner account",
    },
    {
      checks: [],
      description: "Local session signing configuration.",
      status: "ready",
      title: "Environment values",
    },
    {
      checks: [],
      description: "The Postgres database that stores user content.",
      status: "ready",
      title: "Database connection",
    },
    {
      checks: [],
      description: "Optional Supabase credentials for images and files.",
      status: "ready",
      title: "Supabase storage",
    },
    {
      checks: [],
      description: "Optional shared S3-compatible upload credentials for mapped media and files.",
      status: "ready",
      title: "S3-compatible storage",
    },
  ],
  topology: "config-file",
};

describe("OnboardingSetupView", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  const continueToDatabaseStep = () => {
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  };

  const continueToAccountStep = () => {
    continueToDatabaseStep();
    fireEvent.click(screen.getByLabelText(/i added the env values/i));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.change(screen.getByLabelText(/^setup token/i), { target: { value: "test-setup-token-at-least-32-characters" } });
  };

  it("starts by choosing where to store BaseBuddy data", () => {
    render(<OnboardingSetupView status={incompleteStatus} />);

    expect(screen.getByRole("heading", { name: "Choose where to store BaseBuddy data" })).toBeInTheDocument();
    expect(screen.getByText(/users, projects, permissions, mapping, sidebar layout, and sessions/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use basebuddy-data\/ folder on same server/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /a new supabase\/postgres database/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /same database as your content/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
    expect(screen.queryByText("BASEBUDDY_CONTENT_DATABASE_URL")).not.toBeInTheDocument();
  });

  it("shows database env values after app-data selection", () => {
    render(<OnboardingSetupView status={incompleteStatus} />);

    continueToDatabaseStep();

    expect(screen.getByRole("heading", { name: "Connect to your database" })).toBeInTheDocument();
    expect(
      screen.getByText(/add the values from your database host, then create a strong auth secret for basebuddy sessions/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/add storage keys only if you want images or files in basebuddy/i)).toBeInTheDocument();
    expect(screen.queryByText(/config file will not store these secrets/i)).not.toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("BASEBUDDY_AUTH_SECRET"))).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("BASEBUDDY_CONTENT_DATABASE_URL"))).toBeInTheDocument();
    expect(document.body.textContent).toContain("BASEBUDDY_AUTH_SECRET=");
    expect(document.body.textContent).toContain("BASEBUDDY_CONTENT_DATABASE_URL=");
    expect(screen.queryByText((content) => content.includes("postgresql://user:password"))).not.toBeInTheDocument();
    expect(screen.queryByText(/[a-f0-9]{64}/i)).not.toBeInTheDocument();
    expect(screen.queryByText("cp .env.example .env")).not.toBeInTheDocument();
    expect(screen.queryByText(/or use this command/i)).not.toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes("`.env.local`"))).not.toBeInTheDocument();
    expect(screen.getByLabelText(/i added the env values/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(document.body.textContent).toContain("BASEBUDDY_SUPABASE_URL=");
    expect(document.body.textContent).toContain("BASEBUDDY_SUPABASE_PUBLISHABLE_KEY=");
    expect(document.body.textContent).toContain("BASEBUDDY_SUPABASE_SECRET_KEY=");
    expect(screen.getByText("For Supabase media bucket storage")).toBeInTheDocument();
    expect(screen.getByText("For S3 bucket storage")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("BASEBUDDY_CONTENT_SUPABASE_URL");
    expect(screen.queryByLabelText(/owner name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /let's check the setup now/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/supabase auth/i)).not.toBeInTheDocument();
  });

  it("adds a BaseBuddy data tables step for Supabase/Postgres app data", () => {
    render(<OnboardingSetupView status={incompleteStatus} />);

    fireEvent.click(screen.getByRole("button", { name: /a new supabase\/postgres database/i }));
    continueToDatabaseStep();
    fireEvent.click(screen.getByLabelText(/i added the env values/i));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByRole("heading", { name: /prepare basebuddy data tables/i })).toBeInTheDocument();
    expect(screen.getByText(/run this after the env values are set/i)).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("pnpm basebuddy app-data:migrate"))).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("pnpm basebuddy app-data:check"))).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("basebuddy.app_state"))).toBeInTheDocument();
    expect(screen.getByLabelText(/i prepared the basebuddy data tables/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/i prepared the basebuddy data tables/i));
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByRole("heading", { name: /create your basebuddy account/i })).toBeInTheDocument();
  });

  it("skips the BaseBuddy data tables step for basebuddy-data folder setup", () => {
    render(<OnboardingSetupView status={incompleteStatus} />);

    continueToAccountStep();

    expect(screen.getByRole("heading", { name: /create your basebuddy account/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /prepare basebuddy data tables/i })).not.toBeInTheDocument();
  });

  it("collects account details after database setup", () => {
    render(<OnboardingSetupView status={incompleteStatus} />);

    continueToAccountStep();

    expect(screen.getByRole("heading", { name: /create your basebuddy account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/owner name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/owner email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/owner password/i)).toBeInTheDocument();
    expect(screen.queryByText("BASEBUDDY_CONTENT_DATABASE_URL")).not.toBeInTheDocument();
  });

  it("requires a real email and strong owner password before continuing from account setup", () => {
    render(<OnboardingSetupView status={incompleteStatus} />);

    continueToAccountStep();
    fireEvent.change(screen.getByLabelText(/owner name/i), {
      target: { value: "Owner User" },
    });
    fireEvent.change(screen.getByLabelText(/owner email/i), {
      target: { value: "owner" },
    });
    fireEvent.change(screen.getByLabelText(/owner password/i), {
      target: { value: "pass" },
    });

    expect(screen.getByText(/enter a real email address/i)).toBeInTheDocument();
    const weakPasswordMessage =
      "Use at least 8 characters. Add an uppercase letter. Add a number. Add a symbol.";

    expect(screen.getByText(weakPasswordMessage)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/owner email/i), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/owner password/i), {
      target: { value: "OwnerPass1!" },
    });

    expect(screen.queryByText(/enter a real email address/i)).not.toBeInTheDocument();
    expect(screen.queryByText(weakPasswordMessage)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("automatically creates setup and runs required checks from the timeline page", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          ready: false,
          status: readyStatus,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ready: true,
          status: readyStatus,
        }),
      );

    render(<OnboardingSetupView status={incompleteStatus} />);

    continueToAccountStep();
    fireEvent.change(screen.getByLabelText(/owner name/i), {
      target: { value: "Owner User" },
    });
    fireEvent.change(screen.getByLabelText(/owner email/i), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/owner password/i), {
      target: { value: "OwnerPass1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByRole("heading", { name: /let's check the setup now/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run setup checks/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/basebuddy will create the config/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/passing checks stay quiet/i)).not.toBeInTheDocument();
    for (const label of [
      "Environment values",
      "Owner account",
      "Config file",
      "Database connection",
      "Ready to open BaseBuddy",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/setup",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/setup/check", {
        body: "{}",
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(requestBody).toEqual({
      ownerEmail: "owner@example.com",
      ownerName: "Owner User",
      ownerPassword: "OwnerPass1!",
      setupToken: "test-setup-token-at-least-32-characters",
    });
    expect(JSON.stringify(requestBody)).not.toContain("postgresql://");
    expect(JSON.stringify(requestBody)).not.toContain("secret-content-key");
    expect(JSON.stringify(window.localStorage)).not.toContain("OwnerPass1!");
    for (const label of [
      "Environment values",
      "Owner account",
      "Config file",
      "Database connection",
      "Ready to open BaseBuddy",
    ]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("Upload storage")).not.toBeInTheDocument();
    expect(screen.queryByText("Account details")).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /open basebuddy/i })).toHaveAttribute(
      "href",
      "/login?email=owner%40example.com",
    );
  });

  it("shows timeline error details only for failing checks", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ error: "Set BASEBUDDY_CONTENT_DATABASE_URL." }, { status: 400 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ready: false,
          status: incompleteStatus,
        }),
      );

    render(<OnboardingSetupView status={incompleteStatus} />);

    continueToAccountStep();
    fireEvent.change(screen.getByLabelText(/owner name/i), {
      target: { value: "Owner User" },
    });
    fireEvent.change(screen.getByLabelText(/owner email/i), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/owner password/i), {
      target: { value: "OwnerPass1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/set basebuddy_content_database_url/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run setup checks/i })).not.toBeInTheDocument();
    expect(screen.getByText("Owner account")).toBeInTheDocument();
    expect(screen.getByText("Config file")).toBeInTheDocument();
    expect(screen.getByText("Database connection")).toBeInTheDocument();
    expect(screen.getByText("Ready to open BaseBuddy")).toBeInTheDocument();
    expect(screen.getAllByText("Waiting").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByRole("link", { name: /open basebuddy/i })).not.toBeInTheDocument();
  });

  it("renders a read-only setup summary when setup is complete", () => {
    render(<OnboardingSetupView readOnly status={readyStatus} />);

    expect(screen.getByRole("heading", { name: /setup summary/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Config file" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Owner account" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Database connection" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open basebuddy/i })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: /create setup/i })).not.toBeInTheDocument();
  });
});
