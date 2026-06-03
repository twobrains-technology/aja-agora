"use client";

import { ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChatContext } from "@/lib/chat/provider";
import type { ContractFormPayload } from "@/lib/chat/types";

// Passo 5 "Contratar" — coleta CPF + celular + aceite LGPD e cria a proposta REAL
// na administradora (action contract-submit). NUNCA por texto livre.

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

export function ContractForm({ payload }: { payload: ContractFormPayload }) {
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	const [cpf, setCpf] = useState("");
	const [phone, setPhone] = useState(payload.prefilledPhone ?? "");
	const [lgpd, setLgpd] = useState(false);
	// EC-7 (QA crítico 2026-06-02): guard SÍNCRONO contra duplo/triplo-clique.
	// Um `useState` não basta: o `submitted`/`isStreaming` só atualizam no próximo
	// render, então cliques no MESMO tick veem o valor antigo (closure stale) e
	// disparavam `contract-submit` 3x → 3 propostas na administradora. O ref muda
	// na hora e é visto por todos os cliques, mesmo síncronos — fecha a janela de
	// corrida antes do `sendAction`. `submitted` (state) é só pro disabled visual.
	const submittingRef = useRef(false);
	const [submitted, setSubmitted] = useState(false);

	const cpfDigits = onlyDigits(cpf);
	const phoneDigits = onlyDigits(phone);
	const valid =
		cpfDigits.length === 11 && phoneDigits.length >= 10 && lgpd && !isStreaming && !submitted;

	const submit = () => {
		// Guard de corrida (ref, síncrono) — precede qualquer checagem de state.
		if (submittingRef.current) return;
		if (cpfDigits.length !== 11 || phoneDigits.length < 10 || !lgpd || isStreaming) return;
		submittingRef.current = true;
		setSubmitted(true);
		void sendAction(
			{ kind: "contract-submit", cpf: cpfDigits, celular: phoneDigits, lgpd: true },
			"Enviei meus dados pra contratar",
		);
	};

	return (
		<Card className="w-full max-w-sm">
			<CardContent className="space-y-4 pt-4">
				<div className="space-y-1">
					<p className="text-sm font-medium">Vamos fechar sua proposta</p>
					{payload.administradora ? (
						<p className="text-xs text-muted-foreground">
							Administradora: {payload.administradora}
						</p>
					) : null}
				</div>

				<div className="space-y-2">
					<Label htmlFor="contract-cpf" className="text-xs">
						CPF
					</Label>
					<Input
						id="contract-cpf"
						inputMode="numeric"
						placeholder="000.000.000-00"
						value={cpf}
						onChange={(e) => setCpf(maskCpf(e.target.value))}
						disabled={isStreaming}
						data-testid="contract-cpf"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="contract-phone" className="text-xs">
						Celular
					</Label>
					<Input
						id="contract-phone"
						inputMode="numeric"
						placeholder="(11) 99999-9999"
						value={phone}
						onChange={(e) => setPhone(maskPhone(e.target.value))}
						disabled={isStreaming}
						data-testid="contract-phone"
					/>
				</div>

				<label className="flex items-start gap-2 text-xs text-muted-foreground">
					<Checkbox
						checked={lgpd}
						onCheckedChange={(v) => setLgpd(v === true)}
						disabled={isStreaming}
						data-testid="contract-lgpd"
						className="mt-0.5"
					/>
					<span>
						Autorizo a consulta dos meus dados e aceito os termos de tratamento (LGPD) para a
						contratação do consórcio.
					</span>
				</label>

				<Button
					type="button"
					className="w-full min-h-[44px] gap-2"
					onClick={submit}
					disabled={!valid}
					data-testid="contract-submit"
				>
					<ShieldCheck className="size-4" />
					Continuar com segurança
				</Button>
			</CardContent>
		</Card>
	);
}
