"use client";

import Image from "next/image";
import Link from "next/link";
import { LayoutDashboard, LogOut, Menu, Settings, Upload } from "lucide-react";
import { useState } from "react";

import { mainNav } from "@/lib/navigation";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const { user, loading, signOut } = useAuth();

  return (
    <header
      className="sticky top-0 z-50 border-b border-border bg-background transition-colors"
      style={{ minHeight: "var(--header-height)" }}
    >
      <div className="mx-auto flex h-[var(--header-height)] max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src="/logo.svg" alt="Acadomi" width={40} height={40} className="size-10" />
          <span className="font-semibold text-foreground">Acadomi</span>
        </Link>

        <Separator orientation="vertical" className="hidden h-4 sm:block" />

        <nav className="hidden items-center gap-1 lg:flex">
          <Link
            href={user ? "/dashboard" : "/"}
            className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {user ? "Dashboard" : "Home"}
          </Link>
          {mainNav
            .filter((item) => item.href !== "/" || !user)
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {item.label}
              </Link>
            ))}
          {user ? (
            <>
              <Link
                href="/upload"
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Uploads
              </Link>
              <Link
                href="/podcast"
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Podcast
              </Link>
              <Link
                href="/role-reversal"
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Role reversal
              </Link>
              <Link
                href="/tutor"
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                AI tutor
              </Link>
              <Link
                href="/cheat-sheets"
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Cheat sheet
              </Link>
              <Link
                href="/bookmarks"
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Bookmarks
              </Link>
              <Link
                href="/settings"
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Settings
              </Link>
            </>
          ) : null}
        </nav>

        <span className="flex-1" />

        <div className="hidden items-center gap-2 sm:flex">
          <ThemeToggle />
          {loading ? (
            <div className="h-9 w-20 animate-pulse rounded-md bg-muted" aria-hidden />
          ) : user ? (
            <>
              <span className="max-w-[140px] truncate text-sm text-muted-foreground" title={user.email}>
                {user.firstName}
              </span>
              <Button variant="outline" className="gap-2 shadow-xs" onClick={() => signOut()}>
                <LogOut className="size-4" />
                Log out
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="shadow-xs" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button className="font-medium" asChild>
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          <ThemeToggle />
          <Button
            variant="outline"
            size="icon"
            className="shadow-xs"
            aria-label="Open menu"
            onClick={() => setOpen((o) => !o)}
          >
            <Menu className="size-4" />
          </Button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border bg-background px-4 py-4 lg:hidden">
          <nav className="flex flex-col gap-1">
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                  onClick={() => setOpen(false)}
                >
                  <LayoutDashboard className="size-4" />
                  Dashboard
                </Link>
                <Link
                  href="/upload"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                  onClick={() => setOpen(false)}
                >
                  <Upload className="size-4" />
                  Uploads
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                  onClick={() => setOpen(false)}
                >
                  <Settings className="size-4" />
                  Settings
                </Link>
              </>
            ) : null}
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {user ? (
                <Button
                  variant="outline"
                  className="w-full shadow-xs"
                  onClick={() => {
                    signOut();
                    setOpen(false);
                  }}
                >
                  Log out
                </Button>
              ) : (
                <>
                  <Button variant="outline" className="w-full shadow-xs" asChild>
                    <Link href="/login">Log in</Link>
                  </Button>
                  <Button className="w-full" asChild>
                    <Link href="/signup">Sign up</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
