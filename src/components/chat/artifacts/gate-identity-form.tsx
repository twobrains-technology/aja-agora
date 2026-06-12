"use client";

import { ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChatContext } from "@/lib/chat/provider";

// Gate "identify" (D1, docs/jornada/CONTEXT.md) — fim do passo 2: CPF + celular
// + aceite LGPD ANTES da busca (a Bevi não simula sem identidade). Mesmo padrão
// de máscara e guard anti duplo-clique do ContractForm (EC-7).

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const maskCpf = (s: string) =>
	onlyDigits(s)
		.slice(0, 11)
		.replace(/(\d{3})(\d)/, "$1.$2")
		.replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
		.replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
const maskPhone = (s: string) =>
	onlyDigits(s)
		.slice(0, 11)
		.replace(/(\d{2})(\d)/, "($1) $2")
		.replace(/(\(\d{2}\) \d{5})(\d)/, "$1-$2");

export function GateIdentityForm({
	prefilledPhone,
	active = true,
}: {
	prefilledPhone?: string | null;
	active?: boolean;
}) {
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	const [cpf, setCpf] = useState("");
	const [phone, setPhone] = useState(prefilledPhone ?? "");
	const [lgpd, setLgpd] = useState(false);
	// Guard SÍNCRONO anti duplo-clique (padrão EC-7 do ContractForm).
	const submittingRef = useRef(false);
	const [submitted, setSubmitted] = useState(false);

	const cpfDigits = onlyDigits(cpf);
	const phoneDigits = onlyDigits(phone);
	const valid =
		cpfDigits.length === 11 &&
		phoneDigits.length >= 10 &&
		lgpd &&
		!isStreaming &&
		!submitted &&
		active;

	const submit = () => {
		if (submittingRef.current) return;
		if (cpfDigits.length !== 11 || phoneDigits.length < 10 || !lgpd || isStreaming) return;
		submittingRef.current = true;
		setSubmitted(true);
		void sendAction(
			{
				kind: "gate",
				gate: "identify",
				value: { cpf: cpfDigits, celular: phoneDigits, lgpd: true },
				label: "Enviei meus dados pra buscar as ofertas",
			},
			"Enviei meus dados pra buscar as ofertas",
		);
	};

	return (
		<Card className="w-full max-w-sm">
			<CardContent className="space-y-4 pt-4">
				<p className="text-sm font-medium">Pra buscar suas ofertas reais</p>

				<div className="space-y-2">
					<Label htmlFor="identify-cpf" className="text-xs">
						CPF
					</Label>
					<Input
						id="identify-cpf"
						inputMode="numeric"
						placeholder="000.000.000-00"
						value={cpf}
						onChange={(e) => setCpf(maskCpf(e.target.value))}
						disabled={isStreaming || submitted}
						// FIX-17: autofocus padronizado nos forms do funil (mobile-first) —
						// só quando ativo, pra não roubar foco de um card antigo no histórico.
						autoFocus={active}
						data-testid="identify-cpf"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="identify-phone" className="text-xs">
						Celular
					</Label>
					<Input
						id="identify-phone"
						inputMode="numeric"
						placeholder="(11) 99999-9999"
						value={phone}
						onChange={(e) => setPhone(maskPhone(e.target.value))}
						disabled={isStreaming || submitted}
						data-testid="identify-phone"
					/>
				</div>

				<label className="flex items-start gap-2 text-xs text-muted-foreground">
					<Checkbox
						checked={lgpd}
						onCheckedChange={(v) => setLgpd(v === true)}
						disabled={isStreaming || submitted}
						data-testid="identify-lgpd"
						className="mt-0.5"
					/>
					<span>
						Autorizo a consulta dos meus dados nas administradoras parceiras (LGPD) pra simular as
						ofertas. Não é compromisso de contratação.
					</span>
				</label>

				<Button
					type="button"
					className="w-full min-h-[44px] gap-2"
					onClick={submit}
					disabled={!valid}
					data-testid="identify-submit"
				>
					<ShieldCheck className="size-4" />
					Buscar minhas ofertas
				</Button>
			</CardContent>
		</Card>
	);
}
