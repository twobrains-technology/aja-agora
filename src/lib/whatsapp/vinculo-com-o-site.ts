// src/lib/whatsapp/vinculo-com-o-site.ts
//
// A costura do A3: a conversa de WhatsApp que nasceu de um toque no site passa
// a apontar para a MESMA visita que originou o toque.
//
// ── Por que a visita do site, e não uma visita nova ────────────────────────
//
// O caminho do Click-to-WhatsApp cria uma linha própria em `visits` (a Meta
// entrega a origem no webhook e não há visita web nenhuma antes dela). Copiar
// esse desenho aqui seria fácil e estaria errado: a pessoa que toca no botão
// flutuante JÁ é uma visita gravada, com UTM, `fbclid` e `_fbp` dentro. Uma
// segunda linha faria a mesma pessoa contar como duas em `computePorta`
// (`chaveDaPessoa` ancora no `visitor_id`, que no WhatsApp é o `waId` e no site
// é o cookie) — e o item A3 existe justamente para CONSERTAR o denominador da
// campanha, não para inflá-lo de outro jeito.
//
// Apontando para a visita do site, três coisas se resolvem de uma vez:
//   • a conversa entra em "origem conhecida" e sai do buraco de 100% que a
//     medição de 18–30/08 encontrou (6 conversas de WhatsApp, 6 sem `visit_id`);
//   • `registrarConversao` passa a achar `utm_campaign`, `fbc` e `fbp` para os
//     eventos de CAPI dessa conversa — que é o item B2, pelo mesmo fio;
//   • a pessoa continua sendo UMA pessoa nas contagens do painel.
//
// ── Por que aqui e não dentro de `getOrCreateConversation` ─────────────────
//
// Porque a conversa é criada em três lugares (orchestrator, adapter,
// interactive-handlers) e nenhum deles conhece o texto que chegou. O webhook
// conhece — é ele quem lê `message.text.body` — e é o único ponto por onde toda
// mensagem de entrada passa. Mesmo lugar, mesma ordem e mesmo `await` que o
// `recordWhatsAppVisit` do Click-to-WhatsApp já usa.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { resolverVisitaPorCodigo } from "@/lib/attribution/visit-store";
import { getOrCreateConversation } from "./session";

/**
 * Amarra a conversa deste número à visita de site que o trouxe.
 *
 * Idempotente e conservador: só preenche `visit_id` quando ele está NULO. Uma
 * conversa que já tem origem — porque veio de anúncio Click-to-WhatsApp, por
 * exemplo — não é reescrita por um código antigo que a pessoa colou junto.
 * Origem gravada é fato; código no texto é pista.
 *
 * Best-effort como todo o caminho de atribuição: falhar aqui custa a linha do
 * relatório, nunca a conversa.
 */
export async function vincularVisitaDoSite(waId: string, codigo: string): Promise<string | null> {
	try {
		const visitId = await resolverVisitaPorCodigo(codigo);
		if (!visitId) {
			console.log(`[whatsapp-origem] código ${codigo} não bate com nenhuma visita recente`);
			return null;
		}

		// Cria a conversa se ela ainda não existe. É a MESMA função que o
		// processador chamaria segundos depois (idempotente pelo `wa_id`) — fazê-lo
		// aqui, com `await`, garante que a origem esteja gravada antes do primeiro
		// turno, e não numa corrida contra ele.
		await getOrCreateConversation(waId);

		const [atualizada] = await db
			.update(conversations)
			.set({ visitId })
			.where(and(eq(conversations.waId, waId), isNull(conversations.visitId)))
			.returning({ id: conversations.id });

		if (atualizada) {
			console.log(
				`[whatsapp-origem] conversa ${atualizada.id} amarrada à visita ${visitId} (código ${codigo})`,
			);
			return atualizada.id;
		}

		// Já tinha origem. Não é erro: é o caso do cliente que voltou.
		return null;
	} catch (err) {
		console.error("[whatsapp-origem] falha ao amarrar conversa à visita do site:", err);
		return null;
	}
}
