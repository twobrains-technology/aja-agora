import type { DestaqueLegal, HeroLegal, SecaoLegal } from "@/components/legal/documento-legal";

// Texto da Política de Privacidade (Figma 'politica-de-privacidade' 625:4545).
//
// Documento jurídico: o texto sai do comp palavra por palavra, e é de propósito
// que ele more num arquivo de dado separado da página. Quem revisa uma política
// é o jurídico, não quem mexe em layout — e nenhuma das duas partes precisa
// abrir a outra para trabalhar.
//
// A divergência do e-mail do DPO foi levada ao operador e resolvida por decisão
// dele (2026-08-11): o comp dizia `dpo@ajaagora.com.br`, e o canal correto é no
// domínio do site, `dpo@ajaagora.com.br`. Canal de encarregado que não recebe
// mensagem é descumprimento do art. 41 da LGPD, então a caixa precisa existir.

export type SecaoPolitica = SecaoLegal;

export const HERO_POLITICA: HeroLegal = {
	eyebrow: "TRANSPARÊNCIA E SEGURANÇA",
	titulo: "Política de Privacidade",
	texto:
		"A AJA se compromete com a segurança e o respeito total à privacidade dos seus dados pessoais. Saiba exatamente como tratamos suas informações.",
};

export const ATUALIZADO_EM = "11 de agosto de 2026";

/** Card de destaque logo abaixo do hero — o resumo em uma frase. */
export const DESTAQUE_LGPD: DestaqueLegal = {
	icone: "🛡️",
	titulo: "Em total conformidade com a LGPD",
	texto:
		"Não vendemos seus dados cadastrais. Suas simulações e dados de contato são utilizados de forma exclusivamente imparcial para que você encontre o consórcio mais inteligente e planejado.",
};

export const SECOES_POLITICA: SecaoLegal[] = [
	{
		titulo: "1. Introdução e Compromisso",
		paragrafos: [
			"A AJA Consórcios, operada por Labre Assessoria e Consultoria Empresarial LTDA, inscrita no CNPJ sob o nº 64.975.074/0001-26, valoriza a privacidade e a segurança dos dados de seus clientes, parceiros e visitantes. Esta Política de Privacidade explica de forma transparente como coletamos, tratamos, armazenamos e protegemos suas informações pessoais ao utilizar nossa plataforma de simulação e assessoria de consórcios independentes. Nosso compromisso é garantir a conformidade integral com a Lei Geral de Proteção de Dados (LGPD) do Brasil, respeitando as melhores práticas do setor financeiro.",
		],
	},
	{
		titulo: "2. Quais Dados Coletamos",
		paragrafos: [
			"Para oferecer um serviço altamente personalizado de comparação de administradoras, coletamos os seguintes tipos de informações:",
		],
		itens: [
			"Dados Pessoais de Identificação: Nome completo, CPF, e-mail, telefone de contato e cidade de residência informados em simulações.",
			"Dados de Uso e Navegação: Histórico de simulações realizadas, preferências de tipos de consórcio (imóvel, carro, moto), páginas visualizadas e tempo de permanência na plataforma.",
			"Dados de Conectividade (Cookies): Endereço IP, dados de geolocalização aproximada, informações sobre o dispositivo móvel ou desktop e dados de comportamento gerados por ferramentas analíticas para otimizar nossa experiência.",
		],
	},
	{
		titulo: "3. Como Utilizamos Seus Dados",
		paragrafos: [
			"Seus dados de simulação e contato são utilizados estritamente para os seguintes propósitos:",
		],
		itens: [
			"Fornecer a simulação ideal de parcelas, lances médios e melhores prazos entre as diversas administradoras autorizadas pelo Banco Central.",
			"Prestar consultoria independente, permitindo que nossos consultores entrem em contato direto para esclarecer dúvidas e apresentar as alternativas mais vantajosas ao seu orçamento.",
			"Aperfeiçoar nossa plataforma digital por meio de análises estatísticas de uso.",
			"Garantir a conformidade legal e a segurança transacional em todas as interações com nossos serviços.",
		],
	},
	{
		titulo: "4. Compartilhamento e Proteção de Dados",
		paragrafos: [
			"A AJA Consórcios atua como uma consultoria independente e imparcial. Nós não vendemos ou comercializamos sua base de dados sob nenhuma hipótese. O compartilhamento de suas informações ocorre unicamente com administradoras de consórcio credenciadas pelo Banco Central do Brasil e devidamente selecionadas por você como a melhor opção, sempre mediante sua expressa autorização no processo de fechamento de sua cota. Adotamos rígidos padrões de segurança digital, criptografia SSL e servidores seguros para impedir acessos não autorizados.",
		],
	},
	{
		titulo: "5. Seus Direitos (LGPD)",
		paragrafos: [
			"Conforme a legislação brasileira de proteção de dados, você possui total controle sobre seus dados e pode exercer os seguintes direitos a qualquer momento:",
		],
		itens: [
			"Confirmação e Acesso: Solicitar uma cópia de todos os dados pessoais que mantemos em nosso sistema.",
			"Correção e Atualização: Retificar informações incorretas, desatualizadas ou incompletas.",
			"Eliminação e Revogação: Requerer a exclusão definitiva de seus dados cadastrais de nossa plataforma de simulação, bem como retirar consentimentos previamente concedidos.",
			"Portabilidade: Solicitar a transferência dos seus dados cadastrais para outra entidade de forma estruturada.",
		],
	},
	{
		titulo: "6. Retenção de Dados e Política de Cookies",
		paragrafos: [
			"Conservamos seus dados pessoais apenas pelo tempo estritamente necessário para cumprir com as finalidades de simulação descritas e para atender a obrigações legais de auditoria ou regulatórias. Cookies de navegação podem ser gerenciados diretamente nas configurações do seu navegador para serem bloqueados ou limpos conforme sua preferência, embora isso possa afetar o desempenho de simulações rápidas em nossa ferramenta.",
		],
	},
	{
		titulo: "7. Contato do Encarregado de Proteção de Dados (DPO)",
		paragrafos: [
			'Para esclarecer qualquer dúvida sobre nossa política, exercer seus direitos assegurados pela LGPD ou contatar nosso Encarregado pelo Tratamento de Dados Pessoais (DPO), envie um e-mail formal para dpo@ajaagora.com.br com o assunto "LGPD - Solicitação". Estamos à disposição para garantir que sua jornada de consórcios ocorra com máxima segurança, transparência e respeito à sua privacidade.',
		],
	},
];
