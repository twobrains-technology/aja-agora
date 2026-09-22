// Integração REAL: o dossiê da pessoa contra o Postgres (repo drizzle + FK de
// `contact_id` em `bevi_proposals`).
//
// É o "falha antes / passa depois" da correção: pela CONVERSA o
// `getLatestBeviProposal` não vê nada (é o que o agente via na `e5f6a7b8`), e
// pela PESSOA a proposta de outra conversa aparece.
//
// Roda SÓ com RUN_DB_TESTS=1 (no host o `.env.local` aponta para
// `aja-shared-pg`, que só resolve dentro do container) — mesmo gate dos outros
// testes de integração do projeto.

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { beviProposals, contacts, conversations } from "@/db/schema";
import { blocoDaPessoa } from "@/lib/agent/langgraph/nodes/contexto-da-tela";
import { dossieDaConversa, dossieDaPessoa, pessoaDaConversa, variantesDeTelefone } from "./pessoa";
import { getLatestBeviProposal, getProposalsByContactId } from "./proposal-repo";

const run = process.env.RUN_DB_TESTS === "1";

describe.runIf(run)("pessoa — dossiê cross-canal contra o DB real", () => {
	const conversasCriadas: string[] = [];
	let contatoCriado: string | null = null;

	afterAll(async () => {
		for (const id of conversasCriadas)
			await db.delete(conversations).where(eq(conversations.id, id));
		if (contatoCriado) await db.delete(contacts).where(eq(contacts.id, contatoCriado));
	});

	it("acha proposta criada em OUTRA conversa do mesmo telefone", async () => {
		// Telefone exclusivo deste teste (celular de DDD 62) — `contacts_phone_idx`
		// não é único, então o valor precisa não colidir com dado real.
		const sufixo = String(Math.floor(Math.random() * 90_000_000) + 10_000_000);
		const telefoneGravado = `629${sufixo}`; // o que contacts.phone grava (11 dígitos)
		const telefoneWhatsApp = `55${telefoneGravado}`; // o que o waId traz

		const [contato] = await db
			.insert(contacts)
			.values({ phone: telefoneGravado, name: "Teste L1 — pessoa" })
			.returning({ id: contacts.id });
		contatoCriado = contato.id;

		const [convWhatsApp] = await db
			.insert(conversations)
			.values({ contactId: contato.id, waId: telefoneWhatsApp, channel: "whatsapp" })
			.returning({ id: conversations.id });
		const [convWeb] = await db
			.insert(conversations)
			.values({ contactId: contato.id, channel: "web" })
			.returning({ id: conversations.id });
		conversasCriadas.push(convWhatsApp.id, convWeb.id);

		// A proposta nasce na conversa WEB — não na atual.
		await db.insert(beviProposals).values({
			conversationId: convWeb.id,
			contactId: contato.id,
			proposalId: `teste-l1-${sufixo}`,
			administradora: "ITAÚ",
			grupo: "g-1188",
			creditValue: "132000.00",
			monthlyPayment: "3375.00",
			termMonths: 120,
			proposalStatus: "simulacao",
		});

		// O que a conversa ATUAL enxergava: nada.
		expect(await getLatestBeviProposal(convWhatsApp.id)).toBeNull();

		// O que a PESSOA tem — pelo repositório...
		const doContato = await getProposalsByContactId(contato.id);
		expect(doContato).toHaveLength(1);
		expect(doContato[0].administradora).toBe("ITAÚ");

		// ...e pelo dossiê, com o telefone na grafia do WhatsApp.
		const dossie = await dossieDaPessoa(telefoneWhatsApp);
		expect(dossie.contatoId).toBe(contato.id);
		expect(dossie.semHistorico).toBe(false);
		expect(dossie.simulacoes[0]).toMatchObject({
			administradora: "ITAÚ",
			creditValue: 132_000,
			monthlyPayment: 3_375,
			termMonths: 120,
			conversaId: convWeb.id,
			canal: "web",
		});
		expect(dossie.conversas.map((c) => c.canal).sort()).toEqual(["web", "whatsapp"]);

		// A grafia sem o código de país também alcança (é a chave tolerante).
		expect((await dossieDaPessoa(telefoneGravado)).contatoId).toBe(contato.id);
		expect(variantesDeTelefone(telefoneWhatsApp)).toContain(telefoneGravado);

		// A chamada única que o turno faz: conversa → dossiê da pessoa.
		const daConversa = await dossieDaConversa(convWhatsApp.id);
		if (!daConversa) throw new Error("dossiê da conversa não montou");
		expect(daConversa.simulacoes[0]?.conversaId).toBe(convWeb.id);
		expect(blocoDaPessoa(daConversa)).toContain("ITAÚ");

		// A conversa sem contato religado resolve pelo waId — sem CRIAR contato.
		await db
			.update(conversations)
			.set({ contactId: null })
			.where(eq(conversations.id, convWhatsApp.id));
		expect(await pessoaDaConversa(convWhatsApp.id)).toMatchObject({ contactId: contato.id });
		expect((await dossieDaConversa(convWhatsApp.id))?.simulacoes).toHaveLength(1);
	});
});
