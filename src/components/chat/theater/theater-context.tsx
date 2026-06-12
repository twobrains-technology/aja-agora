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

/** Abre o teatro com uma mensagem-semente (vazia = saudação) morfando do elemento clicado. */
export type TheaterOpener = (seed: string, originEl: HTMLElement | null) => void;

type TheaterContextValue = {
	isOpen: boolean;
	seed: string;
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
	const originRef = useRef<HTMLElement | null>(null);
	// Guard síncrono contra dupla-abertura no mesmo tick (closure de isOpen seria stale).
	const openRef = useRef(false);

	const openTheater = useCallback<TheaterOpener>((nextSeed, originEl) => {
		if (openRef.current) return;
		openRef.current = true;
		originRef.current = originEl;
		setSeed(nextSeed);
		setIsOpen(true);
	}, []);

	const closeTheater = useCallback(() => {
		openRef.current = false;
		setIsOpen(false);
	}, []);

	const value = useMemo<TheaterContextValue>(
		() => ({ isOpen, seed, originRef, openTheater, closeTheater }),
		[isOpen, seed, openTheater, closeTheater],
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
