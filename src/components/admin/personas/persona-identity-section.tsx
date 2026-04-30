"use client";

import { useFormContext } from "react-hook-form";
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
import type { PersonaRow } from "@/lib/agent/system-prompt";

const VOICE_TONE_MAX = 2000;

const CATEGORY_LABEL: Record<string, string> = {
	imovel: "Imóvel",
	auto: "Automóvel",
	servicos: "Serviços",
};

export function PersonaIdentitySection({ persona }: { persona: PersonaRow }) {
	const { register, watch, setValue, formState } = useFormContext();
	const voiceTone = watch("voiceTone") as string;
	const isActive = watch("isActive") as boolean;
	const expertise = watch("expertise") as string | null | undefined;

	const errors = formState.errors as Record<string, { message?: string } | undefined>;
	const isSpecialist = persona.role === "specialist";

	return (
		<Card>
			<CardHeader>
				<CardTitle>Identidade e voz</CardTitle>
				<CardDescription>Como a persona se apresenta e em que ela é especialista.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div className="space-y-1.5">
						<Label htmlFor="displayName">Nome</Label>
						<Input id="displayName" {...register("displayName")} />
						{errors.displayName?.message && (
							<p className="text-sm text-destructive">{errors.displayName.message}</p>
						)}
					</div>
					<div className="space-y-1.5">
						<Label>Categoria</Label>
						{isSpecialist && persona.category ? (
							<Select value={persona.category} disabled>
								<SelectTrigger className="w-full">
									<SelectValue>
										{(value) => CATEGORY_LABEL[value as string] ?? "Selecione"}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="imovel">Imóvel</SelectItem>
									<SelectItem value="auto">Automóvel</SelectItem>
									<SelectItem value="servicos">Serviços</SelectItem>
								</SelectContent>
							</Select>
						) : (
							<Input value="Atendente" disabled />
						)}
					</div>
				</div>

				{isSpecialist && (
					<div className="space-y-1.5">
						<Label htmlFor="expertise">Especialidade</Label>
						<Input
							id="expertise"
							placeholder="Terrenos, Caminhonete, Alto padrão..."
							value={expertise ?? ""}
							onChange={(e) => setValue("expertise", e.target.value || null, { shouldDirty: true })}
						/>
						<p className="text-xs text-muted-foreground">
							Deixe em branco pra ser a persona padrão da categoria.
						</p>
						{errors.expertise?.message && (
							<p className="text-sm text-destructive">{errors.expertise.message}</p>
						)}
					</div>
				)}

				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<Label htmlFor="voiceTone">Tom de voz</Label>
						<span className="text-xs text-muted-foreground">
							{voiceTone?.length ?? 0}/{VOICE_TONE_MAX}
						</span>
					</div>
					<Textarea id="voiceTone" rows={5} maxLength={VOICE_TONE_MAX} {...register("voiceTone")} />
					{errors.voiceTone?.message && (
						<p className="text-sm text-destructive">{errors.voiceTone.message}</p>
					)}
				</div>

				<div className="flex items-center gap-2">
					<Checkbox
						id="isActive"
						checked={isActive}
						onCheckedChange={(checked) =>
							setValue("isActive", checked === true, { shouldDirty: true })
						}
					/>
					<Label htmlFor="isActive" className="cursor-pointer">
						Ativa (responde em conversas reais)
					</Label>
				</div>
			</CardContent>
		</Card>
	);
}
