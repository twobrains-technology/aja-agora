"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { type ItemDeMenu, NAV, NAV_VERTICAL } from "@/components/kv/navegacao";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";

// Menu (Figma: frame 'Header / Desktop' navy #052440, altura 96, logo em x=64).
// Os itens vêm de `navegacao.ts` — a mesma fonte que o rodapé consome.
export { NAV_VERTICAL };

const LINK_CLASS = "text-[16px] font-normal leading-[30px] text-white transition-colors";

/**
 * O item de menu que desdobra.
 *
 * Não usa o `NavigationMenu` de `components/ui`: aquele primitivo monta o painel
 * num Portal com posicionador e viewport animado, todo pintado com os tokens
 * claros do shadcn (`bg-popover`, `hover:bg-muted`). Para três links dentro de
 * uma barra navy é maquinaria demais, e o painel sairia com a paleta errada.
 * A camada KV já tem esse precedente — `KvCtaButton` existe pelo mesmo motivo,
 * em vez do `ui/button`.
 *
 * O que o primitivo daria de graça e aqui é feito à mão: `aria-expanded`,
 * `aria-controls`, Escape fechando com o foco de volta no gatilho, e clique
 * fora fechando.
 */
function ItemComSubmenu({
	item,
}: {
	item: ItemDeMenu & { submenu: NonNullable<ItemDeMenu["submenu"]> };
}) {
	const [aberto, setAberto] = useState(false);
	const painelId = useId();
	const wrapperRef = useRef<HTMLDivElement>(null);
	const gatilhoRef = useRef<HTMLButtonElement>(null);

	// Clique fora fecha. Sem isto o painel fica preso aberto quando a pessoa
	// desiste e clica em qualquer outro lugar da página.
	useEffect(() => {
		if (!aberto) return;
		function aoClicarFora(evento: MouseEvent) {
			if (!wrapperRef.current?.contains(evento.target as Node)) setAberto(false);
		}
		document.addEventListener("mousedown", aoClicarFora);
		return () => document.removeEventListener("mousedown", aoClicarFora);
	}, [aberto]);

	return (
		// O hover abre porque é o que se espera de uma barra de navegação; o
		// clique também, porque hover não existe em tela de toque nem no teclado.
		// O hover é ATALHO de mouse, não a única porta: quem navega por teclado usa
		// o <button> abaixo, que já tem aria-expanded/aria-controls e fecha no
		// Escape. Dar role a esta div inventaria semântica que ela não tem.
		// biome-ignore lint/a11y/noStaticElementInteractions: ver acima
		<div
			ref={wrapperRef}
			className="relative"
			onMouseEnter={() => setAberto(true)}
			onMouseLeave={() => setAberto(false)}
		>
			<button
				ref={gatilhoRef}
				type="button"
				aria-expanded={aberto}
				aria-controls={painelId}
				onClick={() => setAberto((estava) => !estava)}
				onKeyDown={(evento) => {
					if (evento.key !== "Escape" || !aberto) return;
					setAberto(false);
					gatilhoRef.current?.focus();
				}}
				className={`flex items-center gap-1 hover:text-white/75 ${LINK_CLASS}`}
			>
				{item.label}
				<ChevronDown
					aria-hidden="true"
					className={`size-4 transition-transform ${aberto ? "rotate-180" : ""}`}
				/>
			</button>

			{aberto ? (
				<div
					id={painelId}
					className="absolute left-0 top-full z-50 min-w-[200px] overflow-hidden rounded-[12px] bg-[#FAFAF3] py-2 shadow-[0_12px_32px_rgba(2,22,40,0.24)]"
				>
					{item.submenu.map((sub) => (
						<a
							key={sub.href}
							href={sub.href}
							onClick={() => setAberto(false)}
							className="flex items-center gap-3 px-5 py-2.5 text-[16px] leading-[24px] text-[#052440] transition-colors hover:bg-[#052440]/8"
						>
							{/* O ícone repete o rótulo em desenho, não acrescenta informação:
							    fica `aria-hidden` para o leitor de tela anunciar só "Carro". */}
							{sub.icone ? <sub.icone aria-hidden="true" className="size-5 shrink-0" /> : null}
							{sub.label}
						</a>
					))}
				</div>
			) : null}
		</div>
	);
}

interface KvMenuProps {
	onOpenChat: TheaterOpener;
	/** Itens do menu. Sem isto, o da home; as verticais passam `NAV_VERTICAL`. */
	nav?: ItemDeMenu[];
}

export function KvMenu({ onOpenChat, nav = NAV }: KvMenuProps) {
	const [mobileOpen, setMobileOpen] = useState(false);

	return (
		<header className="relative w-full bg-[#052440]">
			{/* 96px de altura e conteúdo começando em 64px — o comp põe o logo em x=64,
			    a mesma coluna da faixa navy do rodapé (`px-6 md:px-16` lá também).
			
			    NO CELULAR A BARRA É 40% MAIS BAIXA (pedido do Kairo, 20/08/2026):
			    96 → 58px. Numa tela de 812px de altura, os 96px do comp comiam 12%
			    do que se vê antes de rolar — e essa barra não é conteúdo, é cromo.
			    O wordmark encolhe na mesma proporção (56 → 34px), senão ele não
			    caberia na barra nova. O desktop segue o comp, intacto. */}
			<KvContainer className="flex h-[58px] max-w-[1440px] items-center justify-between md:h-[96px] md:px-16">
				{/* O logo volta para o início — `/` e não `#hero`, porque este mesmo
				    cabeçalho renderiza nas três verticais e âncora resolveria na página
				    atual. O `aria-hidden` no SVG passa o nome acessível para o link: o
				    "Aja Agora" do desenho descreve a marca, o do link tem de dizer o
				    destino. */}
				<Link
					href="/"
					aria-label="Aja Agora — ir para o início"
					className="shrink-0 transition-opacity hover:opacity-75"
				>
					<Wordmark className="h-[34px] w-auto text-white md:h-[56px]" aria-hidden="true" />
				</Link>

				{/* Corta em `lg` e não antes: com cinco itens, o texto da barra passa de
				    490px e não cabe ao lado do logo e do CTA numa tela de tablet. */}
				<nav className="hidden items-center gap-[36px] lg:flex xl:gap-[48px]">
					{nav.map((item) =>
						item.submenu ? (
							<ItemComSubmenu key={item.label} item={{ ...item, submenu: item.submenu }} />
						) : (
							<a key={item.label} href={item.href} className={`${LINK_CLASS} hover:text-white/75`}>
								{item.label}
							</a>
						),
					)}
				</nav>

				<div className="flex items-center gap-[13px]">
					<KvCtaButton size="sm" onClick={(e) => onOpenChat("", e.currentTarget)}>
						Comparar agora
					</KvCtaButton>
					{/* Sem "Entrar": o comp tem o botão, mas não existe jornada de login de
					    cliente (só admin, em /admin/login), e ele vivia inerte/desabilitado
					    desde o FIX-351. Decisão do time — não repor por fidelidade ao Figma
					    enquanto o login não existir. */}
					<button
						type="button"
						aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
						aria-expanded={mobileOpen}
						aria-controls="kv-menu-mobile-nav"
						onClick={() => setMobileOpen((open) => !open)}
						className="flex size-9 items-center justify-center text-white transition-colors hover:text-white/75 lg:hidden"
					>
						{mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
					</button>
				</div>
			</KvContainer>

			{mobileOpen ? (
				<nav id="kv-menu-mobile-nav" className="border-t border-white/10 bg-[#052440] lg:hidden">
					{nav.map((item) =>
						item.submenu ? (
							// No painel mobile o submenu não esconde nada: fica aberto, com os
							// filhos indentados. Um segundo nível de toque para chegar em três
							// links seria atrito à toa numa lista que já rola.
							<div key={item.label} className="py-1">
								<p className="px-6 py-2 text-[12px] font-semibold uppercase tracking-wide text-white/60">
									{item.label}
								</p>
								{item.submenu.map((sub) => (
									<a
										key={sub.href}
										href={sub.href}
										onClick={() => setMobileOpen(false)}
										className="flex items-center gap-3 py-3 pl-10 pr-6 text-[16px] font-normal text-white transition-colors hover:text-white/75"
									>
										{sub.icone ? (
											<sub.icone aria-hidden="true" className="size-5 shrink-0" />
										) : null}
										{sub.label}
									</a>
								))}
							</div>
						) : (
							<a
								key={item.label}
								href={item.href}
								onClick={() => setMobileOpen(false)}
								className="block px-6 py-3 text-[16px] font-normal text-white transition-colors hover:text-white/75"
							>
								{item.label}
							</a>
						),
					)}
				</nav>
			) : null}
		</header>
	);
}
