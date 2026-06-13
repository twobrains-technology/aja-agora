"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
	PersonaCampaign,
	PersonaExample,
	PersonaForbiddenTopic,
	PersonaHandoffTrigger,
} from "@/db/schema";
import { type CreatePersonaInput, createPersonaSchema } from "@/lib/validations/persona";
import { ForbiddenTopicListSection } from "./forbidden-topic-list-section";
import { HandoffTriggerListSection } from "./handoff-trigger-list-section";
import { PersonaExamplesSection } from "./persona-examples-section";
import { PersonaPreviewPanel } from "./persona-preview-panel";

const VOICE_TONE_MAX = 2000;

const CATEGORY_LABEL: Record<string, string> = {
	imovel: "Imóvel",
	auto: "Automóvel",
	servicos: "Serviços",
};

const DEFAULT_TOOLS = [
	"search_groups",
	"simulate_quota",
	"get_rates",
	"get_group_details",
	"recommend_groups",
	"present_group_card",
	"present_comparison_table",
	"present_simulation_result",
	"present_recommendation_card",
];

type FormValues = {
	displayName: string;
	category: "imovel" | "auto" | "moto" | "servicos" | undefined;
	expertise: string | null;
	voiceTone: string;
	examples: PersonaExample[];
	activeTools: string[];
	isActive: boolean;
	activeCampaigns: PersonaCampaign[];
	handoffTriggers: PersonaHandoffTrigger[];
	forbiddenTopics: PersonaForbiddenTopic[];
};

export function PersonaCreateForm() {
	const router = useRouter();
	const [submitError, setSubmitError] = useState<string | null>(null);

	const form = useForm<FormValues>({
		resolver: zodResolver(createPersonaSchema) as never,
		defaultValues: {
			displayName: "",
			category: undefined,
			expertise: null,
			voiceTone: "",
			examples: [],
			activeTools: DEFAULT_TOOLS,
			isActive: true,
			activeCampaigns: [],
			handoffTriggers: [],
			forbiddenTopics: [],
		},
		mode: "onBlur",
	});

	const { register, handleSubmit, watch, setValue, formState } = form;
	const { isSubmitting, isValid, errors } = formState;
	const isActive = watch("isActive");
	const voiceTone = watch("voiceTone");
	const category = watch("category");
	const expertise = watch("expertise");

	async function onSubmit(values: FormValues) {
		setSubmitError(null);
		try {
			const payload: CreatePersonaInput = values as CreatePersonaInput;
			const res = await fetch("/api/admin/personas", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setSubmitError(body.error ?? `HTTP ${res.status}`);
				return;
			}
			const body = (await res.json()) as { persona: { id: string } };
			router.push(`/admin/personas/${body.persona.id}`);
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : String(err));
		}
	}

	return (
		<FormProvider {...form}>
			<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
				<div className="flex items-center justify-between gap-4">
					<Button type="button" variant="ghost" size="sm" render={<Link href="/admin/personas" />}>
						<ArrowLeft className="size-3.5" />
						Voltar
					</Button>
					<Button type="submit" disabled={!isValid || isSubmitting}>
						{isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
						Criar persona
					</Button>
				</div>

				{submitError && (
					<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
						{submitError}
					</div>
				)}

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div className="space-y-6 lg:col-span-2">
						<Card>
							<CardHeader>
								<CardTitle>Identidade</CardTitle>
								<CardDescription>Quem é essa persona e em que ela atua.</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div className="space-y-1.5">
										<Label htmlFor="displayName">Nome</Label>
										<Input
											id="displayName"
											placeholder="Insira o nome da persona"
											{...register("displayName")}
										/>
										{errors.displayName?.message && (
											<p className="text-sm text-destructive">{errors.displayName.message}</p>
										)}
									</div>

									<div className="space-y-1.5">
										<Label>Categoria</Label>
										<Select
											value={category ?? ""}
											onValueChange={(v) =>
												setValue("category", v as "imovel" | "auto" | "moto" | "servicos", {
													shouldValidate: true,
												})
											}
										>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Selecione">
													{(value) => CATEGORY_LABEL[value as string] ?? "Selecione"}
												</SelectValue>
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="imovel">Imóvel</SelectItem>
												<SelectItem value="auto">Automóvel</SelectItem>
												<SelectItem value="servicos">Serviços</SelectItem>
											</SelectContent>
										</Select>
										{errors.category?.message && (
											<p className="text-sm text-destructive">{errors.category.message}</p>
										)}
									</div>
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="expertise">Especialidade (opcional)</Label>
									<Input
										id="expertise"
										placeholder="Insira a especialidade da persona"
										value={expertise ?? ""}
										onChange={(e) =>
											setValue("expertise", e.target.value || null, { shouldValidate: true })
										}
									/>
									<p className="text-xs text-muted-foreground">
										Deixe em branco pra ser a persona padrão da categoria.
									</p>
									{errors.expertise?.message && (
										<p className="text-sm text-destructive">{errors.expertise.message}</p>
									)}
								</div>

								<div className="space-y-1.5">
									<div className="flex items-center justify-between">
										<Label htmlFor="voiceTone">Tom de voz (descrição livre)</Label>
										<span className="text-xs text-muted-foreground">
											{voiceTone?.length ?? 0}/{VOICE_TONE_MAX}
										</span>
									</div>
									<Textarea
										id="voiceTone"
										rows={6}
										maxLength={VOICE_TONE_MAX}
										placeholder="Como essa persona conversa. Ex: calma, organizada, técnica sem ser fria. Frases pausadas, sem exclamação. Vocabulário de regularização fundiária quando o assunto pede."
										{...register("voiceTone")}
									/>
									<p className="text-xs text-muted-foreground">
										Descreva tudo que define a voz: formalidade, ritmo das frases, vocabulário, uso
										de exclamação.
									</p>
									{errors.voiceTone?.message && (
										<p className="text-sm text-destructive">{errors.voiceTone.message}</p>
									)}
								</div>

								<div className="flex items-center gap-2">
									<Checkbox
										id="isActive"
										checked={isActive}
										onCheckedChange={(checked) =>
											setValue("isActive", checked === true, { shouldValidate: true })
										}
									/>
									<Label htmlFor="isActive" className="cursor-pointer">
										Ativa (responde em conversas reais)
									</Label>
								</div>
							</CardContent>
						</Card>

						<PersonaExamplesSection />
						<HandoffTriggerListSection />
						<ForbiddenTopicListSection />
					</div>

					<div className="lg:sticky lg:top-4 lg:self-start lg:col-span-1">
						<PersonaPreviewPanel />
					</div>
				</div>
			</form>
		</FormProvider>
	);
}
