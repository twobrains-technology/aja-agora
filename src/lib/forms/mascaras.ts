// src/lib/forms/mascaras.ts
//
// As máscaras de CPF e celular dos formulários do funil — CPF+celular+LGPD no
// `identify` e no `contract`.
//
// Existiam DUAS cópias idênticas, uma em `gate-identity-form.tsx` e outra em
// `contract-form.tsx`. Cópia de máscara é o tipo de duplicação que não dá
// sintoma: as duas funcionam, ninguém percebe, e um dia alguém conserta um
// caso de borda numa e não na outra — e aí o mesmo CPF é aceito num passo do
// funil e recusado no seguinte. Fonte única, e o teste vive ao lado.
//
// Módulo PURO e client-safe de propósito: os dois consumidores são componentes
// `"use client"`, então nada aqui pode arrastar banco, `crypto` de servidor ou
// validação que dependa de env.
//
// ── Por que mascarar durante a digitação (item C6 da planilha) ──────────────
//
// Digitar 11 dígitos no celular é o atrito mais bobo do funil, e ele acontece
// no ponto mais caro: logo antes da busca real. `inputMode="numeric"` abre o
// teclado certo; a máscara devolve o formato que a pessoa reconhece enquanto
// ela digita, sem esperar o blur para dizer que ficou errado.

/** Só os algarismos. É a normalização que faz TODA máscara abaixo funcionar
 *  igual para texto digitado, colado ou já formatado. */
export const somenteDigitos = (valor: string): string => valor.replace(/\D/g, "");

/**
 * Reduz uma sequência de dígitos ao par DDD + número, descartando o que sobra
 * PELA FRENTE — nunca pelo fim.
 *
 * **O defeito que isto conserta (30/08/2026).** A máscara cortava em
 * `slice(0, 11)`, e o corte pela esquerda transforma telefone certo em telefone
 * errado e plausível:
 *
 *   "+55 11 99999-9999"  →  (55) 11999-9999   ← 55 é DDD do RS; o número perdeu
 *                                                os dois últimos dígitos
 *   "011 99999-9999"     →  (01) 19999-9999
 *
 * Colar o telefone com `+55` é exatamente o que o WhatsApp copia, e o formulário
 * aceita o resultado (11 dígitos, bem-formados). O servidor recebe um número
 * válido que não existe, e a mesa liga para ele. Um dígito a menos no fim é um
 * erro que ninguém percebe até a venda não acontecer.
 *
 * Duas regras, nesta ordem, e as duas são de FORMA — não adivinham nada:
 *  1. `55` na frente de 12 ou 13 dígitos é DDI do Brasil (o país não tem DDD
 *     com 12+ dígitos depois dele);
 *  2. `0` na frente é prefixo de discagem interurbana. **DDD brasileiro nunca
 *     começa com zero** (a numeração vai de 11 a 99), então o zero à frente
 *     nunca pertence ao número — não importa o comprimento.
 */
function normalizarParaDddENumero(digitos: string): string {
	let d = digitos;
	if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
	// `> 2` e não `> 11`: quem cola "011 3333-4444" tem exatos 11 dígitos, e
	// cortar pelo fim ali produziria `(01) 13333-444`. O piso existe só para
	// quem está DIGITANDO — o "0" sozinho aparece na tela até virar DDD.
	while (d.length > 2 && d.startsWith("0")) d = d.slice(1);
	// O que ainda sobrar é digitação a mais — aí sim o corte é pelo fim, porque
	// não há regra de forma que diga qual dígito é o intruso.
	return d.slice(0, 11);
}

/**
 * `000.000.000-00`.
 *
 * O caminho é sempre "reduzir a dígitos → remontar", e nunca "inserir o
 * separador na posição N". Essa escolha é o que faz o caso que costuma quebrar
 * máscara artesanal passar de graça: **colar um CPF que JÁ vem formatado**.
 * Uma máscara posicional receberia `123.456.789-01`, contaria os pontos como
 * caracteres e produziria `123.456.789-01` truncado ou `123.45.678.9-01`.
 * Aqui os separadores são descartados antes de qualquer coisa.
 *
 * O `slice(0, 11)` também protege a colagem com sujeira ("CPF: 123.456.789-01
 * ") e o teclado que repete dígito.
 */
export const mascararCpf = (valor: string): string =>
	somenteDigitos(valor)
		.slice(0, 11)
		.replace(/(\d{3})(\d)/, "$1.$2")
		.replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
		.replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");

/**
 * `(00) 00000-0000` para celular, `(00) 0000-0000` para fixo.
 *
 * **A correção de 30/08/2026.** A versão anterior punha o hífen sempre depois
 * do 5º dígito do número, o que está certo para os 11 dígitos do celular e
 * errado para os 10 do fixo: um `(11) 3333-4444` legítimo aparecia na tela como
 * `(11) 33334-444`. E o campo aceita 10 dígitos — `gate-identity-form.tsx`
 * valida `phoneDigits.length >= 10` —, então não era um caso impossível: era um
 * número de telefone brasileiro comum exibido errado no formulário que pede o
 * dado mais sensível do funil. Achado escrevendo o teste do item C6.
 *
 * O hífen "pula" quando a pessoa digita o 11º dígito (`(11) 9999-9999` vira
 * `(11) 99999-9999`). Isso é o comportamento esperado de máscara de telefone no
 * Brasil, e não um efeito colateral: até o 11º dígito não há como saber se o
 * número é fixo ou celular.
 *
 * Mesma regra de colagem do CPF: reduz a dígitos antes de remontar, então
 * `(11) 99999-9999` colado volta idêntico.
 *
 * ⚠️ Isto é APRESENTAÇÃO — mas apresentação que descarta dígito produz telefone
 * ERRADO e plausível, e por isso o corte não pode ser cego. Ver
 * `normalizarParaDddENumero` logo abaixo.
 */
export const mascararCelular = (valor: string): string => {
	const d = normalizarParaDddENumero(somenteDigitos(valor));
	if (d.length <= 2) return d;

	const ddd = d.slice(0, 2);
	const numero = d.slice(2);
	// 9 dígitos = celular (o 9 na frente); até 8 = fixo. O corte segue o NÚMERO,
	// não o total, senão o DDD entraria na conta.
	const corte = numero.length > 8 ? 5 : 4;
	if (numero.length <= corte) return `(${ddd}) ${numero}`;
	return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
};
