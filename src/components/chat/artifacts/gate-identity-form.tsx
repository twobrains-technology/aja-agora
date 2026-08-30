"use client";

import { Landmark, Lock, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useChatContext } from "@/lib/chat/provider";
import { mascararCelular, mascararCpf, somenteDigitos } from "@/lib/forms/mascaras";

// Gate "identify" (D1, docs/jornada/CONTEXT.md) — fim do passo 2: CPF + celular
// + aceite LGPD ANTES da busca (a Bevi não simula sem identidade). Mesmo padrão
// de máscara e guard anti duplo-clique do ContractForm (EC-7).

// Máscaras de `@/lib/forms/mascaras` — este arquivo e o `contract-form.tsx`
// tinham a MESMA cópia literal. Ver o cabeçalho de lá para o porquê da fonte
// única (e para o caso da colagem de CPF já formatado, item C6).
const onlyDigits = somenteDigitos;
const maskCpf = mascararCpf;
const maskPhone = mascararCelular;

export function GateIdentityForm({
	prefilledPhone,
	active = true,
	momento = "pre-busca",
}: {
	prefilledPhone?: string | null;
	active?: boolean;
	/** Onde do funil este form está aparecendo — a copy segue isso. Com a
	 *  vitrine ligada ele vive no fecho; desligada, volta a ser pré-busca, e
	 *  falar da "cota" antes de o cliente ver alguma seria falso.
	 *
	 *  Em nenhum dos dois o botão promete RESERVA: este passo só grava a
	 *  identidade. A proposta na administradora nasce no card seguinte, e o
	 *  CLAUDE.md proíbe "cota reservada" antes da contratação. */
	momento?: "pre-busca" | "fecho";
}) {
	const noFecho = momento === "fecho";
	const rotuloDoEnvio = noFecho
		? "Enviei meus dados pra seguir com a cota"
		: "Enviei meus dados pra buscar as ofertas";
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	const [cpf, setCpf] = useState("");
	const [phone, setPhone] = useState(prefilledPhone ?? "");
	const [lgpd, setLgpd] = useState(false);
	// Guard SÍNCRONO anti duplo-clique (padrão EC-7 do ContractForm).
	const submittingRef = useRef(false);
	const [submitted, setSubmitted] = useState(false);

	// FIX-381 — card do HISTÓRICO (`active={false}`, calculado como `isLast` em
	// chat-message.tsx) é registro do que aconteceu, não formulário a preencher.
	// Antes `active` só desligava o autoFocus e o botão: os inputs seguiam
	// digitáveis, então na retomada apareciam DOIS formulários aparentemente
	// vivos e dava pra preencher o morto (aconteceu no smoke).
	const inerte = isStreaming || submitted || !active;

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
				// Este rótulo é PERSISTIDO como fala do cliente e relido pelo modelo
				// nos turnos seguintes. No fecho, "pra buscar as ofertas" ensinaria a
				// ordem antiga a partir da própria transcrição — a classe de defeito
				// "botão do card vira mentira do servidor".
				label: rotuloDoEnvio,
			},
			rotuloDoEnvio,
		);
	};

	return (
		<div className="w-full max-w-[340px] bg-card border border-[color:var(--border-strong)] rounded-[12px] shadow-[var(--shadow-md)] p-[18px] flex flex-col gap-[14px]">
			<p className="text-sm font-semibold text-foreground">
				{noFecho ? "Pra seguir com essa cota" : "Pra buscar suas ofertas reais"}
			</p>

			{/* C5 — a AUTORIDADE que a landing já assina, trazida para dentro do
			    chat (30/08/2026).

			    A credencial não é nova: a colagem do hero e a seção de independência
			    citam administradoras autorizadas pelo Banco Central desde sempre. O
			    que não acontecia era ela ATRAVESSAR para o único lugar onde o dado
			    sensível é pedido — quem abre o teatro pelo rodapé chega aqui sem ter
			    lido nada disso. É a mesma função da bandeira de cartão no checkout:
			    reduzir o risco percebido no instante da entrega.

			    A frase sai da política de privacidade ("administradoras de consórcio
			    credenciadas pelo Banco Central do Brasil"), não de um argumento de
			    venda inventado para este card. */}
			<p className="flex items-start gap-2 text-[11px] leading-[1.45] text-muted-foreground">
				<Landmark className="mt-px size-3.5 shrink-0 text-foreground" aria-hidden />
				<span>
					Comparamos <span className="font-medium text-foreground">administradoras</span>{" "}
					<span className="font-medium text-foreground">autorizadas pelo Banco Central</span>.
				</span>
			</p>

			{/* CPF */}
			<div className="flex flex-col gap-1.5">
				<label htmlFor="identify-cpf" className="text-xs font-semibold text-foreground">
					CPF
				</label>
				<input
					id="identify-cpf"
					inputMode="numeric"
					placeholder="000.000.000-00"
					value={cpf}
					onChange={(e) => setCpf(maskCpf(e.target.value))}
					disabled={inerte}
					// FIX-17: autofocus padronizado nos forms do funil (mobile-first) —
					// só quando ativo, pra não roubar foco de um card antigo no histórico.
					// biome-ignore lint/a11y/noAutofocus: intencional — só quando active=true, não rouba foco de cards históricos
					autoFocus={active}
					data-testid="identify-cpf"
					className="h-[46px] border border-input rounded-xl px-[13px] bg-card text-base text-foreground placeholder:text-muted-foreground outline-none transition-[border-color,box-shadow] focus:border-[var(--ring)] focus:shadow-[var(--shadow-focus)] disabled:opacity-50 disabled:cursor-not-allowed"
				/>
			</div>

			{/* Celular */}
			<div className="flex flex-col gap-1.5">
				<label htmlFor="identify-phone" className="text-xs font-semibold text-foreground">
					Celular
				</label>
				<input
					id="identify-phone"
					inputMode="numeric"
					placeholder="(11) 99999-9999"
					value={phone}
					onChange={(e) => setPhone(maskPhone(e.target.value))}
					disabled={inerte}
					data-testid="identify-phone"
					className="h-[46px] border border-input rounded-xl px-[13px] bg-card text-base text-foreground placeholder:text-muted-foreground outline-none transition-[border-color,box-shadow] focus:border-[var(--ring)] focus:shadow-[var(--shadow-focus)] disabled:opacity-50 disabled:cursor-not-allowed"
				/>
			</div>

			{/* LGPD — label wraps checkbox + text (htmlFor not needed when input is inside label) */}
			{/* biome-ignore lint/a11y/noLabelWithoutControl: Checkbox is inside the label element */}
			<label className="flex items-start gap-[9px] text-[11px] text-muted-foreground leading-[1.45] cursor-pointer">
				<Checkbox
					checked={lgpd}
					onCheckedChange={(v) => setLgpd(v === true)}
					disabled={inerte}
					data-testid="identify-lgpd"
					className="mt-0.5 shrink-0"
				/>
				<span>
					Autorizo a consulta dos meus dados nas administradoras parceiras (LGPD){" "}
					{noFecho ? "pra seguir com a contratação" : "pra simular as ofertas"}.{" "}
					<span className="text-foreground font-medium">Não é compromisso de contratação.</span>
				</span>
			</label>

			{/* C2 — a GARANTIA, logo abaixo do aceite (30/08/2026).

			    O card só tinha o aceite LGPD, e aceite é o contrário de garantia: é
			    uma autorização que EU peço, somada ao CPF que EU peço. No silêncio
			    sobre o destino do dado, quem lê preenche com a pior hipótese —
			    consulta de crédito, ligação de vendas, base revendida.

			    Fica DEPOIS do aceite de propósito: primeiro a pessoa lê o que está
			    autorizando, depois o que não vai acontecer. Invertido, a garantia
			    viraria preâmbulo de venda e o aceite, letra miúda.

			    A frase sai da política de privacidade ("Não vendemos seus dados
			    cadastrais") e para aí. Nada de "nunca ligamos" ou "sem spam": a mesa
			    LIGA para o lead, e promessa que a operação não cumpre custa mais caro
			    do que o silêncio que ela substitui. */}
			<p className="flex items-start gap-2 rounded-[8px] bg-secondary px-2.5 py-2 text-[11px] leading-[1.45] text-muted-foreground">
				<Lock className="mt-px size-3.5 shrink-0 text-foreground" aria-hidden />
				<span>
					<span className="font-medium text-foreground">Seus dados não são vendidos.</span> Servem{" "}
					{noFecho ? "só pra fechar essa cota" : "só pra essa busca"}.
				</span>
			</p>

			{/* CTA */}
			<button
				type="button"
				onClick={submit}
				disabled={!valid}
				data-testid="identify-submit"
				className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold transition-[opacity,box-shadow] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
			>
				<ShieldCheck className="size-4" />
				{noFecho ? "Confirmar meus dados" : "Buscar minhas ofertas"}
			</button>
		</div>
	);
}
