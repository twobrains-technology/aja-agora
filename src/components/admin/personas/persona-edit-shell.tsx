"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type {
	PersonaCampaign,
	PersonaExample,
	PersonaForbiddenTopic,
	PersonaHandoffTrigger,
} from "@/db/schema";
import { getCategoryMeta } from "@/lib/agent/categories";
import type { PersonaRow } from "@/lib/agent/system-prompt";
import { type UpdatePersonaInput, updatePersonaSchema } from "@/lib/validations/persona";
import { AIAssistantSidebar } from "./ai-assistant-sidebar";
import { ForbiddenTopicListSection } from "./forbidden-topic-list-section";
import { HandoffTriggerListSection } from "./handoff-trigger-list-section";
import { PersonaExamplesSection } from "./persona-examples-section";
import { PersonaIdentitySection } from "./persona-identity-section";
import { PersonaPreviewPanel } from "./persona-preview-panel";

type FormValues = {
	displayName: string;
	voiceTone: string;
	isActive: boolean;
	expertise: string | null;
	examples: PersonaExample[];
	activeCampaigns: PersonaCampaign[];
	handoffTriggers: PersonaHandoffTrigger[];
	forbiddenTopics: PersonaForbiddenTopic[];
};

export function PersonaEditShell({ persona }: { persona: PersonaRow }) {
	const router = useRouter();
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [submitSuccess, setSubmitSuccess] = useState(false);

	const form = useForm<FormValues>({
		resolver: zodResolver(updatePersonaSchema) as never,
		defaultValues: {
			displayName: persona.displayName,
			voiceTone: persona.voiceTone,
			isActive: persona.isActive,
			expertise: persona.expertise,
			examples: persona.examples,
			activeCampaigns: persona.activeCampaigns,
			handoffTriggers: persona.handoffTriggers,
			forbiddenTopics: persona.forbiddenTopics,
		},
		mode: "onBlur",
	});

	const { isDirty, isSubmitting } = form.formState;

	async function onSubmit(values: FormValues) {
		setSubmitError(null);
		setSubmitSuccess(false);
		const payload: UpdatePersonaInput = values;
		try {
			const res = await fetch(`/api/admin/personas/${persona.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setSubmitError(body.error ?? `HTTP ${res.status}`);
				return;
			}
			form.reset(values);
			setSubmitSuccess(true);
			router.refresh();
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : String(err));
		}
	}

	return (
		<FormProvider {...form}>
			{/* Layout em flex: em ≥lg (≥1024px, notebook 13" cabe), sidebar
          persistente do lado direito com largura fixa (~400px). Em <lg,
          sidebar vira Sheet toggleable via botão "AI Assistant" no header. */}
			<div className="flex flex-col lg:flex-row lg:gap-6 lg:items-start">
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="space-y-6 min-w-0 flex-1"
					data-testid="persona-edit-form"
				>
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="min-w-0">
							<Button variant="ghost" size="sm" render={<Link href="/admin/personas" />}>
								<ArrowLeft className="size-3.5" />
								Voltar
							</Button>
							<h1 className="text-2xl font-bold tracking-tight mt-2">{persona.displayName}</h1>
							<p className="text-muted-foreground text-sm mt-1">
								Categoria:{" "}
								{persona.role === "concierge" ? "Atendente" : getCategoryMeta(persona).label}
								{persona.expertise
									? ` · Especialidade: ${persona.expertise.charAt(0).toUpperCase() + persona.expertise.slice(1)}`
									: ""}
							</p>
						</div>
						<div className="flex items-center gap-2 flex-wrap">
							{submitSuccess && !isDirty && (
								<span className="text-sm text-muted-foreground">Salvo ✓</span>
							)}
							{/* Sheet toggleable apenas em <lg. Em ≥lg, sidebar persistente
                  do lado direito é a fonte primária. */}
							<Sheet>
								<SheetTrigger
									render={
										<Button type="button" variant="outline" size="sm" className="lg:hidden">
											<Sparkles className="size-3.5 text-primary" />
											AI Assistant
										</Button>
									}
								/>
								<SheetContent side="right" className="w-full sm:max-w-[420px] p-0">
									<AIAssistantSidebar personaId={persona.id} formMethods={form} />
								</SheetContent>
							</Sheet>
							<Button type="submit" disabled={!isDirty || isSubmitting}>
								{isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
								Salvar alterações
							</Button>
						</div>
					</div>

					{!persona.isActive && (
						<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
							Persona inativa — não responde em conversas reais. Você ainda pode editar e testar.
						</div>
					)}

					{submitError && (
						<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
							{submitError}
						</div>
					)}

					<div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
						<div className="space-y-6 2xl:col-span-2 min-w-0">
							<PersonaIdentitySection persona={persona} />
							<PersonaExamplesSection />
							<HandoffTriggerListSection />
							<ForbiddenTopicListSection />
						</div>
						<div className="2xl:sticky 2xl:top-4 2xl:self-start 2xl:col-span-1">
							<PersonaPreviewPanel personaId={persona.id} />
						</div>
					</div>
				</form>

				{/* Sidebar persistente em ≥lg. Em <lg fica oculta; o Sheet cobre. */}
				<aside
					className="hidden lg:block lg:w-[380px] xl:w-[420px] lg:shrink-0 lg:sticky lg:top-4 lg:self-start lg:h-[calc(100vh-2rem)]"
					aria-label="AI Assistant"
					data-testid="ai-assistant-persistent"
				>
					<div className="h-full rounded-xl border bg-card overflow-hidden shadow-sm">
						<AIAssistantSidebar personaId={persona.id} formMethods={form} />
					</div>
				</aside>
			</div>
		</FormProvider>
	);
}
