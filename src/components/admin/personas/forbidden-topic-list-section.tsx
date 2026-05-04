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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function makeId() {
	return crypto.randomUUID();
}

export function ForbiddenTopicListSection() {
	const { control, register, watch, setValue, trigger, formState } = useFormContext();
	const { fields, append, remove } = useFieldArray({ control, name: "forbiddenTopics" });
	const [openKeys, setOpenKeys] = useState<string[]>([]);

	const errors = formState.errors as {
		forbiddenTopics?: Array<Record<string, { message?: string } | undefined> | undefined>;
	};

	async function addTopic() {
		if (fields.length > 0) {
			const ok = await trigger("forbiddenTopics");
			if (!ok) return;
		}
		const id = makeId();
		append({ id, topic: "", responseWhenAsked: "", enabled: true });
		setOpenKeys((prev) => [...prev, id]);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Compliance e tópicos sensíveis</CardTitle>
				<CardDescription>
					Quando o cliente toca em um tópico, a IA segue uma resposta padronizada pela
					administradora ao invés de improvisar.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				{fields.length === 0 && (
					<p className="text-sm text-muted-foreground py-2">Nenhum tópico cadastrado.</p>
				)}

				<Accordion multiple value={openKeys} onValueChange={(v) => setOpenKeys(v as string[])}>
					{fields.map((field, index) => {
						const itemId = (field as unknown as { id: string }).id;
						const valueId = watch(`forbiddenTopics.${index}.id`) as string;
						const key = valueId || itemId;
						const topic = (watch(`forbiddenTopics.${index}.topic`) as string) || "Sem tópico";
						const enabled = watch(`forbiddenTopics.${index}.enabled`) as boolean;
						const itemErrors = errors.forbiddenTopics?.[index];

						return (
							<AccordionItem
								key={itemId}
								value={key}
								className="rounded-md border bg-card mb-2 px-3"
							>
								<div className="flex items-center gap-2 min-w-0">
									<AccordionTrigger className="flex-1 min-w-0 items-center py-3 hover:no-underline [&>[data-slot=accordion-trigger-icon]]:hidden">
										<span className="flex-1 min-w-0 text-left text-sm truncate">
											{topic}
											{!enabled && (
												<span className="ml-2 text-xs text-muted-foreground">(desabilitado)</span>
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
											<Label>Tópico</Label>
											<Input
												placeholder="Ex: garantia de contemplação em prazo específico"
												{...register(`forbiddenTopics.${index}.topic`)}
											/>
											{itemErrors?.topic?.message && (
												<p className="text-sm text-destructive">{itemErrors.topic.message}</p>
											)}
										</div>
										<div className="space-y-1.5">
											<Label>Como a IA deve responder</Label>
											<Textarea
												rows={3}
												placeholder="Ex: explique que contemplação acontece por sorteio ou lance vencedor — ninguém garante prazo."
												{...register(`forbiddenTopics.${index}.responseWhenAsked`)}
											/>
											{itemErrors?.responseWhenAsked?.message && (
												<p className="text-sm text-destructive">
													{itemErrors.responseWhenAsked.message}
												</p>
											)}
										</div>
										<div className="flex items-center gap-2">
											<Checkbox
												id={`topic-enabled-${key}`}
												checked={enabled}
												onCheckedChange={(checked) =>
													setValue(`forbiddenTopics.${index}.enabled`, checked === true, {
														shouldDirty: true,
													})
												}
											/>
											<Label htmlFor={`topic-enabled-${key}`} className="cursor-pointer">
												Habilitado
											</Label>
										</div>
									</div>
								</AccordionContent>
							</AccordionItem>
						);
					})}
				</Accordion>

				<Button type="button" variant="outline" size="sm" onClick={addTopic}>
					<Plus className="size-3.5" />
					Adicionar tópico
				</Button>
			</CardContent>
		</Card>
	);
}
