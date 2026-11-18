"use client";

import { signOutAction } from "@/app/actions/auth";
import Link from "next/link";
import { ChevronDown, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useEffect, useState } from "react";
import { fetchUserProfileAction } from "@/app/actions/profile";

interface UserHeaderMenuProps {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  showOnMobile?: boolean;
  isAuthenticated?: boolean;
}

export function UserHeaderMenu({
  email,
  firstName: initialFirstName,
  lastName: initialLastName,
  isAuthenticated = true,
}: UserHeaderMenuProps) {
  const [firstName, setFirstName] = useState<string | null>(
    initialFirstName ?? null,
  );
  const [lastName, setLastName] = useState<string | null>(
    initialLastName ?? null,
  );

  useEffect(() => {
    let active = true;

    // Try to fetch user's name
    const fetchUserName = async () => {
      try {
        const profile = await fetchUserProfileAction();
        if (profile && active) {
          setFirstName(profile.first_name);
          setLastName(profile.last_name);
        }
      } catch (error) {
        console.error("Failed to fetch user profile:", error);
      }
    };

    if (isAuthenticated) fetchUserName();
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  // Format the full name
  const fullName = isAuthenticated
    ? [firstName, lastName].filter(Boolean).join(" ") || email || "Your account"
    : "Guest";
  const initial = (firstName?.trim() || email.trim() || "U")
    .slice(0, 1)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="app-profile-trigger"
          aria-label="Open profile menu"
        >
          <span className="app-profile-avatar" aria-hidden="true">
            {isAuthenticated ? initial : <User size={22} />}
          </span>
          <ChevronDown
            size={18}
            className="app-profile-chevron"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="app-profile-menu w-64"
        sideOffset={12}
      >
        <div className="px-2 py-1.5 text-sm font-normal">
          <div className="flex flex-col space-y-1">
            <p className="break-words text-sm font-semibold leading-snug">
              {fullName}
            </p>
            {isAuthenticated && firstName && (
              <p className="break-all text-xs text-muted-foreground">{email}</p>
            )}
          </div>
        </div>

        <DropdownMenuSeparator />

        {isAuthenticated ? (
          <>
            <DropdownMenuItem asChild>
              <Link href="/profile">Your profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/my-images">Your images</Link>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link href="/login">Login</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/sign-up">Sign up</Link>
            </DropdownMenuItem>
          </>
        )}

        {isAuthenticated && (
          <form action={signOutAction}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full cursor-pointer text-left">
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
