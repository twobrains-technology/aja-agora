import { Wordmark } from "@/components/brand/wordmark";
import type { TheaterOpener } from "@/components/chat/theater/theater-context";

type FooterLink = { label: string; href?: string; seed?: string };

const COLS: { title: string; links: FooterLink[] }[] = [
	{
		// FIX-131 (D21): 3 categorias de ENTRADA — Imóvel, Automóvel, Moto — em
		// paridade com o hero (CHIPS), o welcome do chat (FIX-130) e o WhatsApp.
		// Bv2-01 / Bruna v1 #20: moto substituiu "Serviços" nos chips de entrada.
		// Cada item aqui ABRE o chat (seed), então é porta de entrada da jornada,
		// não link informativo. servicos segue vivo por texto livre.
		title: "Consórcio",
		links: [
			{ label: "Imóvel", seed: "Quero conquistar um imóvel" },
			{ label: "Automóvel", seed: "Quero comprar um carro" },
			{ label: "Moto", seed: "Quero comprar uma moto" },
		],
	},
	{
		title: "A Aja Agora",
		links: [
			{ label: "Como trabalhamos", href: "#como" },
			{ label: "Na prática", href: "#pratica" },
			{ label: "Quem somos", href: "#sobre" },
		],
	},
];

const LINK_CLASS =
	"text-left text-sm text-muted-foreground transition-colors hover:text-foreground";

export function BrandFooter({ onStart }: { onStart: TheaterOpener }) {
	return (
		<footer className="border-t border-border bg-[#fbfbf9] px-5 pb-10 pt-12 sm:px-8">
			<div className="mx-auto max-w-[1120px]">
				<div className="flex flex-col justify-between gap-10 md:flex-row">
					<div className="max-w-sm">
						<Wordmark className="h-11 w-auto" />
						<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
							Consultoria de consórcio independente. Transparente, alinhada e do seu lado.
						</p>
					</div>
					<div className="flex gap-16">
						{COLS.map((col) => (
							<div key={col.title}>
								<h5 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
									{col.title}
								</h5>
								<div className="mt-3 flex flex-col items-start gap-2">
									{col.links.map((link) =>
										link.seed !== undefined ? (
											<button
												key={link.label}
												type="button"
												onClick={(e) => onStart(link.seed ?? "", e.currentTarget)}
												className={LINK_CLASS}
											>
												{link.label}
											</button>
										) : (
											<a key={link.label} href={link.href} className={LINK_CLASS}>
												{link.label}
											</a>
										),
									)}
								</div>
							</div>
						))}
					</div>
				</div>

				<div className="mt-9 flex flex-wrap justify-between gap-3 border-t border-border pt-6 text-xs text-[#9aa7b6]">
					<span>Aja Agora © 2026</span>
					<span>Do sonho à conquista.</span>
				</div>
			</div>
		</footer>
	);
}
