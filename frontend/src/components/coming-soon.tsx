import Link from "next/link";

import { MarketingHeader } from "@/components/marketing-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ComingSoonProps = {
  title: string;
  description?: string;
};

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <Card className="w-full max-w-lg shadow-[0_1px_3px_0_rgb(0_0_0/0.08)]">
          <CardHeader>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>
              {description ?? "This area is not available yet. Check back soon."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
            <Button variant="outline" className="shadow-xs" asChild>
              <Link href="/friends">Friends</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
