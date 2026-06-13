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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateId } from "@/lib/utils/id";

function makeId() {
	return generateId();
}

export function HandoffTriggerListSection() {
	const { control, register, watch, setValue, trigger, formState } = useFormContext();
	const { fields, append, remove } = useFieldArray({ control, name: "handoffTriggers" });
	const [openKeys, setOpenKeys] = useState<string[]>([]);

	const errors = formState.errors as {
		handoffTriggers?: Array<Record<string, { message?: string } | undefined> | undefined>;
	};

	async function addTrigger() {
		if (fields.length > 0) {
			const ok = await trigger("handoffTriggers");
			if (!ok) return;
		}
		const id = makeId();
		append({ id, condition: "", enabled: true });
		setOpenKeys((prev) => [...prev, id]);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Quando conectar com consultor</CardTitle>
				<CardDescription>
					Quando o cliente disparar uma dessas condições, a IA sugere conectar com consultor humano.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				{fields.length === 0 && (
					<p className="text-sm text-muted-foreground py-2">Nenhuma regra configurada.</p>
				)}

				<Accordion multiple value={openKeys} onValueChange={(v) => setOpenKeys(v as string[])}>
					{fields.map((field, index) => {
						const itemId = (field as unknown as { id: string }).id;
						const valueId = watch(`handoffTriggers.${index}.id`) as string;
						const key = valueId || itemId;
						const condition =
							(watch(`handoffTriggers.${index}.condition`) as string) || "Sem condição";
						const enabled = watch(`handoffTriggers.${index}.enabled`) as boolean;
						const itemErrors = errors.handoffTriggers?.[index];

						return (
							<AccordionItem
								key={itemId}
								value={key}
								className="rounded-md border bg-card mb-2 px-3"
							>
								<div className="flex items-center gap-2 min-w-0">
									<AccordionTrigger className="flex-1 min-w-0 items-center py-3 hover:no-underline [&>[data-slot=accordion-trigger-icon]]:hidden">
										<span className="flex-1 min-w-0 text-left text-sm truncate">
											{condition}
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
											<Label>Condição</Label>
											<Textarea
												rows={2}
												placeholder="Ex: Cliente menciona valor acima de R$ 1.000.000"
												{...register(`handoffTriggers.${index}.condition`)}
											/>
											{itemErrors?.condition?.message && (
												<p className="text-sm text-destructive">{itemErrors.condition.message}</p>
											)}
										</div>
										<div className="flex items-center gap-2">
											<Checkbox
												id={`trigger-enabled-${key}`}
												checked={enabled}
												onCheckedChange={(checked) =>
													setValue(`handoffTriggers.${index}.enabled`, checked === true, {
														shouldDirty: true,
													})
												}
											/>
											<Label htmlFor={`trigger-enabled-${key}`} className="cursor-pointer">
												Habilitado
											</Label>
										</div>
									</div>
								</AccordionContent>
							</AccordionItem>
						);
					})}
				</Accordion>

				<Button type="button" variant="outline" size="sm" onClick={addTrigger}>
					<Plus className="size-3.5" />
					Adicionar regra
				</Button>
			</CardContent>
		</Card>
	);
}
