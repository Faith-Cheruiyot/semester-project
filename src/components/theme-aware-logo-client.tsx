"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BrandImage } from "@/components/brand-image";

const brandName = process.env.NEXT_PUBLIC_BRAND_NAME || "Crackd.ai";

interface ThemeAwareLogoClientProps {
  isAuthenticated: boolean;
}

export function ThemeAwareLogoClient({ isAuthenticated }: ThemeAwareLogoClientProps) {
  const pathname = usePathname();
  const isNewActive = pathname === "/new";

  return (
    <div className="flex items-center gap-4 sm:gap-6">
      <Link href="/" className="arcade-wordmark" aria-label={brandName}>
        <BrandImage variant="mark" decorative className="h-10 w-10" />
        <span className="hidden sm:inline">{brandName}</span>
      </Link>
      {/* "New" - Primary action, grouped with logo */}
      {isAuthenticated && (
        <Link
          href="/new"
          className={cn(
            "hidden sm:block text-base font-medium transition-colors hover:text-primary",
            isNewActive ? "text-primary" : "text-muted-foreground"
          )}
        >
          New
        </Link>
      )}
    </div>
  );
}
