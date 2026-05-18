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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateId } from "@/lib/utils/id";

function makeId() {
	return generateId();
}

export function PersonaExamplesSection() {
	const { control, register, watch, trigger, formState } = useFormContext();
	const { fields, append, remove } = useFieldArray({
		control,
		name: "examples",
	});
	const [openKeys, setOpenKeys] = useState<string[]>([]);

	const errors = formState.errors as {
		examples?: Array<Record<string, { message?: string } | undefined> | undefined>;
	};

	async function addExample() {
		if (fields.length > 0) {
			const ok = await trigger("examples");
			if (!ok) return;
		}
		const id = makeId();
		append({ id, context: "", userMessage: "", assistantResponse: "" });
		setOpenKeys((prev) => [...prev, id]);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Exemplos de conversa</CardTitle>
				<CardDescription>
					Conversas reais que mostram o jeito da persona falar. A IA aprende mais com exemplos do
					que com descrição abstrata.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				{fields.length === 0 && (
					<p className="text-sm text-muted-foreground py-2">
						Nenhum exemplo cadastrado. Adicione 3-5 pra a voz ficar mais consistente.
					</p>
				)}

				<Accordion multiple value={openKeys} onValueChange={(v) => setOpenKeys(v as string[])}>
					{fields.map((field, index) => {
						const itemId = (field as unknown as { id: string }).id;
						const valueId = watch(`examples.${index}.id`) as string;
						const key = valueId || itemId;
						const ctx = (watch(`examples.${index}.context`) as string) || "";
						const userMsg = (watch(`examples.${index}.userMessage`) as string) || "Sem mensagem";
						const itemErrors = errors.examples?.[index];
						const summary = ctx ? `${ctx}: ${userMsg}` : userMsg;

						// Condições + origem aparecem como chips na summary (read-only nesse MVP;
						// edição inline virá com a aba "Comportamento" dedicada).
						const whenExpertise = watch(`examples.${index}.whenExpertise`) as string[] | undefined;
						const whenCategory = watch(`examples.${index}.whenCategory`) as string[] | undefined;
						const whenChannel = watch(`examples.${index}.whenChannel`) as string | undefined;
						const whenIntent = watch(`examples.${index}.whenIntent`) as string[] | undefined;
						const origin = watch(`examples.${index}.origin`) as string | undefined;
						const enabled = (watch(`examples.${index}.enabled`) as boolean | undefined) !== false;

						const conditionChips: string[] = [];
						if (whenExpertise?.length) conditionChips.push(`exp:${whenExpertise.join("|")}`);
						if (whenCategory?.length) conditionChips.push(`cat:${whenCategory.join("|")}`);
						if (whenChannel) conditionChips.push(`canal:${whenChannel}`);
						if (whenIntent?.length) conditionChips.push(`intent:${whenIntent.join("|")}`);

						return (
							<AccordionItem
								key={itemId}
								value={key}
								className="rounded-md border bg-card mb-2 px-3"
							>
								<div className="flex items-center gap-2 min-w-0">
									<AccordionTrigger className="flex-1 min-w-0 items-center py-3 hover:no-underline [&>[data-slot=accordion-trigger-icon]]:hidden">
										<div className="flex-1 min-w-0 text-left">
											<span className="block text-sm truncate">{summary}</span>
											{(conditionChips.length > 0 || origin === "diagnosis" || !enabled) && (
												<div className="mt-1 flex flex-wrap gap-1">
													{!enabled && (
														<span className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
															desativado
														</span>
													)}
													{origin === "diagnosis" && (
														<span className="inline-flex items-center rounded border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
															diagnóstico
														</span>
													)}
													{conditionChips.map((c) => (
														<span
															key={c}
															className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium"
														>
															{c}
														</span>
													))}
												</div>
											)}
										</div>
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
											<Label>Contexto (opcional)</Label>
											<Input
												placeholder="ex: saudação inicial, dúvida sobre taxa, fechamento"
												{...register(`examples.${index}.context`)}
											/>
										</div>
										<div className="space-y-1.5">
											<Label>Mensagem do cliente</Label>
											<Textarea
												rows={2}
												placeholder="Ex: oi, queria saber sobre consórcio de imóvel"
												{...register(`examples.${index}.userMessage`)}
											/>
											{itemErrors?.userMessage?.message && (
												<p className="text-sm text-destructive">{itemErrors.userMessage.message}</p>
											)}
										</div>
										<div className="space-y-1.5">
											<Label>Resposta da persona (no tom dela)</Label>
											<Textarea
												rows={3}
												placeholder="Ex: Beleza, vamos por partes. Qual valor de imóvel você tem em mente?"
												{...register(`examples.${index}.assistantResponse`)}
											/>
											{itemErrors?.assistantResponse?.message && (
												<p className="text-sm text-destructive">
													{itemErrors.assistantResponse.message}
												</p>
											)}
										</div>
									</div>
								</AccordionContent>
							</AccordionItem>
						);
					})}
				</Accordion>

				<Button type="button" variant="outline" size="sm" onClick={addExample}>
					<Plus className="size-3.5" />
					Adicionar exemplo
				</Button>
			</CardContent>
		</Card>
	);
}
