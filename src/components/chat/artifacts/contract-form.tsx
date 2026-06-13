"use client";

import { ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
		<div className="w-full max-w-sm rounded-[18px] border border-[#bcd3ff] bg-card p-[18px] shadow-lg flex flex-col gap-[14px]">
			{/* header */}
			<div className="flex flex-col gap-[2px]">
				<p className="text-sm font-semibold text-foreground">Vamos fechar sua proposta</p>
				{payload.administradora ? (
					<p className="text-xs text-muted-foreground">Administradora: {payload.administradora}</p>
				) : null}
			</div>

			{useStored ? (
				/* FIX-9: confirmação dos dados já coletados — sem re-digitação. */
				<div
					className="rounded-[12px] bg-[#fbfbf9] border border-border px-[14px] py-[12px] flex flex-col gap-[7px]"
					data-testid="contract-stored"
				>
					<div className="flex justify-between text-sm">
						<span className="text-muted-foreground">CPF</span>
						<b className="font-mono font-medium whitespace-nowrap">{payload.prefilledCpfMasked}</b>
					</div>
					<div className="flex justify-between text-sm">
						<span className="text-muted-foreground">Celular</span>
						<b className="font-mono font-medium whitespace-nowrap">{payload.prefilledPhone}</b>
					</div>
					<button
						type="button"
						className="text-left text-[11px] text-muted-foreground underline underline-offset-2 bg-transparent border-none cursor-pointer p-0 w-fit font-[inherit] hover:text-foreground transition-colors"
						onClick={() => setUseStored(false)}
						disabled={isStreaming}
						data-testid="contract-edit-identity"
					>
						Usar outros dados
					</button>
				</div>
			) : (
				<>
					<div className="flex flex-col gap-[6px]">
						<Label htmlFor="contract-cpf" className="text-xs font-semibold">
							CPF
						</Label>
						<Input
							id="contract-cpf"
							inputMode="numeric"
							placeholder="000.000.000-00"
							value={cpf}
							onChange={(e) => setCpf(maskCpf(e.target.value))}
							disabled={isStreaming}
							// FIX-17: autofocus padronizado nos forms do funil (mobile-first).
							autoFocus
							className="h-[46px] rounded-xl border-border bg-background px-[13px] text-base placeholder:text-[#9aa7b6] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20"
							data-testid="contract-cpf"
						/>
					</div>

					<div className="flex flex-col gap-[6px]">
						<Label htmlFor="contract-phone" className="text-xs font-semibold">
							Celular
						</Label>
						<Input
							id="contract-phone"
							inputMode="numeric"
							placeholder="(11) 99999-9999"
							value={phone}
							onChange={(e) => setPhone(maskPhone(e.target.value))}
							disabled={isStreaming}
							className="h-[46px] rounded-xl border-border bg-background px-[13px] text-base placeholder:text-[#9aa7b6] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20"
							data-testid="contract-phone"
						/>
					</div>
				</>
			)}

			<label
				htmlFor="contract-lgpd"
				className="flex items-start gap-[9px] text-[11px] text-muted-foreground leading-[1.45]"
			>
				<Checkbox
					id="contract-lgpd"
					checked={lgpd}
					onCheckedChange={(v) => setLgpd(v === true)}
					disabled={isStreaming}
					data-testid="contract-lgpd"
					className="mt-0.5 size-5 rounded-[6px] border-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
				/>
				<span>
					Autorizo a consulta dos meus dados e aceito os termos de tratamento (LGPD) para a
					contratação do consórcio.
				</span>
			</label>

			<Button
				type="button"
				className="w-full h-[46px] min-h-[44px] gap-2 rounded-[13px] bg-primary text-sm font-semibold text-primary-foreground shadow-[0_6px_16px_-6px_rgba(3,110,255,0.5)] hover:brightness-105"
				onClick={submit}
				disabled={!valid}
				data-testid="contract-submit"
			>
				<ShieldCheck className="size-4" />
				Continuar com segurança
			</Button>
		</div>
	);
}
