import { z } from "zod";

// Validação do perfil corporativo do WhatsApp (o que o cliente vê ao abrir a
// conversa: foto, nome do negócio, descrição, endereço, e-mail, sites, ramo).
// Lógica pura, sem rede — testável em test:unit.
//
// A FONTE DE VERDADE DESTE DADO É A META, não o nosso Postgres. Não há tabela
// espelhando o perfil de propósito: espelho vira duas verdades no dia em que
// alguém edita pelo WhatsApp Business Manager, e o painel passa a exibir com
// confiança um dado que não é mais o que está no ar. A tela lê da Graph e
// escreve na Graph.

/**
 * Ramos de atividade que a Graph aceita em `vertical`, com o rótulo em português
 * que aparece no painel. O enum é da Meta (valores literais dela); a tradução é
 * nossa, porque "PROF_SERVICES" num select não diz nada a quem opera.
 */
export const RAMOS_DE_ATIVIDADE = {
	OTHER: "Outro",
	AUTO: "Automotivo",
	BEAUTY: "Beleza, spa e salão",
	APPAREL: "Vestuário",
	EDU: "Educação",
	ENTERTAIN: "Entretenimento",
	EVENT_PLAN: "Organização de eventos",
	FINANCE: "Finanças e bancos",
	GROCERY: "Alimentos e mercearia",
	GOVT: "Serviço público",
	HOTEL: "Hotelaria e hospedagem",
	HEALTH: "Saúde e bem-estar",
	NONPROFIT: "Organização sem fins lucrativos",
	PROF_SERVICES: "Serviços profissionais",
	RETAIL: "Varejo",
	TRAVEL: "Viagens e transporte",
	RESTAURANT: "Restaurante",
	ALCOHOL: "Bebidas alcoólicas",
	ONLINE_GAMBLING: "Jogos de azar online",
	PHYSICAL_GAMBLING: "Jogos de azar presenciais",
	OTC_DRUGS: "Medicamentos isentos de prescrição",
} as const;

export type RamoDeAtividade = keyof typeof RAMOS_DE_ATIVIDADE;

export const VERTICAIS = Object.keys(RAMOS_DE_ATIVIDADE) as [RamoDeAtividade, ...RamoDeAtividade[]];

/**
 * Campo de texto do perfil.
 *
 * A semântica é: CHAVE AUSENTE = não mexe nesse campo; CHAVE VAZIA ("") = apaga.
 * Diferente do form de templates, aqui vazio NÃO vira `undefined` — se virasse,
 * não haveria como limpar um campo já preenchido: apagar o texto na tela e
 * salvar não faria nada, e o operador ficaria repetindo o gesto achando que o
 * botão está quebrado. A tela envia o formulário inteiro, então "vazio" é uma
 * decisão de quem está lá, não omissão.
 */
const textoDoPerfil = (max: number, rotulo: string) =>
	z.string().trim().max(max, `${rotulo}: máximo de ${max} caracteres`).optional();

// Os `max` abaixo são TETO DE SANIDADE nosso (não deixar subir payload absurdo),
// não a regra da Meta — a doc pública do endpoint não publica limite por campo.
// Quem recusa de verdade é a Graph, e a mensagem dela sobe literal até a tela
// (`mensagemDeErroDaGraph` em `business-profile.ts`), justamente pra não
// inventarmos aqui um número que a Meta desminta amanhã.
const LIMITE_ABOUT = 512;
const LIMITE_DESCRICAO = 512;
const LIMITE_ENDERECO = 512;
const LIMITE_EMAIL = 128;

/**
 * Um site do perfil. Exige http(s) explícito: a Graph recusa URL sem esquema, e
 * o erro que ela devolve nesse caso não diz qual dos campos está errado.
 */
const siteSchema = z
	.string()
	.trim()
	.max(256, "Site: máximo de 256 caracteres")
	.refine((v) => /^https?:\/\/.+/.test(v), "O site precisa começar com http:// ou https://");

export const perfilCorporativoSchema = z.object({
	about: textoDoPerfil(LIMITE_ABOUT, "Recado"),
	description: textoDoPerfil(LIMITE_DESCRICAO, "Descrição"),
	address: textoDoPerfil(LIMITE_ENDERECO, "Endereço"),
	// `""` precisa passar (é como se apaga o e-mail); qualquer outra coisa tem
	// que ser e-mail de verdade, senão o cliente responde para um endereço morto.
	email: z
		.union([
			z.literal(""),
			z
				.string()
				.trim()
				.max(LIMITE_EMAIL, `E-mail: máximo de ${LIMITE_EMAIL} caracteres`)
				.email("E-mail inválido"),
		])
		.optional(),
	// Sem limite de QUANTIDADE aqui: a doc não publica quantos a Graph aceita, e
	// travar em 2 por conta própria seria cravar o que não verificamos. A tela
	// oferece dois campos (é o que o perfil exibe no app); se um dia precisar de
	// mais, o schema não é o obstáculo.
	websites: z.array(siteSchema).optional(),
	vertical: z.enum(VERTICAIS).optional(),
});

export type PerfilCorporativoInput = z.infer<typeof perfilCorporativoSchema>;

// ---- Foto de perfil ----

/**
 * Tipos que a Resumable Upload API da Meta aceita — recorte de imagem da lista
 * dela (`application/pdf`, `image/jpeg`, `image/jpg`, `image/png`, `video/mp4`).
 * Allowlist: formato novo entra por decisão, não por omissão.
 */
export const MIMES_DE_FOTO_ACEITOS = ["image/jpeg", "image/jpg", "image/png"] as const;

/**
 * Teto de tamanho do arquivo (5 MB). É NOSSO — segura upload absurdo antes de
 * gastar uma viagem à Meta; a recusa final continua sendo dela.
 */
export const TAMANHO_MAXIMO_DA_FOTO_BYTES = 5 * 1024 * 1024;

export function ehMimeDeFotoAceito(mime: string): boolean {
	return (MIMES_DE_FOTO_ACEITOS as readonly string[]).includes(mime.toLowerCase());
}

/** Recusa legível pro upload de foto, ou `null` quando o arquivo serve. */
export function recusaDaFoto(arquivo: { type: string; size: number }): string | null {
	if (!ehMimeDeFotoAceito(arquivo.type)) {
		return "A foto precisa ser JPEG ou PNG.";
	}
	if (arquivo.size > TAMANHO_MAXIMO_DA_FOTO_BYTES) {
		return "A foto precisa ter no máximo 5 MB.";
	}
	if (arquivo.size === 0) {
		return "O arquivo está vazio.";
	}
	return null;
}
