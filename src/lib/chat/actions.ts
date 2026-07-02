import type { Category, ExperiencePrev } from "@/lib/agent/personas";
import type { PlanIntent } from "@/lib/agent/qualify-config";

/**
 * Single source of truth for all client → server actions in the chat.
 * Used by both `provider.tsx` (sendAction) and `/api/chat/route.ts` (handler).
 *
 * Adding a new action: extend this union — both call sites get it for free.
 */
export type ChatAction =
	// FIX-17 — gate do nome em card focado (passo 1). O submit do card persiste
	// o nome no servidor (saveContactName) e dispara a saudação + gate experience.
	// Convive com o caminho texto-livre (save_contact_name forçado no orchestrator).
	| { kind: "gate"; gate: "name"; value: { name: string }; label: string }
	| { kind: "gate"; gate: "experience"; value: ExperiencePrev; label: string }
	| { kind: "gate"; gate: "consent"; value: "yes" | "more"; label: string }
	| {
			kind: "gate";
			gate: "credit";
			// "Planeje sua conquista" — re-UX guiada por intenção (handoff). O picker
			// entrega valor + prazo + a INTENÇÃO ("o que mais importa") e, conforme
			// ela, mês-alvo OU lance. A parcela (`monthlyBudget`) é o RESULTADO
			// calculado (total/prazo), não escolhida. Esses campos preenchem os gates
			// seguintes e o funil pula o que já veio (híbrido vendedor: o agente
			// CONFIRMA em vez de re-perguntar).
			value: {
				credit: number;
				/** Parcela calculada (total/prazo) — alimenta a recomendação. */
				monthlyBudget: number;
				/** Prazo do plano escolhido no slider. */
				termMonths?: number;
				/** Intenção do segmented control (dirige objetivo + gates pulados). */
				intent?: PlanIntent;
				targetMonth?: number;
				lanceValue?: number;
				lanceEmbutido?: boolean;
			};
			label: string;
	  }
	| { kind: "gate"; gate: "timeframe"; value: { prazoMeses: number }; label: string }
	| { kind: "gate"; gate: "lance"; value: "yes" | "maybe" | "no"; label: string }
	// docx passo 2: "Qual valor aproximado?" — valor do lance em reais (faixa).
	| { kind: "gate"; gate: "lance-value"; value: { lanceValue: number }; label: string }
	| { kind: "gate"; gate: "lance-embutido"; value: "yes" | "no"; label: string }
	// docx passo 4: oferta do simulador ("contemplado em 3, 6 ou 12 meses?").
	| { kind: "gate"; gate: "simulator-offer"; value: "yes" | "no"; label: string }
	// Gate "identify" (D1) — CPF + celular + aceite LGPD ao fim do passo 2.
	// A Bevi exige identidade ANTES de simular; sem isso a busca não libera.
	| {
			kind: "gate";
			gate: "identify";
			value: { cpf: string; celular: string; lgpd: boolean };
			label: string;
	  }
	| { kind: "category"; category: Category }
	| {
			kind: "select-group";
			groupId: string;
			administradora: string;
			creditValue: number;
			termMonths: number;
			label: string;
	  }
	| { kind: "interest"; administradora: string; label: string }
	// FIX-195 (CONTRATO bloco-b, adendo B8): o seletor de cotas do reveal emite a
	// escolha ESTRUTURADA — o handler server-side (route.ts) resolve o grupo pelo
	// groupId, ancora o fechamento nele e avança ao contrato SEM re-busca/re-resolução
	// e SEM meta-narrativa (raiz do P0). `ofertaId` é opcional (o fechamento
	// re-simula na faixa e gera oferta fresca).
	| { kind: "choose_offer"; groupId: string; ofertaId?: string; label?: string }
	// FIX-29: "Ajustar valor"/"Nova simulação" do card de simulação — reabre o
	// what-if (perguntar novo valor), NUNCA inicia fechamento. Kind próprio pra
	// não cair no handler de avanço (interest). creditValue = valor atual do card.
	| { kind: "adjust-value"; administradora: string; creditValue?: number; label: string }
	// docx passo 4: "Quero ver outras opções" — surfacing DETERMINÍSTICO das
	// outras ofertas da descoberta (sem free-run do modelo).
	| { kind: "show-other-options"; label?: string }
	| { kind: "whatsapp_optin"; phone: string }
	// FIX-27: número já informado → confirmação de canal sem re-digitar (o route
	// usa o telefone já salvo no lead). Consentimento LGPD preservado.
	| { kind: "whatsapp_optin_confirm" }
	| { kind: "whatsapp_optin_decline" }
	// ── Passo 5 "Contratar" (fechamento Bevi) ──
	// Form de contratação: CPF + celular + aceite LGPD → cria proposta real + simula.
	// FIX-9: com identidade já coletada (identify), o form confirma e manda
	// useStoredIdentity — cpf/celular ficam ausentes e o route resolve via
	// loadIdentity (o CPF completo nunca volta pro browser).
	| {
			kind: "contract-submit";
			cpf?: string;
			celular?: string;
			useStoredIdentity?: boolean;
			lgpd: boolean;
			label?: string;
	  }
	// Usuário confirmou a oferta real → escolhe + gera assinatura/documentos.
	| { kind: "offer-confirm"; label?: string }
	// Upload de documento direto no chat (arquivo em base64). slot = qual documento.
	| {
			kind: "document-upload";
			slot: "identidade_frente" | "identidade_verso" | "comprovante_endereco";
			fileBase64: string;
			filename: string;
			mimeType: string;
	  }
	// FIX-10: conclusão EXPLÍCITA do envio de documentos (os uploads em si
	// sobem silenciosos via /api/chat/document — sem turno de chat por slot).
	| {
			kind: "documents-done";
			sentSlots: Array<"identidade_frente" | "identidade_verso" | "comprovante_endereco">;
			label?: string;
	  }
	// Documentos são opcionais — usuário opta por pular.
	| { kind: "document-skip"; label?: string };
