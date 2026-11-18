"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, House, SquarePlus } from "lucide-react";
import { BrandImage } from "@/components/brand-image";

const destinations = [
  { label: "Home", href: "/", icon: House },
  { label: "Create", href: "/new", icon: SquarePlus },
  { label: "Your saved", href: "/favorites", icon: Bookmark },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      <Link href="/" className="app-sidebar-brand" aria-label="Crackd home">
        <BrandImage variant="mark" decorative className="h-10 w-10" />
      </Link>
      <nav className="app-sidebar-links" aria-label="Main navigation">
        {destinations.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/" || pathname.startsWith("/top-100")
              : pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              className="app-sidebar-link"
              aria-current={active ? "page" : undefined}
            >
              <Icon
                size={26}
                strokeWidth={active ? 2.5 : 1.8}
                fill={active && href === "/" ? "currentColor" : "none"}
                aria-hidden="true"
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
