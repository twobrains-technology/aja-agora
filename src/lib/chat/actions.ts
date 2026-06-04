import type { Category, ExperiencePrev } from "@/lib/agent/personas";

/**
 * Single source of truth for all client → server actions in the chat.
 * Used by both `provider.tsx` (sendAction) and `/api/chat/route.ts` (handler).
 *
 * Adding a new action: extend this union — both call sites get it for free.
 */
export type ChatAction =
	| { kind: "gate"; gate: "experience"; value: ExperiencePrev; label: string }
	| { kind: "gate"; gate: "consent"; value: "yes" | "more"; label: string }
	| {
			kind: "gate";
			gate: "credit";
			value: { credit: number; monthlyBudget: number };
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
	// docx passo 4: "Quero ver outras opções" — surfacing DETERMINÍSTICO das
	// outras ofertas da descoberta (sem free-run do modelo).
	| { kind: "show-other-options"; label?: string }
	| { kind: "whatsapp_optin"; phone: string }
	| { kind: "whatsapp_optin_decline" }
	// ── Passo 5 "Contratar" (fechamento Bevi) ──
	// Form de contratação: CPF + celular + aceite LGPD → cria proposta real + simula.
	| { kind: "contract-submit"; cpf: string; celular: string; lgpd: boolean; label?: string }
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
	// Documentos são opcionais — usuário opta por pular.
	| { kind: "document-skip"; label?: string };
