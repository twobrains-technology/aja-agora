"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { type FormEvent, useRef, useState } from "react";
import {
	useFocoAoMontar,
	useRespondidoNaConversa,
} from "@/components/chat/use-card-de-preenchimento";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChatContext } from "@/lib/chat/provider";
import { ehNomeProprioPlausivel } from "@/lib/leads/nome-plausivel";

// FIX-17 — gate do nome em card com input FOCADO (passo 1 da jornada canônica:
// "Como posso te chamar?"). Era a única coleta texto-livre do funil; no mobile
// (público majoritário, CLAUDE.md mobile-first) o teclado nem abria. Aqui o
// input recebe foco ao aparecer. Coexiste com o texto livre do chat — os dois
// caminhos convergem na persistência do nome (route + saveContactName).

export function NamePrompt({ active = true }: { active?: boolean }) {
	const { sendUserMessage, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	const [name, setName] = useState("");
	// Guard SÍNCRONO anti duplo-clique (padrão EC-7 do ContractForm/identify).
	const submittingRef = useRef(false);
	const [submitted, setSubmitted] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const respondidoNaConversa = useRespondidoNaConversa();
	useFocoAoMontar(inputRef, active && !submitted && !respondidoNaConversa);

	const submit = (e?: FormEvent) => {
		e?.preventDefault();
		if (submittingRef.current || isStreaming) return;
		const trimmed = name.trim();
		if (trimmed.length === 0) return;
		submittingRef.current = true;
		setSubmitted(true);
		// O PREFIXO SÓ VALE QUANDO O CONTEÚDO É UM NOME.
		//
		// Produção, 19/08/2026: o agente perguntou o tipo do imóvel, o card do nome
		// estava na tela (é o único campo com onde digitar), e a cliente respondeu
		// ali — "Casa em condomínio". O histórico gravou "Pode me chamar de Casa em
		// condominio", uma frase que ela nunca disse, e é esse texto que o modelo lê
		// no turno seguinte. Perder o dado já seria ruim; distorcer a intenção dela
		// na entrada é pior, porque o agente passa a conversar com uma invenção.
		//
		// Mesmo predicado que o servidor usa antes de gravar o nome — um fato só,
		// dos dois lados (`nome-plausivel.ts`).
		const primeiroToken = trimmed.split(/\s+/)[0] ?? "";
		const pareceNome = /^[\p{L}'-]+$/u.test(primeiroToken) && ehNomeProprioPlausivel(primeiroToken);
		const label = pareceNome ? `Pode me chamar de ${trimmed}` : trimmed;
		// Texto comum: o gate `name` saiu do route (20/10) e o turno livre lê a fala como qualquer outra.
		void sendUserMessage(label);
	};

	if (submitted || !active || respondidoNaConversa) return null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 320, damping: 28 }}
		>
			<Card className="w-full max-w-sm border-primary/20">
				<CardContent className="p-3">
					<form onSubmit={submit} className="flex items-end gap-2">
						<div className="flex-1 space-y-1.5">
							<label htmlFor="name-input" className="text-xs font-medium text-muted-foreground">
								Como posso te chamar?
							</label>
							<Input
								id="name-input"
								ref={inputRef}
								placeholder="Seu nome"
								value={name}
								maxLength={40}
								autoComplete="given-name"
								enterKeyHint="send"
								onChange={(e) => setName(e.target.value)}
								className="min-h-[44px]"
								data-testid="name-input"
							/>
						</div>
						<Button
							type="submit"
							size="icon"
							className="min-h-[44px] min-w-[44px] shrink-0"
							disabled={name.trim().length === 0}
							aria-label="Confirmar nome"
							data-testid="name-submit"
						>
							<ArrowRight className="size-4" />
						</Button>
					</form>
				</CardContent>
			</Card>
		</motion.div>
	);
}
