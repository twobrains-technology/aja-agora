// Lettermark curto "AJA" (variante 'Curto — fundo escuro' do design system).
// Reaproveita os glifos A-J-A da parte superior do lockup oficial
// (src/components/brand/wordmark.tsx), recortados via viewBox. Segue
// currentColor (claro sobre o navy do badge/avatar). Compartilhado pelo hero da
// home (kv-hero) e pelos heros de vertical.
export function AjaMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="165 158 540 172"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="AJA"
			className={className}
		>
			<polygon points="215.29 323.78 275.58 214.54 335.47 323.78 382.3 323.78 294.76 166.11 255.64 166.11 168.87 323.78" />
			<path d="M456.44,163.77v60.32c0,33.62-27.35,60.97-60.97,60.97-7.1,0-13.89-1.28-20.21-3.55l-.35.35,23.13,41.67c53.7-1.38,96.99-45.4,96.99-99.44v-60.32h-38.6Z" />
			<polygon points="533.64 323.22 593.94 213.98 653.82 323.22 700.65 323.22 613.12 165.55 573.99 165.55 487.22 323.22" />
		</svg>
	);
}
