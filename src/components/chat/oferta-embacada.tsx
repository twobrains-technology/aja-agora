"use client";

// bloco-telefone-ab (FIX-403) — a OFERTA EMBACADA da variante B.
//
// O dono (29/09/2026): *"teste B deveria ser, mostra as ofertas totalmente
// embacadas com blur, e alguma especie de clique para desbloquear, e ai pede o
// numero do cliente."*
//
// O que este componente NÃO é: um card novo. Ele não decide nada, não conhece
// variante e não fala com o servidor — só envolve as ofertas que a regra de
// render marcou (`comDesbloqueioDoTelefone` → `embacada`). Quem libera de
// verdade é o telefone: quando ele chega, a rota RE-EMITE a comparação a partir
// do banco, já em `livre`, e a oferta legível aparece abaixo. Aqui não existe
// "desbloquear sem dar o número" — seria o pedágio que a cópia evita.
//
// Acessibilidade (mesma régua do card do telefone, FIX-396): o blur NUNCA é a
// única pista. O conteúdo embaçado sai da árvore de acessibilidade e o botão
// diz, em texto, o que está acontecendo e o que fazer.

import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function OfertaEmbacada({ children }: { children: ReactNode }) {
	/**
	 * O clique leva ao CAMPO, não à oferta: é o telefone que desbloqueia. O input
	 * pode estar desabilitado (mensagem em streaming ou card do histórico) —
	 * nesse caso o foco não pega, e o certo é não fingir que pegou.
	 */
	function irParaOCampo() {
		const campo = document.getElementById("desbloqueio-phone");
		if (!campo) return;
		// `scrollIntoView` não existe em todo ambiente (happy-dom, navegador antigo):
		// o foco é o que importa, a rolagem é conforto.
		if (typeof campo.scrollIntoView === "function") {
			campo.scrollIntoView({ block: "center", behavior: "smooth" });
		}
		if (campo instanceof HTMLInputElement && !campo.disabled) campo.focus();
	}

	return (
		<div className="relative w-full" data-testid="oferta-embacada">
			{/* O conteúdo existe (a pessoa vê que a oferta está pronta), mas não se
			    lê nem se toca. `aria-hidden` porque, para quem usa leitor de tela, o
			    caminho é o botão — não um texto ilegível. */}
			<div className="pointer-events-none select-none blur-[10px]" aria-hidden="true">
				{children}
			</div>

			<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[12px] bg-background/45 px-4 text-center backdrop-blur-[2px]">
				<span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
					<Lock className="h-3.5 w-3.5" aria-hidden="true" />
					Suas opções já estão prontas
				</span>
				<Button
					type="button"
					onClick={irParaOCampo}
					data-testid="desbloquear-opcoes"
					className="h-[38px] rounded-xl px-4 text-sm"
				>
					Desbloquear minhas opções
				</Button>
			</div>
		</div>
	);
}