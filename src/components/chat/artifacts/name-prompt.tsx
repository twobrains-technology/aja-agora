"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChatContext } from "@/lib/chat/provider";

// FIX-17 — gate do nome em card com input FOCADO (passo 1 da jornada canônica:
// "Como posso te chamar?"). Era a única coleta texto-livre do funil; no mobile
// (público majoritário, CLAUDE.md mobile-first) o teclado nem abria. Aqui o
// input recebe foco ao aparecer. Coexiste com o texto livre do chat — os dois
// caminhos convergem na persistência do nome (route + saveContactName).

export function NamePrompt({ active = true }: { active?: boolean }) {
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	const [name, setName] = useState("");
	// Guard SÍNCRONO anti duplo-clique (padrão EC-7 do ContractForm/identify).
	const submittingRef = useRef(false);
	const [submitted, setSubmitted] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Foco ao aparecer (só quando ativo) — teclado abre no lugar certo no mobile,
	// sem roubar foco de um card antigo re-renderizado no histórico.
	useEffect(() => {
		if (active && !submitted) inputRef.current?.focus();
	}, [active, submitted]);

	const submit = () => {
		if (submittingRef.current || isStreaming) return;
		const trimmed = name.trim();
		if (trimmed.length === 0) return;
		submittingRef.current = true;
		setSubmitted(true);
		const label = `Pode me chamar de ${trimmed}`;
		void sendAction({ kind: "gate", gate: "name", value: { name: trimmed }, label }, label);
	};

	if (submitted || !active) return null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 320, damping: 28 }}
		>
			<Card className="w-full max-w-sm border-primary/20">
				<CardContent className="flex items-end gap-2 p-3">
					<div className="flex-1 space-y-1.5">
						<label htmlFor="name-input" className="text-xs font-medium text-muted-foreground">
							Como posso te chamar?
						</label>
						<Input
							id="name-input"
							ref={inputRef}
							autoFocus
							placeholder="Seu nome"
							value={name}
							maxLength={40}
							autoComplete="given-name"
							enterKeyHint="send"
							disabled={isStreaming}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									submit();
								}
							}}
							className="min-h-[44px]"
							data-testid="name-input"
						/>
					</div>
					<Button
						type="button"
						size="icon"
						className="min-h-[44px] min-w-[44px] shrink-0"
						onClick={submit}
						disabled={isStreaming || name.trim().length === 0}
						aria-label="Confirmar nome"
						data-testid="name-submit"
					>
						<ArrowRight className="size-4" />
					</Button>
				</CardContent>
			</Card>
		</motion.div>
	);
}
