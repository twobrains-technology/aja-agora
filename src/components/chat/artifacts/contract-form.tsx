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
	// FIX-9 (teste manual Kairo 2026-06-05): identidade já coletada no identify
	// → modo CONFIRMAÇÃO (CPF mascarado + celular exibidos; só LGPD + 1 clique).
	// "Usar outros dados" volta pro modo de digitação. O CPF completo NUNCA
	// chega ao browser — o submit manda useStoredIdentity e o servidor resolve.
	const [useStored, setUseStored] = useState(payload.identityOnFile === true);
	const [cpf, setCpf] = useState("");
	const [phone, setPhone] = useState(payload.identityOnFile ? "" : (payload.prefilledPhone ?? ""));
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
	const fieldsValid = useStored || (cpfDigits.length === 11 && phoneDigits.length >= 10);
	const valid = fieldsValid && lgpd && !isStreaming && !submitted;

	const submit = () => {
		// Guard de corrida (ref, síncrono) — precede qualquer checagem de state.
		if (submittingRef.current) return;
		if (!fieldsValid || !lgpd || isStreaming) return;
		submittingRef.current = true;
		setSubmitted(true);
		void sendAction(
			useStored
				? { kind: "contract-submit", useStoredIdentity: true, lgpd: true }
				: { kind: "contract-submit", cpf: cpfDigits, celular: phoneDigits, lgpd: true },
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

				{useStored ? (
					/* FIX-9: confirmação dos dados já coletados — sem re-digitação. */
					<div className="rounded-md bg-muted/40 px-3 py-2 space-y-1" data-testid="contract-stored">
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">CPF</span>
							<span className="font-mono">{payload.prefilledCpfMasked}</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">Celular</span>
							<span className="font-mono">{payload.prefilledPhone}</span>
						</div>
						<button
							type="button"
							className="text-xs text-muted-foreground underline underline-offset-2"
							onClick={() => setUseStored(false)}
							disabled={isStreaming}
							data-testid="contract-edit-identity"
						>
							Usar outros dados
						</button>
					</div>
				) : (
					<>
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
					</>
				)}

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
