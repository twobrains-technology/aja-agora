// src/lib/admin/origem-label.ts
//
// Dá NOME à origem de uma visita. Função pura — o banco agrega os números, e
// como esses números são apresentados ao time fica aqui, testável sem SQL.
//
// A ordem de precedência é a decisão de verdade deste arquivo: UTM ganha do
// referral de Click-to-WhatsApp porque UTM é declaração explícita de quem
// montou a campanha, enquanto o referral é o que a Meta inferiu. Quando os dois
// vêm juntos e discordam, a declaração vale mais.

export interface OrigemBruta {
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
	utmContent: string | null;
	ctwaSourceId: string | null;
	ctwaHeadline: string | null;
	referrerHost: string | null;
}

export type TipoOrigem = "campanha" | "click-to-whatsapp" | "referencia" | "direto";

export interface Origem {
	tipo: TipoOrigem;
	fonte: string | null;
	campanha: string | null;
	criativo: string | null;
	/** Como aparece na tela. */
	label: string;
}

function limpo(valor: string | null | undefined): string | null {
	const t = valor?.trim();
	return t ? t : null;
}

export function rotularOrigem(bruta: OrigemBruta | null): Origem {
	const utmSource = limpo(bruta?.utmSource);
	const utmCampaign = limpo(bruta?.utmCampaign);
	const utmContent = limpo(bruta?.utmContent);
	const ctwaSourceId = limpo(bruta?.ctwaSourceId);
	const ctwaHeadline = limpo(bruta?.ctwaHeadline);
	const referrerHost = limpo(bruta?.referrerHost);

	if (utmSource) {
		return {
			tipo: "campanha",
			fonte: utmSource,
			campanha: utmCampaign,
			criativo: utmContent,
			label: [utmSource, utmCampaign, utmContent].filter(Boolean).join(" · "),
		};
	}

	if (ctwaSourceId || ctwaHeadline) {
		// A headline é o que o time reconhece como "o criativo"; o id do anúncio
		// não diz nada pra quem opera, e só aparece quando falta headline.
		const criativo = ctwaHeadline ?? `anúncio ${ctwaSourceId}`;
		return {
			tipo: "click-to-whatsapp",
			fonte: "meta",
			campanha: null,
			criativo: ctwaHeadline ?? null,
			label: `Click-to-WhatsApp · ${criativo}`,
		};
	}

	if (referrerHost) {
		return {
			tipo: "referencia",
			fonte: referrerHost,
			campanha: null,
			criativo: null,
			label: referrerHost,
		};
	}

	return { tipo: "direto", fonte: null, campanha: null, criativo: null, label: "Direto" };
}
