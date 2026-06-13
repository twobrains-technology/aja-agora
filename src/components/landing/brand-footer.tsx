import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";

const COLS = [
	{
		title: "Consórcio",
		links: [
			{ label: "Imóvel", href: "/chat" },
			{ label: "Automóvel", href: "/chat" },
			{ label: "Moto", href: "/chat" },
			{ label: "Serviços", href: "/chat" },
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

export function BrandFooter() {
	return (
		<footer className="border-t border-border bg-[#fbfbf9] px-5 pb-10 pt-12 sm:px-8">
			<div className="mx-auto max-w-[1120px]">
				<div className="flex flex-col justify-between gap-10 md:flex-row">
					<div className="max-w-sm">
						<Wordmark className="h-11 w-auto" />
						<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
							Consultoria de consórcio independente. Transparente, estratégica e do seu lado.
						</p>
					</div>
					<div className="flex gap-16">
						{COLS.map((col) => (
							<div key={col.title}>
								<h5 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
									{col.title}
								</h5>
								<div className="mt-3 flex flex-col gap-2">
									{col.links.map((link) =>
										link.href.startsWith("#") ? (
											<a
												key={link.label}
												href={link.href}
												className="text-sm text-muted-foreground transition-colors hover:text-foreground"
											>
												{link.label}
											</a>
										) : (
											<Link
												key={link.label}
												href={link.href}
												className="text-sm text-muted-foreground transition-colors hover:text-foreground"
											>
												{link.label}
											</Link>
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
