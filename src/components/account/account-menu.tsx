"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronsUpDown, HelpCircle, LogOut, Settings, UserRound } from "lucide-react";
import { toast } from "sonner";

import { useBaseBuddyBranding } from "@/components/branding-provider";
import { getUserInitials } from "@/lib/control-plane/utils";
import { getProductionErrorMessage } from "@/lib/errors/user-facing";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AccountMenuProps = {
  avatarUrl: string | null;
  email: string | null;
  name: string;
  variant?: "icon" | "sidebar";
};

export function AccountMenu({ avatarUrl, email, name, variant = "icon" }: AccountMenuProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const initials = getUserInitials(email, name);
  const { docsUrl, supportUrl } = useBaseBuddyBranding();

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Could not log out right now.");
      }

      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(getProductionErrorMessage(error, "Could not log out right now."));
      setIsSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "sidebar" ? (
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-md border border-border bg-secondary px-2.5 py-2 text-left text-[13px] transition-colors",
              "hover:bg-accent hover:text-foreground",
              "group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!justify-center group-data-[collapsible=icon]:!gap-0 group-data-[collapsible=icon]:!px-0",
            )}
          >
            <Avatar className="h-8 w-8 border border-border">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
              <AvatarFallback className="bg-accent text-[11px] font-medium text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate font-medium text-foreground">{name}</p>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            <span className="sr-only">Open account menu</span>
          </button>
        ) : (
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary transition-colors hover:border-muted-foreground/30"
          >
            <Avatar className="h-8 w-8">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
              <AvatarFallback className="bg-secondary text-xs font-medium text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="sr-only">Open account menu</span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 border-border bg-popover p-0" sideOffset={8}>
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar className="h-11 w-11 border border-border bg-secondary">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
            <AvatarFallback className="bg-secondary text-sm font-medium text-muted-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email ?? "No email available"}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile" className="flex items-center gap-2">
            <UserRound className="h-4 w-4" />
            Profile settings
            <Settings className="ml-auto h-4 w-4 text-muted-foreground" />
          </Link>
        </DropdownMenuItem>
        {docsUrl ? (
          <DropdownMenuItem asChild>
            <a href={docsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Documentation
            </a>
          </DropdownMenuItem>
        ) : null}
        {supportUrl ? (
          <DropdownMenuItem asChild>
            <a href={supportUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              Support
            </a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="flex items-center gap-2 text-destructive focus:text-destructive"
          disabled={isSigningOut}
          onSelect={() => void handleSignOut()}
        >
          <LogOut className="h-4 w-4" />
          {isSigningOut ? "Logging out..." : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
