import { z } from "zod";
import type { WhatsappTemplateComponent } from "@/db/schema";

// Validação do form de cadastro/edição de Message Template (WhatsApp Meta) e o
// builder que traduz os campos do form para o array `components` que a Cloud API
// espera. Lógica pura, sem DB — testável em test:unit.
// Design: docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.
// Decisões: docs/correcoes/decisions/2026-07-02-bloco-whatsapp-templates-admin.md.

// Categorias que a Meta aceita na criação (ela pode recategorizar depois).
export const TEMPLATE_CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

// snake_case: minúsculas, números e `_` — regra da Meta pro nome do template e a
// mesma convenção adotada pra chave lógica (usageKey) por consistência.
const SNAKE_CASE = /^[a-z0-9_]+$/;
const SNAKE_MSG = "Use apenas letras minúsculas, números e _ (snake_case)";

// Normaliza texto opcional: trim; vazio (ou não-string) vira `undefined`.
const blankToUndefined = (v: unknown): unknown => {
	if (typeof v !== "string") return v;
	const t = v.trim();
	return t === "" ? undefined : t;
};

const metaNameSchema = z
	.string()
	.trim()
	.min(1, "Nome do template é obrigatório")
	.max(512, "Nome muito longo")
	.regex(SNAKE_CASE, SNAKE_MSG);

// usageKey opcional: trim; vazio → undefined; se presente, exige snake_case.
const usageKeyOptional = z.preprocess(
	blankToUndefined,
	z.string().max(120, "Chave de uso muito longa").regex(SNAKE_CASE, SNAKE_MSG).optional(),
);

const languageSchema = z.string().trim().min(2, "Idioma inválido").max(10, "Idioma inválido");

const bodySchema = z
	.string()
	.trim()
	.min(1, "Corpo (BODY) é obrigatório")
	.max(1024, "Corpo muito longo (máx 1024)");

const headerFooterOptional = z.preprocess(
	blankToUndefined,
	z.string().max(60, "Máximo 60 caracteres").optional(),
);

// ─── Header de imagem, botão de resposta rápida e carrossel ──────────────────
// A campanha de remarketing não é texto: é arte (1080×1080) com botão "Quero
// ver", e um carrossel de autoridade. A Cloud API só aceita imagem em template
// por `header_handle` — o handle devolvido pela Resumable Upload API —, nunca
// por URL como no ENVIO de mensagem. Ver `uploadTemplateHeaderMedia` em api.ts.

/** Formatos de cabeçalho que o form oferece (o terceiro modo da tela é o carrossel). */
export const HEADER_FORMATS = ["TEXT", "IMAGE"] as const;
export type HeaderFormat = (typeof HEADER_FORMATS)[number];

/** Texto padrão do botão de resposta rápida — é o que o agente espera ler de volta. */
export const QUICK_REPLY_PADRAO = "Quero ver";

/**
 * Objetivos da campanha de remarketing com a chave lógica que o MOTOR consome.
 *
 * Isto NÃO é sugestão de UI: o motor escolhe o template pelo `usageKey` e, se a
 * linha não existir com ESSA chave, o toque só enfileira e a campanha não sai.
 * A chave é `UNIQUE` na tabela, então o form sugere a canônica por objetivo em
 * vez de deixar o campo em branco — variação de nome aqui não dá erro, some.
 * `arte` é o nome do arquivo já versionado em `public/kv/remarketing/`.
 */
export const OBJETIVOS_DE_REMARKETING = [
	{
		valor: "oportunidade_carro",
		rotulo: "Oportunidade — carro",
		usageKey: "remarketing_oportunidade_carro",
		modo: "IMAGE",
		arte: "oportunidade-carro.png",
	},
	{
		valor: "oportunidade_moto",
		rotulo: "Oportunidade — moto",
		usageKey: "remarketing_oportunidade_moto",
		modo: "IMAGE",
		arte: "oportunidade-moto.png",
	},
	{
		valor: "oportunidade_imovel",
		rotulo: "Oportunidade — imóvel",
		usageKey: "remarketing_oportunidade_imovel",
		modo: "IMAGE",
		arte: "oportunidade-imovel.png",
	},
	{
		valor: "autoridade",
		rotulo: "Autoridade (carrossel de 3 cards)",
		usageKey: "remarketing_autoridade_v1",
		modo: "CARROSSEL",
		arte: "autoridade-1.png, autoridade-2.png e autoridade-3.png",
	},
] as const satisfies ReadonlyArray<{
	valor: string;
	rotulo: string;
	usageKey: string;
	modo: "IMAGE" | "CARROSSEL";
	arte: string;
}>;

/** Limites da Meta (não nossos). Botão de resposta rápida: 25; corpo de card: 160. */
export const LIMITE_TEXTO_BOTAO = 25;
export const LIMITE_BODY_CARD = 160;
/** A Meta aceita de 2 a 10 cards; a campanha usa 3 (autoridade em três provas). */
export const CARROSSEL_QTD_CARDS = 3;

/**
 * Tipos de arquivo que a Resumable Upload API da Meta aceita para header de
 * template em imagem. Allowlist: formato novo entra por decisão, não por omissão.
 */
export const MIMES_DA_ARTE = ["image/jpeg", "image/jpg", "image/png"] as const;
/** Teto NOSSO de 5 MB — segura upload absurdo antes de gastar viagem à Meta. */
export const TAMANHO_MAXIMO_DA_ARTE_BYTES = 5 * 1024 * 1024;

/** Recusa legível pro upload da arte, ou `null` quando o arquivo serve. */
export function recusaDaArte(arquivo: { type: string; size: number }): string | null {
	if (!(MIMES_DA_ARTE as readonly string[]).includes(arquivo.type.toLowerCase())) {
		return "A arte precisa ser JPEG ou PNG.";
	}
	if (arquivo.size === 0) return "O arquivo está vazio.";
	if (arquivo.size > TAMANHO_MAXIMO_DA_ARTE_BYTES) return "A arte precisa ter no máximo 5 MB.";
	return null;
}

/**
 * Um card do carrossel. O handle é o da arte DAQUELE card; o corpo é o texto
 * curto de autoridade e o botão é o que volta como resposta do cliente.
 */
export interface CardDoCarrossel {
	headerHandle: string;
	body: string;
	buttonText?: string;
}

/**
 * Componente no shape da Cloud API que este builder sabe montar.
 *
 * `CAROUSEL` não existe no tipo de `src/db/schema.ts` (arquivo de outro bloco,
 * proibido de editar) — por isso o builder devolve este tipo mais largo e as
 * rotas fazem o cast na hora de gravar. O shape é o da doc da Meta:
 * `{ type: "CAROUSEL", cards: [{ components: [HEADER, BODY, BUTTONS] }] }`.
 */
export type ComponenteDeTemplate =
	| WhatsappTemplateComponent
	| { type: "CAROUSEL"; cards: Array<{ components: ComponenteDeTemplate[] }> };

/**
 * A Meta trata `carousel` como template de MARKETING: ela mesma recategoriza, e
 * declarar outra categoria faz o template ser rejeitado ou reescrito por ela. O
 * mesmo vale para a arte de campanha com chamada (imagem + botão). Enforçamos
 * antes de gastar a submissão — o nome do template queima e a aprovação é humana.
 */
export function exigeCategoriaMarketing(input: {
	headerFormat?: string;
	quickReplyText?: string | null;
	carousel?: unknown[] | null;
}): boolean {
	if (Array.isArray(input.carousel) && input.carousel.length > 0) return true;
	return input.headerFormat === "IMAGE" && Boolean(input.quickReplyText?.trim());
}

/**
 * Promessa de contemplação — o que a validação recusa.
 *
 * Isto NÃO é guard de conversa (lá o assunto é do vendedor, decisão do Kairo em
 * 2026-08-10). É pré-submissão de TEMPLATE: a copy aprovada não pode prometer
 * contemplação garantida nem cravar data, porque a Meta reprova a promessa e
 * porque a campanha fala em "menor custo da faixa", não em resultado. A checagem
 * é estreita de propósito: casa a promessa explícita, não o assunto.
 */
function semAcento(texto: string): string {
	return texto
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

const PROMESSAS_PROIBIDAS: Array<{ rotulo: string; padrao: RegExp }> = [
	{
		rotulo: "contemplação garantida",
		padrao:
			/contemplacao\s+garantida|garantia\s+de\s+contemplacao|contemplado\s+garantido|garantido\s+de\s+contemplacao/,
	},
	{
		rotulo: "data de contemplação",
		padrao: /data\s+da\s+contemplacao|dia\s+da\s+contemplacao|contemplacao\s+em\s+\d{1,2}\/\d{1,2}/,
	},
];

/** Devolve o motivo da recusa se algum texto prometer contemplação; senão `null`. */
export function promessaDeContemplacao(textos: Array<string | undefined>): string | null {
	for (const texto of textos) {
		if (!texto) continue;
		const normalizado = semAcento(texto);
		for (const { padrao } of PROMESSAS_PROIBIDAS) {
			if (padrao.test(normalizado)) {
				return 'Não prometa contemplação garantida nem data de contemplação — a campanha fala em "menor custo da faixa".';
			}
		}
	}
	return null;
}

const headerFormatSchema = z.enum(HEADER_FORMATS).optional();

const headerHandleOptional = z.preprocess(
	blankToUndefined,
	z.string().max(4096, "Handle do cabeçalho muito longo").optional(),
);

const quickReplyTextOptional = z.preprocess(
	blankToUndefined,
	z
		.string()
		.trim()
		.max(LIMITE_TEXTO_BOTAO, `Texto do botão: máximo de ${LIMITE_TEXTO_BOTAO} caracteres`)
		.optional(),
);

const cardSchema = z.object({
	headerHandle: z
		.string()
		.trim()
		.min(1, "Cada card precisa da arte (handle) do cabeçalho")
		.max(4096, "Handle do card muito longo"),
	body: z
		.string()
		.trim()
		.min(1, "Cada card precisa de um corpo")
		.max(LIMITE_BODY_CARD, `Corpo do card: máximo de ${LIMITE_BODY_CARD} caracteres`),
	buttonText: z.preprocess(
		blankToUndefined,
		z
			.string()
			.trim()
			.max(LIMITE_TEXTO_BOTAO, `Texto do botão: máximo de ${LIMITE_TEXTO_BOTAO} caracteres`)
			.optional(),
	),
});

// Array vazio é o mesmo que ausente (o form manda `[]` quando o modo não é
// carrossel). Qualquer outro tamanho que não 3 é recusado — a Meta aceita 2 a 10,
// mas o carrossel de autoridade desta campanha é de 3, e um carrossel de 2 ou 4
// significa que a tela perdeu um card, não que a campanha mudou.
const carouselOptional = z.preprocess(
	(v) => (Array.isArray(v) && v.length === 0 ? undefined : v),
	z
		.array(cardSchema)
		.length(CARROSSEL_QTD_CARDS, `O carrossel precisa de exatamente ${CARROSSEL_QTD_CARDS} cards`)
		.optional(),
);

/**
 * Regras cruzadas que dependem de mais de um campo (imagem exige handle; arte
 * exige MARKETING; copy não promete contemplação). Aplicadas nos dois schemas.
 */
function refinarTemplate(
	val: {
		category?: TemplateCategory;
		headerFormat?: HeaderFormat;
		headerHandle?: string;
		header?: string;
		body?: string;
		footer?: string;
		quickReplyText?: string;
		carousel?: CardDoCarrossel[];
	},
	ctx: z.RefinementCtx,
): void {
	if (val.headerFormat === "IMAGE" && !val.headerHandle) {
		ctx.addIssue({
			code: "custom",
			path: ["headerHandle"],
			message: "Header de imagem exige a arte enviada (handle do upload).",
		});
	}

	if (
		val.category &&
		val.category !== "MARKETING" &&
		exigeCategoriaMarketing({
			headerFormat: val.headerFormat,
			quickReplyText: val.quickReplyText,
			carousel: val.carousel,
		})
	) {
		ctx.addIssue({
			code: "custom",
			path: ["category"],
			message:
				"Template com arte (imagem e botão, ou carrossel) precisa da categoria Marketing — a Meta recategoriza e reprova fora dela.",
		});
	}

	const promessa = promessaDeContemplacao([
		val.header,
		val.body,
		val.footer,
		...(val.carousel?.map((c) => c.body) ?? []),
	]);
	if (promessa) {
		ctx.addIssue({ code: "custom", path: ["body"], message: promessa });
	}
}

// Cadastro (POST): metaName/category/corpo obrigatórios; usageKey/language/header/
// footer opcionais (D1 — usageKey não é obrigatório no cadastro).
export const createTemplateSchema = z
	.object({
		usageKey: usageKeyOptional,
		metaName: metaNameSchema,
		category: z.enum(TEMPLATE_CATEGORIES),
		language: languageSchema.default("pt_BR"),
		headerFormat: headerFormatSchema,
		header: headerFooterOptional,
		headerHandle: headerHandleOptional,
		body: bodySchema,
		footer: headerFooterOptional,
		quickReplyText: quickReplyTextOptional,
		carousel: carouselOptional,
	})
	.superRefine(refinarTemplate);

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// Edição (PATCH): tudo parcial. usageKey pode ser limpo com `null` (desvincular).
export const updateTemplateSchema = z
	.object({
		// `null`/"" desvinculam (limpam o usageKey); ausente = não mexe; valor = snake_case.
		usageKey: z.preprocess((v) => {
			if (v === null) return null;
			if (typeof v !== "string") return v;
			const t = v.trim();
			return t === "" ? null : t;
		}, z
			.union([
				z.null(),
				z.string().max(120, "Chave de uso muito longa").regex(SNAKE_CASE, SNAKE_MSG),
			])
			.optional()),
		metaName: metaNameSchema.optional(),
		category: z.enum(TEMPLATE_CATEGORIES).optional(),
		language: languageSchema.optional(),
		headerFormat: headerFormatSchema,
		header: headerFooterOptional,
		headerHandle: headerHandleOptional,
		body: bodySchema.optional(),
		footer: headerFooterOptional,
		quickReplyText: quickReplyTextOptional,
		carousel: carouselOptional,
	})
	.superRefine(refinarTemplate);

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

// Maior índice de placeholder `{{n}}` referenciado no texto (0 se nenhum). A Meta
// conta variáveis por posição — precisamos de N valores de exemplo.
function maxPlaceholderIndex(text: string): number {
	const matches = text.match(/\{\{\s*(\d+)\s*\}\}/g);
	if (!matches) return 0;
	return Math.max(
		...matches.map((m) => Number.parseInt(m.replace(/[^\d]/g, ""), 10)).filter((n) => n > 0),
	);
}

function sampleValues(count: number): string[] {
	return Array.from({ length: count }, (_, i) => `exemplo${i + 1}`);
}

/**
 * Traduz os campos do form para o array `components` da Cloud API + o
 * `bodyPreview` denormalizado.
 *
 * Formas montadas (a Meta usa MAIÚSCULA nos `type`, como o resto do repo):
 *   - HEADER TEXT   `{ type: "HEADER", format: "TEXT", text, example? }`
 *   - HEADER IMAGE  `{ type: "HEADER", format: "IMAGE", example: { header_handle: [handle] } }`
 *   - BODY          `{ type: "BODY", text, example? }`
 *   - FOOTER        `{ type: "FOOTER", text }`
 *   - BUTTONS       `{ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text }] }`
 *   - CAROUSEL      `{ type: "CAROUSEL", cards: [{ components: [HEADER, BODY, BUTTONS?] }] }`
 *
 * Quando o corpo (ou header de texto, ou card) tem variáveis `{{n}}`, injeta
 * `example.*_text` com valores de exemplo — a Meta exige exemplos nesse caso.
 * No carrossel o botão de resposta rápida vive DENTRO de cada card (contrato da
 * Meta); o `quickReplyText` de topo só vale para os modos texto/imagem.
 */
export function buildTemplateComponents(input: {
	header?: string;
	headerFormat?: HeaderFormat;
	headerHandle?: string;
	body: string;
	footer?: string;
	quickReplyText?: string;
	carousel?: CardDoCarrossel[];
}): { components: ComponenteDeTemplate[]; bodyPreview: string } {
	const components: ComponenteDeTemplate[] = [];

	const cards = input.carousel ?? [];

	// No carrossel NÃO existe header de topo: a Meta define carrossel como "um
	// corpo + N cards", e a arte vai dentro de cada card. Emitir um HEADER aqui
	// junto com CAROUSEL é payload que ela recusa — então o header de topo só
	// existe fora do modo carrossel.
	if (cards.length === 0) {
		if (input.headerFormat === "IMAGE") {
			const handle = input.headerHandle?.trim();
			if (handle) {
				components.push({
					type: "HEADER",
					format: "IMAGE",
					example: { header_handle: [handle] },
				});
			}
		} else {
			const header = input.header?.trim();
			if (header) {
				const headerVars = maxPlaceholderIndex(header);
				components.push({
					type: "HEADER",
					format: "TEXT",
					text: header,
					...(headerVars > 0 ? { example: { header_text: sampleValues(headerVars) } } : {}),
				});
			}
		}
	}

	const bodyVars = maxPlaceholderIndex(input.body);
	components.push({
		type: "BODY",
		text: input.body,
		...(bodyVars > 0 ? { example: { body_text: [sampleValues(bodyVars)] } } : {}),
	});

	const footer = input.footer?.trim();
	if (footer) {
		components.push({ type: "FOOTER", text: footer });
	}

	if (cards.length > 0) {
		components.push({
			type: "CAROUSEL",
			cards: cards.map((card) => {
				const cardComponents: ComponenteDeTemplate[] = [
					{
						type: "HEADER",
						format: "IMAGE",
						example: { header_handle: [card.headerHandle.trim()] },
					},
					{ type: "BODY", text: card.body },
				];
				const buttonText = card.buttonText?.trim();
				if (buttonText) {
					cardComponents.push({
						type: "BUTTONS",
						buttons: [{ type: "QUICK_REPLY", text: buttonText }],
					});
				}
				return { components: cardComponents };
			}),
		});
	} else {
		const quickReply = input.quickReplyText?.trim();
		if (quickReply) {
			components.push({
				type: "BUTTONS",
				buttons: [{ type: "QUICK_REPLY", text: quickReply }],
			});
		}
	}

	return { components, bodyPreview: input.body };
}

/**
 * Última barreira antes de tocar a Meta: valida o que está PERSISTIDO (não o que
 * veio do form). O submit usa isto para não gastar uma submissão — que queima o
 * nome do template e espera aprovação humana — com um payload que a Meta recusa.
 * Devolve o motivo, ou `null` quando pode ir.
 */
export function recusaDeSubmissao(input: {
	category: TemplateCategory | null;
	components: ComponenteDeTemplate[] | null;
}): string | null {
	const components = input.components ?? [];

	let temCarrossel = false;
	let headerDeImagemSemHandle = false;
	let temHeaderDeImagem = false;
	let temBotao = false;
	const textos: string[] = [];

	for (const componente of components) {
		if (componente.type === "HEADER") {
			if (componente.text) textos.push(componente.text);
			if (componente.format === "IMAGE") {
				if (!componente.example) headerDeImagemSemHandle = true;
				temHeaderDeImagem = true;
			}
		} else if (componente.type === "BODY") {
			if (componente.text) textos.push(componente.text);
		} else if (componente.type === "CAROUSEL") {
			temCarrossel = true;
			for (const card of componente.cards) {
				for (const dentro of card.components) {
					if (dentro.type === "BODY" && dentro.text) textos.push(dentro.text);
				}
			}
		} else if (componente.type === "BUTTONS") {
			if ((componente.buttons?.length ?? 0) > 0) temBotao = true;
		}
	}

	if (headerDeImagemSemHandle) {
		return "Header de imagem sem handle de upload — reenvie a arte antes de submeter.";
	}
	if (temCarrossel && input.category !== "MARKETING") {
		return "Carrossel exige a categoria Marketing — a Meta só aceita carrossel em template de marketing.";
	}
	if (temHeaderDeImagem && temBotao && input.category !== "MARKETING") {
		return "Arte de campanha com botão exige a categoria Marketing — a Meta recategoriza e reprova fora dela.";
	}

	return promessaDeContemplacao(textos);
}
