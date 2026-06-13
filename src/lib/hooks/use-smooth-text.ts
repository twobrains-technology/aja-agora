"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Smooths streaming text by revealing characters at a fixed rate via RAF.
 * Backend chunks (10-30 chars) get evened out into a continuous typing feel
 * matching ChatGPT/Claude.ai. On non-additive text changes (regenerate,
 * shrink), it snaps to the new value.
 */
export function useSmoothText(text: string, charsPerSecond = 60): string {
	const [displayed, setDisplayed] = useState<string>(text);
	const displayedRef = useRef<string>(text);

	useEffect(() => {
		if (text === displayedRef.current) return;

		if (!text.startsWith(displayedRef.current)) {
			setDisplayed(text);
			displayedRef.current = text;
			return;
		}

		let raf = 0;
		let startTime: number | null = null;
		const startLen = displayedRef.current.length;
		const targetLen = text.length;

		const tick = (now: number) => {
			if (startTime === null) startTime = now;
			const elapsed = (now - startTime) / 1000;
			const newLen = Math.min(targetLen, startLen + Math.floor(elapsed * charsPerSecond));
			const next = text.slice(0, newLen);
			displayedRef.current = next;
			setDisplayed(next);
			if (newLen < targetLen) raf = requestAnimationFrame(tick);
		};

		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [text, charsPerSecond]);

	return displayed;
}
