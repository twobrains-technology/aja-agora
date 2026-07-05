"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type {
	Artifact,
	ComparisonTablePayload,
	GroupCardPayload,
	RecommendationCardPayload,
} from "@/lib/chat/types";

// FIX-196 — Reveal hero + seletor de cotas (Opção 1, decisão Kairo 2026-07-01).
//
// O reveal é um CONJUNTO de artefatos (recommendation_card + comparison_table +
// contemplation_dial) que passa a compartilhar UM estado client-side: qual cota
// é o hero (`selectedGroupId`). Tocar um chip do seletor troca a cota SEM novo
// turno do agente; o hero e o dial REBINDAM à cota selecionada. "Seguir com
// <cota>" emite a ação estruturada `choose_offer` com o `groupId` REAL — fim da
// raiz do P0 (escolher cota por texto livre → meta-narrativa/loop).
//
// Os artefatos chegam como PARTS separadas de uma mesma mensagem e são
// renderizados independentemente (artifact-renderer). O estado precisa de um
// contexto acima deles — montado por mensagem no chat-message. Fora de um reveal
// (ex.: comparison_table sozinho do "ver outras opções", ou testes de componente
// isolados) o contexto é INERTE (`isReveal:false`) e cada componente cai no seu
// comportamento legado — nada quebra.

type Category = GroupCardPayload["category"];

/** Uma cota do reveal, já coagida server-side (contrato bloco-a). Os campos
 * RICOS (score/breakdown) só existem na cota recomendada — as alternativas não
 * carregam score ancorado, então o hero NÃO fabrica um pra elas (Lei 3). */
export type RevealCota = {
	/** ID REAL resolvido (quotaId opaco) — vai no `choose_offer`. */
	groupId: string;
	ofertaId?: string;
	quotaId?: string;
	administradora: string;
	category: Category;
	/** Faixa exibida (re-simulada). */
	creditValue: number;
	monthlyPayment: number;
	termMonths: number;
	/** Contemplados/mês COAGIDO (0 quando ausente → hero oculta a linha). */
	availableSlots: number;
	/** valorCarta BRUTO (denominação) — FIX-197 aviso de ajuste de faixa. */
	rawCreditValue?: number;
	isRecommended: boolean;
	score?: number;
	scoreBreakdown?: RecommendationCardPayload["scoreBreakdown"];
	/** FIX-223: lance médio do grupo (R$), quando a fonte o traz. */
	avgBidValue?: number;
	/** FIX-222: logo da administradora, quando cadastrado. */
	logoUrl?: string;
};

type RevealSelectionValue = {
	/** true só quando a mensagem tem um `recommendation_card` (o hero do reveal). */
	isReveal: boolean;
	cotas: RevealCota[];
	selectedGroupId: string | null;
	select: (groupId: string) => void;
	selectedCota: RevealCota | null;
	/** FIX-220 — estágio da recomendação (reveal inteiro, não por cota). "neutral"
	 * (default): nenhuma cota é branded como preferencial. "personalized": gancho
	 * pro estágio 2 (ONDA 2, ainda não implementado). */
	recommendationStage: "neutral" | "personalized";
};

const INERT: RevealSelectionValue = {
	isReveal: false,
	cotas: [],
	selectedGroupId: null,
	select: () => {},
	selectedCota: null,
	recommendationStage: "neutral",
};

const RevealSelectionContext = createContext<RevealSelectionValue>(INERT);

export function useRevealSelection(): RevealSelectionValue {
	return useContext(RevealSelectionContext);
}

const cotaId = (g: { groupId?: string; id: string }): string => g.groupId ?? g.id;

/** Extrai a lista de cotas do reveal a partir dos artefatos da mensagem. O hero
 * (recommendation_card) define a cota recomendada e os campos ricos; o
 * comparison_table define TODAS as cotas do seletor. Casa a recomendada por
 * igualdade de id (quotaId opaco — confirmado no runner); fallback:
 * highlightBestIndex. Sem recommendation_card → NÃO é reveal (cotas vazias). */
function buildCotas(artifacts: Artifact[]): {
	cotas: RevealCota[];
	recommendedId: string | null;
	recommendationStage: "neutral" | "personalized";
} {
	const rec = artifacts.find((a) => a.type === "recommendation_card")?.payload as
		| RecommendationCardPayload
		| undefined;
	if (!rec) return { cotas: [], recommendedId: null, recommendationStage: "neutral" };
	const recommendationStage = rec.recommendationStage ?? "neutral";

	const cmp = artifacts.find((a) => a.type === "comparison_table")?.payload as
		| ComparisonTablePayload
		| undefined;
	const recId = cotaId(rec);

	const recAsCota = (): RevealCota => ({
		groupId: recId,
		ofertaId: rec.ofertaId,
		quotaId: rec.quotaId,
		administradora: rec.administradora,
		category: rec.category,
		creditValue: rec.creditValue,
		monthlyPayment: rec.monthlyPayment,
		termMonths: rec.termMonths,
		availableSlots: rec.availableSlots ?? rec.contempladosMes ?? 0,
		rawCreditValue: rec.rawCreditValue,
		isRecommended: true,
		score: rec.score,
		scoreBreakdown: rec.scoreBreakdown,
		avgBidValue: rec.avgBidValue,
		logoUrl: rec.logoUrl,
	});

	// Reveal de 1 cota só (sem comparison_table): hero é a única cota, sem seletor.
	if (!cmp?.groups || cmp.groups.length === 0) {
		const only = recAsCota();
		return { cotas: [only], recommendedId: only.groupId, recommendationStage };
	}

	let recIdx = cmp.groups.findIndex((g) => cotaId(g) === recId);
	if (recIdx < 0) recIdx = cmp.highlightBestIndex ?? 0;

	const cotas: RevealCota[] = cmp.groups.map((g, i): RevealCota => {
		const isRec = i === recIdx;
		return {
			groupId: cotaId(g),
			// a recomendada herda ofertaId/quotaId/rawCreditValue do hero quando o
			// group não os traz (o hero carrega o snapshot rico da cota recomendada).
			ofertaId: isRec ? (g.ofertaId ?? rec.ofertaId) : g.ofertaId,
			quotaId: isRec ? (g.quotaId ?? rec.quotaId) : g.quotaId,
			administradora: g.administradora,
			category: g.category,
			creditValue: g.creditValue,
			monthlyPayment: g.monthlyPayment,
			termMonths: g.termMonths,
			// contrato: availableSlots vem por cota; a recomendada herda o fallback
			// legado (contempladosMes) do hero enquanto bloco-a não coage.
			availableSlots: isRec
				? (g.availableSlots ?? rec.availableSlots ?? rec.contempladosMes ?? 0)
				: (g.availableSlots ?? 0),
			rawCreditValue: isRec ? (g.rawCreditValue ?? rec.rawCreditValue) : g.rawCreditValue,
			isRecommended: isRec,
			score: isRec ? rec.score : undefined,
			scoreBreakdown: isRec ? rec.scoreBreakdown : undefined,
			avgBidValue: isRec ? (g.avgBidValue ?? rec.avgBidValue) : g.avgBidValue,
			logoUrl: isRec ? (g.logoUrl ?? rec.logoUrl) : g.logoUrl,
		};
	});

	return { cotas, recommendedId: cotas[recIdx]?.groupId ?? recId, recommendationStage };
}

export function RevealSelectionProvider({
	artifacts,
	children,
}: {
	artifacts: Artifact[];
	children: ReactNode;
}) {
	const { cotas, recommendedId, recommendationStage } = useMemo(
		() => buildCotas(artifacts),
		[artifacts],
	);
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() => recommendedId);

	// Re-ancora no recomendado se o selecionado sumir (defensivo — cada mensagem
	// monta o seu provider; na prática as cotas não trocam durante o turno).
	const effectiveSelected = cotas.some((c) => c.groupId === selectedGroupId)
		? selectedGroupId
		: recommendedId;

	const value = useMemo<RevealSelectionValue>(() => {
		const selectedCota = cotas.find((c) => c.groupId === effectiveSelected) ?? null;
		return {
			isReveal: cotas.length > 0,
			cotas,
			selectedGroupId: effectiveSelected,
			select: setSelectedGroupId,
			selectedCota,
			recommendationStage,
		};
	}, [cotas, effectiveSelected, recommendationStage]);

	return (
		<RevealSelectionContext.Provider value={value}>{children}</RevealSelectionContext.Provider>
	);
}
