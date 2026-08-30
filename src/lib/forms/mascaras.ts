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
 * ⚠️ Isto é APRESENTAÇÃO. O corte em 11 dígitos descarta o DDI de um
 * `+55 11 99999-9999`, e quem grava o telefone não pode depender disso — a
 * normalização de verdade (E.164, 10 vs 11) é do servidor.
 */
export const mascararCelular = (valor: string): string => {
	const d = somenteDigitos(valor).slice(0, 11);
	if (d.length <= 2) return d;

	const ddd = d.slice(0, 2);
	const numero = d.slice(2);
	// 9 dígitos = celular (o 9 na frente); até 8 = fixo. O corte segue o NÚMERO,
	// não o total, senão o DDD entraria na conta.
	const corte = numero.length > 8 ? 5 : 4;
	if (numero.length <= corte) return `(${ddd}) ${numero}`;
	return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
};
