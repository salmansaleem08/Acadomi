"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

type AuthLayoutProps = {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
};

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <div className="flex w-full flex-col overflow-y-auto bg-background lg:w-1/2">
        <div className="p-8">
          <Link href="/" className="inline-block">
            <Image
              src="/logo.svg"
              alt="Acadomi"
              width={128}
              height={128}
              className="h-24 w-24 md:h-32 md:w-32"
              priority
            />
          </Link>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-8 pb-8">
          <motion.div
            className="w-full max-w-md"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <h2 className="mb-2 text-2xl font-bold text-foreground">{title}</h2>
            {subtitle ? (
              <p className="mb-6 text-muted-foreground">{subtitle}</p>
            ) : null}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut", delay: 0.06 }}
            >
              {children}
            </motion.div>
          </motion.div>
        </div>
      </div>

      <div className="hidden min-h-screen w-1/2 flex-col overflow-y-auto bg-slate-900 text-white lg:flex">
        <div className="space-y-6 p-10 pb-6">
          <div>
            <h2 className="text-3xl font-bold text-white">Learner outcomes</h2>
            <p className="mt-2 text-white/60">
              Higher-ed learners using Acadomi report stronger focus, retention,
              and confidence across theory-heavy courses.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="text-4xl font-bold text-emerald-300">94%</p>
              <p className="mt-1 text-white/60">Feel more engaged vs passive video</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-emerald-300">3×</p>
              <p className="mt-1 text-white/60">More likely to revisit key concepts</p>
            </div>
          </div>
          <div
            className="rounded-xl border border-white/10 bg-white/5 p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.08)]"
            role="region"
            aria-label="Trust highlights"
          >
            <p className="text-sm font-medium text-white/90">
              Designed for CS, business, humanities & language-driven subjects
            </p>
            <p className="mt-2 text-sm text-white/55">
              Interactive teaching, group study, bookmarks, quizzes, focus cues,
              and revision tools in one place.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
