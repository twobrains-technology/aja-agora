import type { DestaqueLegal, HeroLegal, SecaoLegal } from "@/components/legal/documento-legal";

// Texto dos Termos de Uso.
//
// Não veio do Figma: o comp não previu esta página, mas o rodapé linkava para
// ela em todo o site e as letras miúdas já afirmavam que o visitante concorda
// com "nossos termos de uso" — o link caía no 404.
//
// Redigido a partir do que a plataforma REALMENTE faz, não de um modelo
// genérico: a AJA intermedeia e não administra, o número da simulação vem da
// administradora, quem atende é um assistente virtual e a remuneração sai da
// comissão — cada um desses é um ponto que gera reclamação quando fica
// implícito. Os dados de qualificação são os mesmos do rodapé e da Política de
// Privacidade.
//
// PENDENTE-KAIRO: texto escrito para valer, mas ainda não revisado pelo
// jurídico. A revisão foi combinada para depois da publicação.

export const HERO_TERMOS: HeroLegal = {
	eyebrow: "REGRAS DE USO DA PLATAFORMA",
	titulo: "Termos de Uso",
	texto:
		"As condições que regem o uso do site e dos serviços de assessoria da AJA. Ao navegar, simular ou conversar com a gente, você concorda com o que está escrito aqui.",
};

export const ATUALIZADO_EM = "11 de agosto de 2026";

export const DESTAQUE_TERMOS: DestaqueLegal = {
	icone: "🤝",
	titulo: "A AJA assessora, quem administra é a administradora",
	texto:
		"Não somos administradora de consórcio nem instituição financeira. Comparamos as opções das administradoras autorizadas pelo Banco Central, e o contrato de consórcio é sempre celebrado entre você e a administradora escolhida.",
};

export const SECOES_TERMOS: SecaoLegal[] = [
	{
		titulo: "1. Quem somos e o que estes Termos regulam",
		paragrafos: [
			"A AJA é o nome comercial de Labre Assessoria e Consultoria Empresarial Ltda, inscrita no CNPJ sob o nº 64.975.074/0001-26, com sede na Avenida Paulista, 1471, conj. 511 — Bela Vista, São Paulo/SP, CEP 01311-927.",
			"Estes Termos de Uso regulam o acesso e a utilização do site ajaagora.com.br, das nossas simulações de consórcio e do atendimento prestado pelos nossos canais digitais, incluindo o chat do site e o WhatsApp. Ao utilizar qualquer um desses serviços, você declara que leu, compreendeu e concorda integralmente com as condições abaixo. Se não concordar com algum ponto, pedimos que não utilize a plataforma.",
		],
	},
	{
		titulo: "2. O que a AJA faz — e o que não faz",
		paragrafos: [
			"A AJA atua como assessoria independente de consórcios. Reunimos as condições de administradoras devidamente autorizadas a funcionar pelo Banco Central do Brasil, comparamos as alternativas disponíveis e apresentamos aquelas que melhor se encaixam no seu objetivo e no seu orçamento.",
			"Para deixar claro o limite da nossa atuação:",
		],
		itens: [
			"Não somos administradora de consórcio. Não constituímos grupos, não realizamos assembleias, não efetuamos sorteios e não custodiamos recursos dos consorciados.",
			"Não somos instituição financeira e não concedemos crédito, empréstimo ou financiamento.",
			"O contrato de adesão ao grupo de consórcio é celebrado diretamente entre você e a administradora escolhida, regido pela Lei nº 11.795/2008 e pelas normas do Banco Central do Brasil.",
			"A administração do grupo, a cobrança das parcelas, a realização das assembleias, a contemplação e a entrega da carta de crédito são responsabilidade exclusiva da administradora contratada.",
		],
	},
	{
		titulo: "3. Simulações são estimativas, não proposta firme",
		paragrafos: [
			"Os valores de crédito, parcela, taxa de administração, fundo de reserva, seguro, prazo e lance apresentados nas simulações são obtidos junto às administradoras e refletem as condições vigentes no momento da consulta. Eles têm caráter informativo e podem ser alterados pela administradora até a assinatura do contrato, conforme a disponibilidade de cotas e as regras de cada grupo.",
			"A simulação não constitui proposta vinculante, não reserva cota e não garante a aceitação do seu cadastro pela administradora, que mantém o direito de realizar suas próprias análises antes da contratação. As condições que valem, em definitivo, são as do contrato de adesão e do regulamento do grupo assinados por você.",
		],
	},
	{
		titulo: "4. Contemplação: como funciona e o que não prometemos",
		paragrafos: [
			"No consórcio, a contemplação ocorre por sorteio ou por lance, nas assembleias do grupo, conforme o regulamento da administradora. Estimativas de prazo, comparações entre grupos e simulações de lance servem para ajudar você a decidir com mais informação.",
			"Nenhuma dessas estimativas constitui garantia. A AJA não promete data, prazo máximo ou certeza de contemplação, e nenhum colaborador, parceiro ou assistente virtual nosso está autorizado a fazê-lo. Quem depende de receber o bem em data certa deve considerar que o consórcio é uma modalidade de compra programada, e não de aquisição imediata.",
		],
	},
	{
		titulo: "5. Atendimento por assistente virtual",
		paragrafos: [
			"O atendimento no chat do site e no WhatsApp é conduzido por um assistente virtual baseado em inteligência artificial, com supervisão e possibilidade de assumir a conversa por parte da nossa equipe humana a qualquer momento.",
			"As conversas são registradas e armazenadas para fins de atendimento, melhoria do serviço, treinamento da equipe e comprovação do que foi tratado, na forma da nossa Política de Privacidade. Embora trabalhemos para que as informações prestadas sejam corretas e ancoradas nos dados das administradoras, eventuais divergências entre o que foi dito no atendimento e o que consta do contrato de adesão são resolvidas sempre pelo contrato.",
		],
	},
	{
		titulo: "6. Cadastro e veracidade das informações",
		paragrafos: [
			"Para simular e contratar, solicitamos dados como nome, CPF, telefone, e-mail e cidade. Você é responsável pela veracidade e pela atualização das informações que fornece, e concorda em não utilizar dados de terceiros sem autorização.",
			"Informações incorretas ou incompletas podem inviabilizar a simulação, atrasar a análise da administradora ou levar à recusa da proposta. Reservamo-nos o direito de recusar ou encerrar atendimentos quando houver indício de fraude, de uso indevido de dados alheios ou de tentativa de burlar as regras das administradoras.",
		],
	},
	{
		titulo: "7. Gratuidade para você e como somos remunerados",
		paragrafos: [
			"A assessoria da AJA não tem custo para você: não cobramos taxa de consulta, de simulação, de análise ou de intermediação do consorciado. Somos remunerados por comissão paga pelas administradoras parceiras sobre os contratos efetivamente celebrados.",
			"Nunca solicitamos depósito, transferência, PIX ou pagamento de qualquer espécie em conta de pessoa física ou em nome da AJA a título de reserva de cota, antecipação de lance ou liberação de crédito. Os pagamentos do consórcio são feitos exclusivamente nos meios oficiais indicados pela administradora contratada, em nome dela. Desconfie de qualquer cobrança fora disso e fale com a gente pelos canais oficiais.",
		],
	},
	{
		titulo: "8. Direito de arrependimento e cancelamento",
		paragrafos: [
			"Nas contratações realizadas fora do estabelecimento comercial, por meio digital ou telefônico, você pode exercer o direito de arrependimento no prazo de 7 (sete) dias corridos, contados da assinatura do contrato ou do recebimento do bem, nos termos do artigo 49 do Código de Defesa do Consumidor.",
			"Após esse prazo, a desistência do grupo e a devolução de valores seguem as regras do contrato de adesão, do regulamento do grupo e da Lei nº 11.795/2008, aplicadas pela administradora. Podemos orientar você sobre o procedimento, mas a execução cabe à administradora contratada.",
		],
	},
	{
		titulo: "9. Uso permitido da plataforma",
		paragrafos: ["Ao utilizar o site e os nossos canais, você concorda em não:"],
		itens: [
			"Utilizar a plataforma para finalidade ilícita, fraudulenta ou que viole direitos de terceiros.",
			"Coletar dados do site por meio de robôs, raspagem automatizada ou qualquer processo de extração em massa.",
			"Tentar obter acesso não autorizado a áreas restritas, contas de outros usuários ou à nossa infraestrutura.",
			"Reproduzir, distribuir ou explorar comercialmente o conteúdo, a marca ou o material da AJA sem autorização por escrito.",
			"Interferir no funcionamento do serviço, sobrecarregar a infraestrutura ou introduzir código malicioso.",
		],
	},
	{
		titulo: "10. Propriedade intelectual",
		paragrafos: [
			"A marca AJA, o site, os textos, as imagens, os elementos visuais, o software e a organização do conteúdo são de titularidade da AJA ou de seus licenciadores, protegidos pela legislação de propriedade intelectual. O acesso à plataforma não transfere qualquer direito sobre esses elementos, e o uso da marca depende de autorização prévia e por escrito.",
		],
	},
	{
		titulo: "11. Limitação de responsabilidade",
		paragrafos: [
			"Empenhamo-nos para manter a plataforma disponível, correta e atualizada, mas o serviço é prestado sem garantia de funcionamento ininterrupto: manutenções, falhas de conexão, indisponibilidade de sistemas das administradoras e eventos fora do nosso controle podem afetar o acesso.",
			"A AJA não responde pelo cumprimento das obrigações assumidas pela administradora contratada, pelo resultado das assembleias, pelo prazo de contemplação, pela análise de crédito realizada por terceiros nem pelo estado ou pela entrega do bem adquirido com a carta de crédito. Nada nesta cláusula afasta os direitos que o Código de Defesa do Consumidor assegura a você.",
		],
	},
	{
		titulo: "12. Proteção de dados pessoais",
		paragrafos: [
			"O tratamento dos seus dados pessoais está descrito na nossa Política de Privacidade, que integra estes Termos e explica quais dados coletamos, com que finalidade, com quem compartilhamos e como exercer os direitos assegurados pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018).",
		],
	},
	{
		titulo: "13. Alterações destes Termos",
		paragrafos: [
			"Podemos atualizar estes Termos para refletir mudanças no serviço, na legislação ou nas condições das administradoras parceiras. A versão vigente é sempre a publicada nesta página, com a data de atualização indicada no topo. Alterações relevantes serão comunicadas pelos nossos canais, e o uso da plataforma após a publicação implica concordância com o texto atualizado.",
		],
	},
	{
		titulo: "14. Contato, legislação aplicável e foro",
		paragrafos: [
			"Para dúvidas, reclamações ou solicitações relacionadas a estes Termos, fale com a gente pelo e-mail contato@ajaagora.com.br ou pelo telefone +55 (11) 95502-0229.",
			"Estes Termos são regidos pelas leis brasileiras, em especial pelo Código de Defesa do Consumidor, pela Lei nº 11.795/2008, pelo Marco Civil da Internet e pela Lei Geral de Proteção de Dados. Fica eleito o foro do domicílio do consumidor para dirimir eventuais controvérsias.",
		],
	},
];
