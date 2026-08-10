// Cria (e submete à Meta) o template de RETOMADA do atendente com o cliente.
//
// Rodar:
//   pnpm exec tsx src/scripts/criar-template-atendimento.ts            # cria e submete
//   pnpm exec tsx src/scripts/criar-template-atendimento.ts --so-banco # só registra, não submete
//
// Por que existe: a janela de 24h do WhatsApp conta a partir da última mensagem
// do CLIENTE. Passou disso, a Meta só entrega template aprovado — e sem um
// template de retomada o atendente abria o caso, via a caixa de envio e não
// tinha o que escolher (a lista só mostra APPROVED, e o único template
// cadastrado, `mesa_novo_caso`, avisa o ATENDENTE, não o cliente).
//
// Categoria UTILITY: o texto retoma um atendimento que o próprio cliente pediu.
// Quem classifica no fim é a Meta — se ela reclassificar como MARKETING, o
// template continua funcionando, muda o custo e a política de opt-out.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { whatsappTemplates } from "../db/schema";
import { createTemplate } from "../lib/whatsapp/api";

/** Chave de uso: é por ela que o app acha o template, não pelo nome na Meta. */
export const ATENDENTE_RETOMADA_USAGE_KEY = "atendente_retomada";

const META_NAME = "aja_agora_atendente_retomada";
const LANGUAGE = "pt_BR";

/** `{{1}}` = primeiro nome do cliente. Sem nome de atendente de propósito: caso
 *  reatribuído não deixa o texto mentindo sobre quem está falando. */
const BODY =
	"Oi, {{1}}! Tudo bem?\n\n" +
	"Aqui é da Aja Agora, estou tentando falar com você sobre o seu consórcio.\n\n" +
	"Pode me responder por aqui?";

const COMPONENTS = [
	{
		type: "BODY" as const,
		text: BODY,
		example: { body_text: [["Maria"]] },
	},
];

async function main() {
	const soBanco = process.argv.includes("--so-banco");

	const [existente] = await db
		.select()
		.from(whatsappTemplates)
		.where(eq(whatsappTemplates.usageKey, ATENDENTE_RETOMADA_USAGE_KEY))
		.limit(1);

	if (existente) {
		console.log(
			`[template] já existe: ${existente.metaName} (status ${existente.status}) — nada a criar.`,
		);
		process.exit(0);
	}

	let metaTemplateId: string | null = null;
	let status: "DRAFT" | "PENDING" = "DRAFT";

	if (!soBanco) {
		try {
			const r = (await createTemplate({
				name: META_NAME,
				language: LANGUAGE,
				category: "UTILITY",
				components: COMPONENTS,
				// biome-ignore lint/suspicious/noExplicitAny: shape da Graph API varia por versão
			} as any)) as { id?: string; status?: string };
			metaTemplateId = r?.id ?? null;
			status = "PENDING";
			console.log(`[template] submetido à Meta — id ${metaTemplateId}, aguardando aprovação.`);
		} catch (err) {
			// Falhar na Meta NÃO pode impedir o registro local: com a linha no banco,
			// a tela de Templates mostra o template e permite reenviar a submissão.
			console.error(
				`[template] submissão à Meta falhou (${err instanceof Error ? err.message : err}).`,
			);
			console.error("[template] registrando como DRAFT — reenvie pela tela Admin → WhatsApp.");
		}
	}

	const [row] = await db
		.insert(whatsappTemplates)
		.values({
			usageKey: ATENDENTE_RETOMADA_USAGE_KEY,
			metaName: META_NAME,
			language: LANGUAGE,
			category: "UTILITY",
			components: COMPONENTS,
			bodyPreview: BODY,
			status,
			metaTemplateId,
			submittedAt: status === "PENDING" ? new Date() : null,
		})
		.returning();

	console.log(`[template] registrado: ${row.metaName} · usageKey=${row.usageKey} · ${row.status}`);
	process.exit(0);
}

main().catch((e) => {
	console.error("[template] falhou:", e);
	process.exit(1);
});
