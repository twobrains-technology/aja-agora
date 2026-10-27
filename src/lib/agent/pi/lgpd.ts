// O ÚNICO BLOQUEIO DE DADO QUE RESTOU: A REVOGAÇÃO EXPLÍCITA.
//
// Decisão do dono (27/10/2026, 13:12): *"pii que se foda… o objetivo é vender, nada de barrar
// nada por pii"*. Isso apagou o aviso canônico, o "sim" e o estágio de consentimento: pedir
// CPF ou celular não depende de autorização e gerar proposta não espera confirmação (o portão
// saiu em `d7394727`).
//
// O que estava vivo aqui mesmo depois disso era a TEXTA: `AVISO_LGPD` era a frase canônica que
// a skill `proposta-com-dados-do-cliente` mandava recitar (o aviso com "conforme a LGPD" e o pedido de
// autorização no fim) e que o formatter do WhatsApp colava antes de pedir o CPF. Medido nos prints do dono de 27/10
// (`.orientacao/prints-kairo/1532-formulario-fixo.png`): a pessoa disse "você nem tem meu
// telefone, e se eu fechar a tela agora?" e o agente respondeu com o aviso da LGPD pedindo CPF,
// **sem pedir o WhatsApp** — o rito atropelou o contato, que é o ativo (P6).
//
// Resta uma coisa: quem diz "não autorizo" não pode ter proposta gerada. Não é consentimento
// como pedágio, é não atropelar quem pediu para parar. Nada aqui lê a fala do agente; só a do
// cliente.
// O pedido de dado é um ATO: o verbo de pedir junto do dado, ou a pergunta pelo dado.
// Só a presença da palavra não basta — "atendemos pelo WhatsApp" ou "seu celular
// cadastrado" falam do dado, não pedem nada, e não podem ser trocados pelo aviso de
// consentimento (N04: o cliente que perguntou do canal recebia um pedido de autorização sobre CPF).
const ATO_DE_PEDIR = String.raw`(?:me\s+)?(?:pass(?:a|e|ar|em|aria)|inform(?:a|e|ar|em|aria)|envi(?:a|e|ar|em|aria)|mand(?:a|e|ar|em|aria)|d[ií]g(?:a|am|o|z)|confirma(?:r|m|ria)?|precis(?:o|amos|a|am|ava|aria)|solicit(?:o|amos|a|am|ou)|compartilh(?:a|e|ar|em|aria)|cadastr(?:a|e|ar|em|aria)|ped(?:ir|imos)|pe[cç]o|pe[çc]a)`;
const DADO = String.raw`(?:cpf|celular|telefone|whats\s?app|n[uú]mero(?:\s+(?:do|da|de|seu|sua|teu|tua)){0,3}\s+(?:celular|telefone|whats\s?app))`;
// Na terceira pessoa o verbo descreve, não pede: "o contrato informa o telefone da
// administradora" não é coleta de dado. Sujeito na frente do verbo = descrição.
const SUJEITO = String.raw`(?<![oa]s?\s|ele\s|ela\s|eles\s|elas\s|que\s|isso\s|isto\s|voc[êe]s\s|contrato\s|proposta\s|sistema\s|banco\s|administradora\s|empresa\s)`;

/** O pedido de dado pessoal — CPF ou celular. Usado pelo formatter do WhatsApp e pelo aceite; NÃO reescreve balão. */
export const PEDE_DADO_RE = new RegExp(
	[
		// "me passa seu CPF", "preciso do celular", "envie o número do WhatsApp"
		String.raw`\b${SUJEITO}${ATO_DE_PEDIR}\b[^.?!\n]{0,40}?\b${DADO}\b`,
		// "seu CPF, por favor", "o celular pra mim"
		String.raw`\b${DADO}\b[^.?!\n]{0,20}?\b(?:por\s+favor|pra\s+mim|para\s+mim|me\s+(?:passa|envia|manda|informa|diz))\b`,
		// pergunta pelo dado: "qual o seu CPF?", "qual é o seu celular com DDD?"
		String.raw`\b(?:qual|quais|como)\b[^.?!\n]{0,25}?\b${DADO}\b`,
	].join("|"),
	"i",
);

/* A REVOGAÇÃO É O LADO SEGURO — e por isso é o único que atravessa a pergunta.
 *
 * "Não autorizo consultar meu CPF, podemos seguir sem isso?" é uma fala com uma
 * revogação e uma pergunta: se a pergunta apagasse a revogação, a consulta de bureau ia
 * em frente depois de um "não autorizo" explícito (P262, rodadas 4 e 5). Aqui, uma
 * declaração de revogação derruba o consentimento em qualquer lugar da fala.
 *
 * O que a revogação NÃO pode é nascer de uma recusa da OFERTA: na main a recusa tem
 * prioridade sobre o aceite (`contract-capture.ts:87`), mas "não aceito o prazo de 80
 * meses" fala da carta, não do uso do dado — e travaria toda negociação de prazo de um
 * cliente que já autorizou. A fronteira é o OBJETO da negação, não a oração: recusar
 * prazo/parcela/carta não revoga; negar o uso do dado revoga, mesmo ao lado da recusa.
 *
 * E o verbo vale só na PRIMEIRA PESSOA do presente, a forma de quem declara: o
 * infinitivo é dúvida ("posso revogar isso depois?") e o subjuntivo é hipótese ("se eu
 * não autorizar a consulta, o que acontece?"). Hipótese não revoga.
 */
const REVOGA_OS_DADOS: readonly RegExp[] = [
	// "revogo a autorização", "revogamos o consentimento"
	/\brevogo\b|\brevogamos\b/i,
	// "não autorizo", "não autorizei", "não autorizamos"
	/\bn[ãa]o\s+(?:autorizo|autorizei|autorizamos)\b/i,
	/\bn[ãa]o\s+permito\b/i,
	/\bn[ãa]o\s+concordo\s+com\s+(?:o|a)\s+(?:uso|consulta|compartilhamento)\b/i,
	// "não pode usar meu CPF", "não podem consultar", "não podes guardar"
	/\bn[ãa]o\s+(?:pode|podem|podes)\s+(?:mais\s+)?(?:usar|usem|consultar|consultem|guardar|guardem|compartilhar|compartilhem)\b/i,
	// "não quero mais que vocês consultem", "não quero guardar meus dados"
	/\bn[ãa]o\s+quero\s+(?:mais\s+)?(?:que\s+(?:voc[êe]s\s+)?)?(?:usem|usar|consultem|consultar|guardem|guardar|compartilhem|compartilhar)\b/i,
	// "não vou autorizar", "não vou mais permitir"
	/\bn[ãa]o\s+(?:vou|vamos)\s+(?:mais\s+)?(?:autorizar|permitir|deixar)\b/i,
	// "não aceito que consultem", "não aceito a consulta do meu CPF"
	/\bn[ãa]o\s+aceito\s+(?:que\s+|a\s+|o\s+|as\s+|os\s+)?(?:consult\w+|us\w+|guard\w+|compartilh\w+|autoriza\w+)\b/i,
];

/** O cliente revogou o consentimento que já tinha dado? Basta UMA declaração. */
function revogaConsentimento(texto: string): boolean {
	return REVOGA_OS_DADOS.some((re) => re.test(texto));
}

/**
 * O cliente REVOGOU o uso dos dados dele — a única coisa que ainda barra a proposta.
 *
 * A revogação atravessa a pergunta ("não autorizo, podemos seguir sem isso?"), e o OBJETO da
 * negação é que decide: recusar prazo, parcela ou carta não revoga; negar o uso do dado revoga.
 * O verbo vale só na primeira pessoa do presente — o infinitivo é dúvida ("posso revogar isso
 * depois?") e o subjuntivo é hipótese ("se eu não autorizar, o que acontece?").
 */
export function revogouOsDados(falas: readonly FalaDeLgpd[]): { fala: string } | null {
	for (const fala of falas) {
		if (fala.role !== "user") continue;
		if (revogaConsentimento(fala.content)) return { fala: fala.content };
	}
	return null;
}

export type FalaDeLgpd = { role: "user" | "assistant"; content: string };
