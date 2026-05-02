"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
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

const PRIORITY_LABEL = { high: "Alta", medium: "Média", low: "Baixa" } as const;

function makeId() {
	return crypto.randomUUID();
}

export function CampaignListSection() {
	const { control, register, watch, setValue, trigger, formState } = useFormContext();
	const { fields, append, remove } = useFieldArray({
		control,
		name: "activeCampaigns",
	});
	const [openKeys, setOpenKeys] = useState<string[]>([]);

	const errors = formState.errors as {
		activeCampaigns?: Array<Record<string, { message?: string } | undefined> | undefined>;
	};

	async function addCampaign() {
		if (fields.length > 0) {
			const ok = await trigger("activeCampaigns");
			if (!ok) return;
		}
		const id = makeId();
		append({
			id,
			title: "",
			body: "",
			startsAt: null,
			endsAt: null,
			enabled: true,
			mentionPriority: "medium",
		});
		setOpenKeys((prev) => [...prev, id]);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Campanhas ativas</CardTitle>
				<CardDescription>
					Promoções e ofertas que a IA menciona quando o contexto da conversa permite. Prioridade
					alta = mencionada proativamente; baixa = só se o cliente perguntar.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				{fields.length === 0 && (
					<p className="text-sm text-muted-foreground py-2">Nenhuma campanha cadastrada.</p>
				)}

				<Accordion multiple value={openKeys} onValueChange={(v) => setOpenKeys(v as string[])}>
					{fields.map((field, index) => {
						const itemId = (field as unknown as { id: string }).id;
						const valueId = watch(`activeCampaigns.${index}.id`) as string;
						const key = valueId || itemId;
						const title = (watch(`activeCampaigns.${index}.title`) as string) || "Sem título";
						const enabled = watch(`activeCampaigns.${index}.enabled`) as boolean;
						const itemErrors = errors.activeCampaigns?.[index];

						return (
							<AccordionItem
								key={itemId}
								value={key}
								className="rounded-md border bg-card mb-2 px-3"
							>
								<div className="flex items-center gap-2">
									<AccordionTrigger className="flex-1 items-center py-3 hover:no-underline [&>[data-slot=accordion-trigger-icon]]:hidden">
										<span className="flex-1 text-left text-sm font-medium truncate">
											{title}
											{!enabled && (
												<span className="ml-2 text-xs text-muted-foreground font-normal">
													(desabilitada)
												</span>
											)}
										</span>
										<span className="inline-flex items-center justify-center size-7 rounded-[min(var(--radius-md),12px)] hover:bg-muted shrink-0">
											<ChevronDown className="size-3.5 text-muted-foreground transition-transform group-aria-expanded/accordion-trigger:rotate-180" />
										</span>
									</AccordionTrigger>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										onClick={() => remove(index)}
									>
										<Trash2 className="size-3.5" />
									</Button>
								</div>
								<AccordionContent>
									<div className="space-y-3 pb-2">
										<div className="space-y-1.5">
											<Label>Título</Label>
											<Input {...register(`activeCampaigns.${index}.title`)} />
											{itemErrors?.title?.message && (
												<p className="text-sm text-destructive">{itemErrors.title.message}</p>
											)}
										</div>
										<div className="space-y-1.5">
											<Label>Descrição</Label>
											<Textarea rows={3} {...register(`activeCampaigns.${index}.body`)} />
											{itemErrors?.body?.message && (
												<p className="text-sm text-destructive">{itemErrors.body.message}</p>
											)}
										</div>
										<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
											<div className="space-y-1.5">
												<Label>Início</Label>
												<DatePicker
													value={
														(watch(`activeCampaigns.${index}.startsAt`) as string | null) ?? null
													}
													onChange={(v) =>
														setValue(`activeCampaigns.${index}.startsAt`, v, {
															shouldDirty: true,
														})
													}
													placeholder="Sem data"
												/>
											</div>
											<div className="space-y-1.5">
												<Label>Fim</Label>
												<DatePicker
													value={
														(watch(`activeCampaigns.${index}.endsAt`) as string | null) ?? null
													}
													onChange={(v) =>
														setValue(`activeCampaigns.${index}.endsAt`, v, {
															shouldDirty: true,
														})
													}
													placeholder="Sem data"
												/>
												{itemErrors?.endsAt?.message && (
													<p className="text-sm text-destructive">{itemErrors.endsAt.message}</p>
												)}
											</div>
											<div className="space-y-1.5">
												<Label>Prioridade</Label>
												<Select
													value={
														(watch(`activeCampaigns.${index}.mentionPriority`) as string) ??
														"medium"
													}
													onValueChange={(v) =>
														setValue(
															`activeCampaigns.${index}.mentionPriority`,
															v as "high" | "medium" | "low",
															{ shouldDirty: true },
														)
													}
												>
													<SelectTrigger className="w-full">
														<SelectValue>
															{(value) =>
																PRIORITY_LABEL[value as keyof typeof PRIORITY_LABEL] ?? "—"
															}
														</SelectValue>
													</SelectTrigger>
													<SelectContent>
														{(["high", "medium", "low"] as const).map((p) => (
															<SelectItem key={p} value={p}>
																{PRIORITY_LABEL[p]}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Checkbox
												id={`enabled-${key}`}
												checked={enabled}
												onCheckedChange={(checked) =>
													setValue(`activeCampaigns.${index}.enabled`, checked === true, {
														shouldDirty: true,
													})
												}
											/>
											<Label htmlFor={`enabled-${key}`} className="cursor-pointer">
												Habilitada
											</Label>
										</div>
									</div>
								</AccordionContent>
							</AccordionItem>
						);
					})}
				</Accordion>

				<Button type="button" variant="outline" size="sm" onClick={addCampaign}>
					<Plus className="size-3.5" />
					Adicionar campanha
				</Button>
			</CardContent>
		</Card>
	);
}
