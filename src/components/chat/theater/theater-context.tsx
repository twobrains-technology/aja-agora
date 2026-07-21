"use client";

import {
	createContext,
	type ReactNode,
	type RefObject,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";

/** De onde a semente veio. `"digitada"` é fala REAL do cliente (o que ele
 * escreveu no composer); `"chip"` é uma frase de ENTRADA que o próprio produto
 * escreveu pelo botão clicado ("Quero comprar um carro."). A diferença importa
 * na retomada: reenviar a frase de entrada numa conversa que já estava no meio
 * do funil faz o cliente parecer que recomeçou do zero — quem volta diz
 * "Voltei", não "Quero comprar um carro." de novo. */
export type SeedOrigin = "digitada" | "chip";

/** Abre o teatro com uma mensagem-semente (vazia = saudação) morfando do elemento clicado. */
export type TheaterOpener = (
	seed: string,
	originEl: HTMLElement | null,
	origin?: SeedOrigin,
) => void;

type TheaterContextValue = {
	isOpen: boolean;
	seed: string;
	seedOrigin: SeedOrigin;
	/** Elemento de origem do morph — usado pro FLIP de entrada/saída e pra restaurar o foco. */
	originRef: RefObject<HTMLElement | null>;
	openTheater: TheaterOpener;
	closeTheater: () => void;
};

const TheaterContext = createContext<TheaterContextValue | null>(null);

/**
 * Estado de abertura do "Modo Teatro" — o painel de chat maximizado que morfa
 * a partir do composer/chip/CTA clicado (ver handoff_chat_teatro). Mantém só o
 * estado de abertura; a casca/morph vive em <ChatTheater/> e o chat real em
 * <TheaterChat/>.
 */
export function TheaterProvider({ children }: { children: ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);
	const [seed, setSeed] = useState("");
	const [seedOrigin, setSeedOrigin] = useState<SeedOrigin>("digitada");
	const originRef = useRef<HTMLElement | null>(null);
	// Guard síncrono contra dupla-abertura no mesmo tick (closure de isOpen seria stale).
	const openRef = useRef(false);

	const openTheater = useCallback<TheaterOpener>((nextSeed, originEl, origin = "digitada") => {
		if (openRef.current) return;
		openRef.current = true;
		originRef.current = originEl;
		setSeed(nextSeed);
		setSeedOrigin(origin);
		setIsOpen(true);
	}, []);

	const closeTheater = useCallback(() => {
		openRef.current = false;
		setIsOpen(false);
	}, []);

	const value = useMemo<TheaterContextValue>(
		() => ({ isOpen, seed, seedOrigin, originRef, openTheater, closeTheater }),
		[isOpen, seed, seedOrigin, openTheater, closeTheater],
	);

	return <TheaterContext.Provider value={value}>{children}</TheaterContext.Provider>;
}

export function useTheater(): TheaterContextValue {
	const ctx = useContext(TheaterContext);
	if (!ctx) {
		throw new Error("useTheater must be used within TheaterProvider");
	}
	return ctx;
}
