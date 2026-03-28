import Link from "next/link";

import { HomeHeroCtas } from "@/components/home-hero-ctas";
import { MarketingHeader } from "@/components/marketing-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { platformNav } from "@/lib/navigation";

export default function HomePage() {
  const featureGroups = [
    { title: "Learn & collaborate", items: platformNav.learn },
    { title: "Study & revision", items: platformNav.study },
    { title: "Engagement", items: platformNav.engagement },
    { title: "Social", items: platformNav.social },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="border-b border-border px-6 py-12 sm:py-16">
          <div className="mx-auto max-w-5xl space-y-8">
            <Card className="rounded-xl border border-border bg-card shadow-sm">
              <CardHeader className="space-y-4">
                <CardTitle className="text-3xl font-bold sm:text-4xl">
                  Learn actively — not passively
                </CardTitle>
                <CardDescription className="text-base text-muted-foreground">
                  Acadomi combines real-time AI teaching, group sessions, focus
                  tracking, and smart revision for theory-heavy higher-ed courses.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <HomeHeroCtas />
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="features" className="scroll-mt-[var(--header-height)] px-6 py-12 sm:py-16">
          <div className="mx-auto max-w-5xl space-y-10">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
                Platform map
              </h2>
              <p className="text-muted-foreground">
                Core study flows are live; some roadmap links open preview pages until those areas
                launch.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {featureGroups.map((group) => (
                <Card
                  key={group.title}
                  className="rounded-xl border border-border shadow-sm"
                >
                  <CardHeader>
                    <CardTitle className="text-lg">{group.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-sm"
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-muted/30 px-6 py-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:justify-between">
          <div>
            <p className="font-semibold text-foreground">Acadomi</p>
            <p className="mt-1 text-sm text-muted-foreground">
              AI-powered personalized learning for higher education.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/login"
              className="text-foreground hover:text-primary hover:underline"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-foreground hover:text-primary hover:underline"
            >
              Sign up
            </Link>
            <Link
              href="/friends"
              className="text-foreground hover:text-primary hover:underline"
            >
              Friends
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
