"use client";

// ============================================================================
// bloco-telefone-ab (FIX-395) — o card do telefone no ponto em que a pessoa vê
// a oferta: variante B, o telefone ANTES de liberar a comparação.
//
// Ideia da Bruna, call 29/09 12:07:52: *"antes de mostrar a simulação, a gente
// colocar o telefone"*. A comparação NÃO está na tela; este passo vem antes dela
// e só libera com um celular válido.
//
// ⚠️ A CÓPIA É LITERAL, do documento
// `docs/decisoes/2026-09-29-copia-do-desbloqueio-do-telefone.md`. Foi escrita na
// régua que a Bruna orientou (`Remarketing_WhatsApp_V3.pdf`): uma pergunta só,
// curta, sem prometer contemplação, sem citar administradora por nome, LGPD
// explícita. **NÃO reescrever, NÃO melhorar, NÃO traduzir.** Se não couber, o
// certo é parar e registrar a dúvida — não inventar texto.
//
// 🚫 Nada aqui dispara WhatsApp de verdade: o submit é uma ação de card como
// qualquer outra. Nenhum template, nenhuma chamada à Meta.
// ============================================================================

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatContext } from "@/lib/chat/provider";
import type { TelefoneDoDesbloqueioPayload } from "@/lib/chat/types";
import { mascararCelular, somenteDigitos } from "@/lib/forms/mascaras";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

const motionEntry = {
	initial: { opacity: 0, y: 12 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -8 },
	transition: { duration: 0.3, ease: "easeOut" as const },
};

// ─────── A CÓPIA (literal do documento) ───────
const RODAPE_DE_CONFIANCA =
	"Seus dados seguem a LGPD. A AJA não vende consórcio próprio e não repassa seu contato.";
const ROTULO_DO_CAMPO = "Seu WhatsApp com DDD";

const COPIA_B = {
	selo: null,
	titulo: "Falta um passo para ver a sua comparação",
	apoio:
		"A comparação é montada na hora, com a faixa que você buscou. Deixo ela salva no seu WhatsApp — se a sua internet cair, eu te encontro de volta.",
	botao: "Ver a minha comparação",
	secundario: null,
} as const;

function ehCelularValido(digitos: string): boolean {
	// Mesma régua do gate `identify`: DDD válido (1-9) + 8 ou 9 dígitos.
	return /^[1-9]{2}9?\d{8}$/.test(digitos);
}

type Fase = "pedindo" | "liberado" | "recusado";

export function TelefoneDoDesbloqueio({
	payload,
	active = true,
}: {
	payload: TelefoneDoDesbloqueioPayload;
	active?: boolean;
}) {
	const { sendAction, status } = useChatContext();
	const variante = payload.variante;
	// FIX-395 — só a variante B neste passo; a C (borrada) entra no FIX-396.
	const copia = COPIA_B;
	const [masked, setMasked] = useState("");
	const [fase, setFase] = useState<Fase>("pedindo");
	const prefersReduced = useReducedMotion();

	const isStreaming = status === "submitted" || status === "streaming";
	const digits = somenteDigitos(masked);
	const valid = ehCelularValido(digits);
	// Card do HISTÓRICO (`active === false`) é registro: mostra a cópia, mas não
	// deixa preencher nem envia nada (mesmo padrão do GateIdentityForm/FIX-381).
	const inerte = isStreaming || fase !== "pedindo" || !active;

	const onSubmit = () => {
		if (!valid || inerte) return;
		setFase("liberado");
		void sendAction(
			{
				kind: "telefone_desbloqueio",
				variante,
				celular: digits,
				label: copia.botao,
			},
			copia.botao,
		);
	};

	// FIX-396 acrescenta o `onRecusar` da variante C.

	// Acessibilidade (FIX-396): o blur NUNCA é a única pista. Ao liberar o
	// conteúdo, o foco vai para ele — teclado e leitor de tela seguem o MESMO
	// caminho que o olho, sem depender de enxergar o desfoque.
	const conteudoLiberadoRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (fase === "liberado") conteudoLiberadoRef.current?.focus();
	}, [fase]);

	const anim = prefersReduced ? { initial: false as const, animate: { opacity: 1 } } : motionEntry;

	const campo = (
		<div className="flex flex-col gap-1.5">
			<label htmlFor="desbloqueio-phone" className="text-xs font-semibold text-foreground">
				{ROTULO_DO_CAMPO}
			</label>
			<Input
				id="desbloqueio-phone"
				type="tel"
				inputMode="numeric"
				value={masked}
				onChange={(e) => setMasked(mascararCelular(e.target.value))}
				placeholder="(11) 98765-4321"
				disabled={inerte}
				// biome-ignore lint/a11y/noAutofocus: intencional — só no card vivo, não rouba foco do histórico
				autoFocus={active && fase === "pedindo"}
				data-testid="desbloqueio-phone"
				className="h-[46px] rounded-xl border-border bg-background px-[13px] text-base text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 w-full"
			/>
		</div>
	);

	return (
		<motion.div {...anim}>
			<div className="w-full max-w-[340px] rounded-[12px] border border-border bg-card p-[18px] shadow-lg flex flex-col gap-[14px]">
				{/* selo + título — C tem o selo "Sua melhor opção está aqui". */}
				<div className="flex flex-col gap-[2px]">
					{copia.selo ? (
						<span className="inline-flex h-6 w-fit items-center rounded-full bg-[var(--neutral-100)] px-[11px] text-[11px] font-semibold tracking-[0.02em] text-muted-foreground">
							{copia.selo}
						</span>
					) : null}
					<p className="text-sm font-semibold text-foreground">{copia.titulo}</p>
				</div>

				{/* FIX-396 acrescenta aqui a MELHOR OPÇÃO borrada da variante C. */}

				<p className="text-xs leading-[1.45] text-muted-foreground">{copia.apoio}</p>

				{fase === "pedindo" ? (
					<>
						{campo}
						<Button
							type="button"
							data-testid="desbloqueio-enviar"
							onClick={onSubmit}
							disabled={!valid || inerte}
							className="w-full h-[46px] min-h-[44px] rounded-full bg-primary text-sm font-semibold text-primary-foreground hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
						>
							<ShieldCheck className="size-4" />
							{copia.botao}
						</Button>
						{/* FIX-396 acrescenta o "Agora não" da variante C. */}
					</>
				) : (
					// tabIndex=-1 no wrapper garante que o foco programático entre no
					// conteúdo liberado — a pista de teclado/SR que substitui o blur.
					<div
						ref={conteudoLiberadoRef}
						tabIndex={-1}
						data-testid="desbloqueio-conteudo-liberado"
						className="rounded-[10px] bg-secondary px-3 py-2.5 text-xs text-foreground outline-none"
					>
						{fase === "liberado" ? "Pronto — sua comparação está liberada. ✅" : ""}
					</div>
				)}

				<p className="text-[11px] leading-[1.45] text-muted-foreground">{RODAPE_DE_CONFIANCA}</p>
			</div>
		</motion.div>
	);
}