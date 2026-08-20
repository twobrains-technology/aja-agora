"use client";

import { useEffect, useState } from "react";

import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

/**
 * As perguntas que o campo do hero "digita" sozinho.
 *
 * São EXEMPLOS de fala, não oferta: o valor aqui não vem de tool nem promete
 * nada — é o mesmo papel do placeholder fixo que existia antes ("Quero um carro
 * até R$ 80 Mil..."), só que mostrando as três categorias em vez de uma. O que
 * a regra do projeto proíbe é o AGENTE citar número de cabeça; texto de campo
 * vazio numa landing não fala em nome dele.
 *
 * Três, e nas três categorias, porque é isso que a marcação pedia: induzir a
 * pessoa a entender que dá pra pedir por valor do bem OU por parcela.
 */
export const PERGUNTAS_DO_CAMPO = [
	"Quero um carro até R$ 80 mil...",
	"Quero uma casa de até R$ 300 mil...",
	"Quero uma moto de até R$ 500 por parcela...",
] as const;

/** Ritmo da máquina de escrever, em ms. */
const RITMO = {
	/** Tecla a tecla. Mais lento que gente de verdade, de propósito: é pra ser lido. */
	digita: 55,
	/** Frase inteira parada na tela, tempo de ler. */
	segura: 1600,
	/** Apagar é sempre mais rápido que escrever — senão a espera fica maior que a leitura. */
	apaga: 30,
	/** Respiro entre apagar tudo e começar a próxima. */
	troca: 320,
} as const;

type Fase = "digitando" | "segurando" | "apagando";

interface Opcoes {
	/** O que já está escrito no campo. Não-vazio congela a animação. */
	valor: string;
	/** O campo está com foco. Congela também — animação não disputa cursor com ninguém. */
	focado: boolean;
	/** Frases a girar. Injetável pro teste não depender da constante. */
	frases?: readonly string[];
}

/**
 * Placeholder que se escreve sozinho, alternando entre as perguntas.
 *
 * Vale nas duas larguras. Nasceu só no mobile (pedido de 2026-08-20) e perdeu o
 * gate de largura quando o desktop foi alinhado ao mesmo desenho: um campo que
 * convida no celular e fica parado no monitor eram dois produtos diferentes na
 * mesma tela.
 *
 * Com `prefers-reduced-motion` devolve a primeira frase parada e **não agenda
 * timer nenhum** — animação infinita que ninguém pediu é bateria queimada à toa.
 *
 * **Congela com campo preenchido ou focado.** Um placeholder que continua
 * dançando enquanto a pessoa digita é ruído em cima da própria escrita dela — e
 * o placeholder nem aparece nessa hora, então o timer só existiria pra gastar
 * render. Ao congelar volta pra frase 1 inteira, que é o estado legível.
 */
export function usePlaceholderDigitando({ valor, focado, frases = PERGUNTAS_DO_CAMPO }: Opcoes) {
	const reduzido = useReducedMotion();

	// Começa com a frase 1 INTEIRA, em "segurando", e não vazia em "digitando".
	//
	// Não é detalhe de estilo: `useReducedMotion` só sabe da preferência DEPOIS do
	// primeiro efeito, então o primeiro render é sempre o congelado (frase 1
	// inteira). Se a animação começasse do zero, a página mostraria a frase
	// completa, piscaria pra vazio e só então digitaria — um flash a cada carga.
	// Começando cheia, o estado animado do instante 0 é IDÊNTICO ao congelado, e a
	// primeira coisa que se vê é a frase apagando, que é o começo natural do ciclo.
	const [indice, setIndice] = useState(0);
	const [letras, setLetras] = useState(() => (frases[0] ?? "").length);
	const [fase, setFase] = useState<Fase>("segurando");

	const parado = reduzido || valor !== "" || focado;
	const inicial = frases[0] ?? "";
	const frase = frases[indice] ?? inicial;

	// Congelou → volta pro começo. Retomar no meio de uma palavra da frase 3
	// depois que a pessoa apagou o que escreveu parece defeito de render.
	// `setState` com o mesmo valor não re-renderiza, então isto não gira em loop.
	useEffect(() => {
		if (!parado) return;
		setIndice(0);
		setLetras(inicial.length);
		setFase("segurando");
	}, [parado, inicial]);

	useEffect(() => {
		if (parado) return;

		const proximo = () => {
			if (fase === "digitando") {
				if (letras < frase.length) {
					setLetras((n) => n + 1);
					return;
				}
				setFase("segurando");
				return;
			}
			if (fase === "segurando") {
				setFase("apagando");
				return;
			}
			if (letras > 0) {
				setLetras((n) => n - 1);
				return;
			}
			setIndice((i) => (i + 1) % frases.length);
			setFase("digitando");
		};

		const espera =
			fase === "segurando"
				? RITMO.segura
				: fase === "apagando"
					? letras > 0
						? RITMO.apaga
						: RITMO.troca
					: RITMO.digita;

		const id = setTimeout(proximo, espera);
		return () => clearTimeout(id);
	}, [parado, fase, letras, frase, frases.length]);

	// Congelado (motion reduzido, campo em uso) → frase 1 inteira.
	if (parado) return inicial;

	return frase.slice(0, letras);
}
