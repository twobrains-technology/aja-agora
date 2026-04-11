"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollReveal } from "./scroll-reveal";

export function CtaSection() {
  return (
    <section className="bg-muted py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <Card className="rounded-3xl border-none py-8 shadow-lg sm:py-16 lg:py-24">
            <CardContent className="flex flex-col items-center gap-8 px-8 text-center sm:px-16 lg:px-24">
              <div className="max-w-lg">
                <h2 className="font-serif mb-4 text-3xl font-bold">
                  Pronto para realizar seu{" "}
                  <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
                    sonho
                  </span>
                  ?
                </h2>
                <p className="text-muted-foreground text-lg font-medium">
                  Converse agora com nosso consultor de IA e descubra o consórcio
                  ideal para você.
                </p>
              </div>
              <Button
                size="lg"
                className="h-12 px-8 text-base font-semibold"
                render={<Link href="/chat" />}
                nativeButton={false}
              >
                Começar agora
              </Button>
            </CardContent>
          </Card>
        </ScrollReveal>
      </div>
    </section>
  );
}
