// Documento de proposta em PDF (co-branded Aja Agora + administradora), gerado
// server-side no fechamento. Espelha as seções do ProposalDoc web
// (src/components/chat/artifacts/proposal-doc.tsx) — MESMO conteúdo, honestidade
// idêntica (D11: só o que temos; nada de taxaContemplacao / parcela pós
// fabricada / redução de prazo). Feito com @react-pdf/renderer (PDF vetorial de
// verdade, sem headless chromium no container).

import {
	Document,
	Page,
	Path,
	renderToBuffer,
	StyleSheet,
	Svg,
	Text,
	View,
} from "@react-pdf/renderer";

const NAVY = "#052440";
const BLUE = "#036eff";
const INK = "#1a2b3c";
const MUTED = "#5b6b7d";
const LINE = "#e3e9f0";
const SOFTBLUE = "#eef5ff";
const CREAM = "#f7f7ea";
const BORDER = "#d5deea";

export interface ProposalPdfData {
	clientName?: string;
	administradora: string;
	grupo: string;
	categoryLabel: string;
	creditValue: number;
	monthlyPayment: number | null;
	termMonths: number | null;
	avgBidValue: number | null;
	/** Data de geração já formatada pt-BR. */
	generatedAt: string;
	/** Economia total vs financiamento (positiva = consórcio mais barato). Null = sem cálculo. */
	economiaTotal: number | null;
	economiaMensal: number | null;
	/** Comparativo já calculado (finance/pmt.ts) + premissa exibida. Null = sem dado. */
	financing: {
		consorcioMonthly: number;
		financingMonthly: number;
		disclaimer: string;
	} | null;
}

const brl0 = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const s = StyleSheet.create({
	page: { backgroundColor: "#ffffff", color: INK, fontSize: 10, paddingBottom: 36 },
	header: { backgroundColor: NAVY, paddingHorizontal: 36, paddingVertical: 28, color: "#ffffff" },
	headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
	brand: { flexDirection: "row", alignItems: "center", gap: 8 },
	brandName: { fontSize: 18, fontFamily: "Helvetica-Bold", letterSpacing: -0.3 },
	adminChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.25)",
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 5,
	},
	adminChipLabel: { fontSize: 8, color: "rgba(255,255,255,0.8)" },
	adminChipName: { fontSize: 10, fontFamily: "Helvetica-Bold" },
	docTitle: { marginTop: 18, fontSize: 24, fontFamily: "Helvetica-Bold", letterSpacing: -0.5 },
	metaLine: { marginTop: 5, fontSize: 8.5, color: "rgba(255,255,255,0.82)" },
	section: { paddingHorizontal: 36, paddingVertical: 16, borderTopWidth: 1, borderTopColor: LINE },
	kicker: {
		fontSize: 8,
		fontFamily: "Helvetica-Bold",
		color: BLUE,
		textTransform: "uppercase",
		letterSpacing: 1,
		marginBottom: 4,
	},
	sectionTitle: { fontSize: 15, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 10 },
	clientRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
		paddingHorizontal: 36,
		paddingVertical: 14,
	},
	label: { fontSize: 9, color: MUTED },
	clientName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 2 },
	creditValue: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BLUE, marginTop: 2 },
	advantage: {
		marginHorizontal: 36,
		marginBottom: 4,
		backgroundColor: SOFTBLUE,
		borderWidth: 1,
		borderColor: "#cfe0ff",
		borderRadius: 12,
		padding: 14,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	advTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: NAVY, maxWidth: 340 },
	advSub: { fontSize: 9, color: MUTED, marginTop: 3, maxWidth: 340 },
	zeroBox: {
		backgroundColor: "#ffffff",
		borderWidth: 1,
		borderColor: "#cfe0ff",
		borderRadius: 10,
		paddingHorizontal: 14,
		paddingVertical: 8,
		alignItems: "center",
	},
	zeroNum: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BLUE },
	zeroLabel: { fontSize: 8, color: MUTED, marginTop: 2 },
	paymentBox: {
		backgroundColor: SOFTBLUE,
		borderWidth: 1,
		borderColor: "#cfe0ff",
		borderRadius: 12,
		padding: 14,
		marginBottom: 12,
	},
	paymentLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: BLUE },
	paymentValue: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BLUE, marginTop: 2 },
	paymentNote: { fontSize: 8.5, color: MUTED, marginTop: 3 },
	kvGrid: { flexDirection: "row", gap: 24 },
	kvCol: { flex: 1 },
	kvRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
		borderBottomWidth: 1,
		borderBottomColor: LINE,
		paddingVertical: 6,
	},
	kvKey: { fontSize: 9.5, color: MUTED },
	kvVal: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },
	kvValStrong: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BLUE },
	table: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, overflow: "hidden" },
	tRow: { flexDirection: "row" },
	tHeadCell: { flex: 1, paddingHorizontal: 10, paddingVertical: 7, fontSize: 9, fontFamily: "Helvetica-Bold" },
	tCell: { flex: 1, paddingHorizontal: 10, paddingVertical: 7, fontSize: 9, borderTopWidth: 1, borderTopColor: LINE },
	confRow: { flexDirection: "row", flexWrap: "wrap" },
	confItem: { width: "50%", flexDirection: "row", gap: 7, marginBottom: 8, paddingRight: 10 },
	confMark: { width: 8, height: 8, borderRadius: 4, backgroundColor: BLUE, marginTop: 3 },
	confTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: NAVY },
	confDesc: { fontSize: 8.5, color: MUTED, marginTop: 1 },
	quote: {
		marginTop: 8,
		backgroundColor: CREAM,
		borderWidth: 1,
		borderColor: "#ececcd",
		borderRadius: 12,
		padding: 14,
	},
	quoteText: { fontSize: 10.5, color: INK, lineHeight: 1.4 },
	quoteSign: { fontSize: 9, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 8 },
	strat: { flexDirection: "row", gap: 10 },
	stratCard: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12 },
	stratTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold" },
	stratDesc: { fontSize: 9, color: MUTED, marginTop: 4, lineHeight: 1.35 },
	step: { flexDirection: "row", gap: 10, marginBottom: 8, alignItems: "flex-start" },
	stepNum: {
		width: 20,
		height: 20,
		borderRadius: 10,
		backgroundColor: NAVY,
		color: "#ffffff",
		fontSize: 10,
		fontFamily: "Helvetica-Bold",
		textAlign: "center",
		paddingTop: 4,
	},
	stepTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: NAVY },
	stepDesc: { fontSize: 9, color: MUTED, marginTop: 1 },
	obs: { paddingHorizontal: 36, paddingVertical: 14, backgroundColor: "#f4f7fb", borderTopWidth: 1, borderTopColor: LINE },
	obsTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
	obsText: { fontSize: 8.5, color: MUTED, lineHeight: 1.5 },
	footer: {
		backgroundColor: NAVY,
		paddingHorizontal: 36,
		paddingVertical: 16,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		color: "#ffffff",
	},
	footerName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#ffffff" },
	footerTag: { fontSize: 9.5, color: "rgba(255,255,255,0.82)", maxWidth: 240, textAlign: "right" },
	disclaimer: { fontSize: 8, color: MUTED, marginTop: 6, lineHeight: 1.4 },
});

const CONFIANCA: [string, string][] = [
	["Sem juros", "Você paga o valor do bem, não a dívida de um financiamento."],
	["Fiscalizado pelo Banco Central", "Administradoras autorizadas e supervisionadas pelo BACEN."],
	["Seus dados protegidos", "Tratamento conforme a LGPD, só para simular e contratar."],
	["A gente segue com você", "Acompanhamento da Aja Agora até a contemplação — e depois dela."],
];

const JORNADA: [string, string][] = [
	["Entrada no plano", "Você começa com parcelas que cabem no seu planejamento."],
	["Participação mensal", "Todo mês concorre por sorteio — ou antecipa com lance."],
	["Contemplação", "Ao ser contemplado, você conquista sua carta de crédito."],
	["Compra do bem", "Com o crédito liberado, você escolhe e compra seu bem."],
	["Conclusão", "Segue o pagamento até quitar o plano, já com o bem em mãos."],
];

// Símbolo do sol (marca Aja Agora) — mesmos paths do SunMark web
// (src/components/brand/sun-mark.tsx), renderizados brancos pro header/footer navy.
const SUN_RAY_PATHS = [
	"M1065.34,405.47l58.36,64.81c9.8-8.83,18.64-18.67,26.42-29.36l-70.55-51.26c-4.19,5.75-8.95,11.05-14.22,15.8Z",
	"M946.44,241.82l-43.61-75.53c-11.46,6.63-22.18,14.4-31.95,23.21l58.36,64.81c5.26-4.74,11.03-8.92,17.2-12.49Z",
	"M1096.78,351.04c-1.49,7.04-3.72,13.8-6.58,20.22l79.68,35.48c5.32-11.92,9.46-24.48,12.22-37.56l-85.32-18.14Z",
	"M986.66,228.74l-9.12-86.75c-13.35,1.39-26.26,4.19-38.64,8.21l26.96,82.96c6.66-2.16,13.61-3.67,20.8-4.42Z",
	"M1028.72,233.16l26.96-82.96c-12.37-4.02-25.29-6.82-38.64-8.21l-9.12,86.75c7.18.75,14.14,2.26,20.8,4.42Z",
	"M915.02,270.12l-70.55-51.26c-7.73,10.62-14.36,22.07-19.77,34.19l79.68,35.48c2.91-6.53,6.48-12.69,10.64-18.41Z",
	"M1090.2,288.52l79.68-35.48c-5.41-12.13-12.04-23.58-19.77-34.19l-70.55,51.26c4.16,5.71,7.73,11.88,10.64,18.41Z",
	"M1099,329.89h87.22c0-13.47-1.44-26.61-4.12-39.28l-85.32,18.14c1.44,6.82,2.22,13.89,2.22,21.15Z",
	"M1065.34,254.31l58.36-64.81c-9.78-8.81-20.49-16.58-31.95-23.21l-43.61,75.53c6.17,3.57,11.94,7.75,17.2,12.49Z",
	"M897.8,308.74l-85.32-18.14c-2.68,12.68-4.12,25.81-4.12,39.28h87.22c0-7.25.77-14.32,2.22-21.15Z",
];

function SunMarkPdf({ size }: { size: number }) {
	return (
		<Svg width={size} height={(size * 338) / 388} viewBox="805 138 388 338">
			{SUN_RAY_PATHS.map((d) => (
				<Path key={d} d={d} fill="#ffffff" />
			))}
		</Svg>
	);
}

function Kv({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
	return (
		<View style={s.kvRow}>
			<Text style={s.kvKey}>{k}</Text>
			<Text style={strong ? s.kvValStrong : s.kvVal}>{v}</Text>
		</View>
	);
}

function ProposalDocument({ data }: { data: ProposalPdfData }) {
	const hasPayment = data.monthlyPayment != null && Number.isFinite(data.monthlyPayment);
	return (
		<Document title="Proposta de Consórcio — Aja Agora" author="Aja Agora">
			<Page size="A4" style={s.page}>
				{/* 1 · Header co-branded */}
				<View style={s.header}>
					<View style={s.headRow}>
						<View style={s.brand}>
							<SunMarkPdf size={22} />
							<Text style={s.brandName}>Aja Agora</Text>
						</View>
						<View style={s.adminChip}>
							<Text style={s.adminChipLabel}>administradora</Text>
							<Text style={s.adminChipName}>{data.administradora}</Text>
						</View>
					</View>
					<Text style={s.docTitle}>Proposta de Consórcio</Text>
					<Text style={s.metaLine}>
						Segmento {data.categoryLabel} · Gerada em {data.generatedAt} · Selecionada pela Aja Agora ·
						Sem compromisso
					</Text>
				</View>

				{/* 2 · Cliente + carta */}
				<View style={s.clientRow}>
					<View>
						{data.clientName ? (
							<>
								<Text style={s.label}>Cliente</Text>
								<Text style={s.clientName}>{data.clientName}</Text>
							</>
						) : null}
					</View>
					<View style={{ alignItems: "flex-end" }}>
						<Text style={s.label}>Carta de crédito</Text>
						<Text style={s.creditValue}>{brl2(data.creditValue)}</Text>
					</View>
				</View>

				{/* 3 · A sua vantagem */}
				{data.economiaTotal != null ? (
					<View style={s.advantage}>
						<View>
							<Text style={s.kicker}>A sua vantagem</Text>
							<Text style={s.advTitle}>
								Economia estimada de ~{brl0(data.economiaTotal)} vs financiamento
							</Text>
							{data.economiaMensal != null ? (
								<Text style={s.advSub}>
									~{brl0(data.economiaMensal)} a menos por mês — e sem juros, do começo ao fim.
								</Text>
							) : null}
						</View>
						<View style={s.zeroBox}>
							<Text style={s.zeroNum}>0%</Text>
							<Text style={s.zeroLabel}>de juros</Text>
						</View>
					</View>
				) : null}

				{/* 4 · Resumo da simulação */}
				<View style={s.section}>
					<Text style={s.kicker}>Resumo da simulação</Text>
					<Text style={s.sectionTitle}>As condições da sua cota</Text>
					{hasPayment ? (
						<View style={s.paymentBox}>
							<Text style={s.paymentLabel}>Parcela mensal</Text>
							<Text style={s.paymentValue}>{brl2(data.monthlyPayment as number)}/mês</Text>
							<Text style={s.paymentNote}>É a parcela cheia, que você paga até ser contemplada.</Text>
						</View>
					) : null}
					<View style={s.kvGrid}>
						<View style={s.kvCol}>
							<Kv k="Carta de crédito" v={brl2(data.creditValue)} />
							{data.termMonths != null ? <Kv k="Prazo" v={`${data.termMonths} meses`} /> : null}
							{data.avgBidValue != null ? (
								<Kv k="Lance médio do grupo" v={brl0(data.avgBidValue)} />
							) : null}
						</View>
						<View style={s.kvCol}>
							<Kv k="Administradora" v={data.administradora} />
							<Kv k="Grupo" v={data.grupo} strong />
						</View>
					</View>
				</View>

				{/* 5 · Comparativo */}
				{data.financing ? (
					<View style={s.section}>
						<Text style={s.kicker}>Por que consórcio</Text>
						<Text style={s.sectionTitle}>Consórcio × Financiamento</Text>
						<View style={s.table}>
							<View style={s.tRow}>
								<Text style={[s.tHeadCell, { backgroundColor: "#f0f3f8", color: MUTED }]}>
									Descrição
								</Text>
								<Text style={[s.tHeadCell, { backgroundColor: "#e6f0ff", color: BLUE, textAlign: "right" }]}>
									Consórcio
								</Text>
								<Text style={[s.tHeadCell, { backgroundColor: "#f0f3f8", color: MUTED, textAlign: "right" }]}>
									Financiamento
								</Text>
							</View>
							<View style={s.tRow}>
								<Text style={s.tCell}>Parcela</Text>
								<Text style={[s.tCell, { textAlign: "right", color: BLUE, backgroundColor: "#f5f9ff" }]}>
									{brl2(data.financing.consorcioMonthly)}
								</Text>
								<Text style={[s.tCell, { textAlign: "right", color: MUTED }]}>
									{brl2(data.financing.financingMonthly)}
								</Text>
							</View>
							<View style={s.tRow}>
								<Text style={s.tCell}>Juros</Text>
								<Text style={[s.tCell, { textAlign: "right", color: BLUE, backgroundColor: "#f5f9ff" }]}>
									Não
								</Text>
								<Text style={[s.tCell, { textAlign: "right", color: MUTED }]}>Sim</Text>
							</View>
							<View style={s.tRow}>
								<Text style={s.tCell}>Entrada</Text>
								<Text style={[s.tCell, { textAlign: "right", color: BLUE, backgroundColor: "#f5f9ff" }]}>
									Opcional (lance)
								</Text>
								<Text style={[s.tCell, { textAlign: "right", color: MUTED }]}>Obrigatória</Text>
							</View>
						</View>
						<Text style={s.disclaimer}>{data.financing.disclaimer}</Text>
					</View>
				) : null}

				{/* 6 · Confiança */}
				<View style={s.section}>
					<Text style={s.kicker}>Confiança</Text>
					<Text style={s.sectionTitle}>Por que com a Aja Agora</Text>
					<View style={s.confRow}>
						{CONFIANCA.map(([t, d]) => (
							<View key={t} style={s.confItem}>
								<View style={s.confMark} />
								<View style={{ flex: 1 }}>
									<Text style={s.confTitle}>{t}</Text>
									<Text style={s.confDesc}>{d}</Text>
								</View>
							</View>
						))}
					</View>
					<View style={s.quote}>
						<Text style={s.quoteText}>
							“Você não paga nada até o primeiro boleto chegar. Nosso trabalho é escolher o melhor grupo
							pro seu perfil e seguir com você em cada etapa — pode falar com a gente quando quiser.”
						</Text>
						<Text style={s.quoteSign}>— Equipe Aja Agora</Text>
					</View>
				</View>

				{/* 7 · Estratégia */}
				<View style={s.section}>
					<Text style={s.kicker}>Estratégia de contemplação</Text>
					<Text style={s.sectionTitle}>Dois caminhos até a carta</Text>
					<View style={s.strat}>
						<View style={[s.stratCard, { borderColor: BORDER, backgroundColor: "#f4f7fb" }]}>
							<Text style={[s.stratTitle, { color: NAVY }]}>Sem lance</Text>
							<Text style={s.stratDesc}>Você participa dos sorteios mensais até ser contemplado.</Text>
						</View>
						<View style={[s.stratCard, { borderColor: "#cfe0ff", backgroundColor: SOFTBLUE }]}>
							<Text style={[s.stratTitle, { color: BLUE }]}>Com lance</Text>
							<Text style={s.stratDesc}>
								Com recursos próprios ou embutido, você antecipa a aquisição.
							</Text>
						</View>
					</View>
				</View>

				{/* 8 · Jornada */}
				<View style={s.section}>
					<Text style={s.kicker}>Como funciona</Text>
					<Text style={s.sectionTitle}>Sua jornada em 5 etapas</Text>
					{JORNADA.map(([t, d], i) => (
						<View key={t} style={s.step}>
							<Text style={s.stepNum}>{i + 1}</Text>
							<View style={{ flex: 1 }}>
								<Text style={s.stepTitle}>{t}</Text>
								<Text style={s.stepDesc}>{d}</Text>
							</View>
						</View>
					))}
				</View>

				{/* 9 · Observações */}
				<View style={s.obs}>
					<Text style={s.obsTitle}>Observações</Text>
					<Text style={s.obsText}>
						Os valores são estimativas e podem sofrer alterações. A contemplação não é garantida —
						depende de sorteio ou lance. A contratação está sujeita à disponibilidade de vagas no grupo
						e à aprovação da administradora. O reajuste do crédito segue as regras do grupo.
					</Text>
				</View>

				{/* Footer */}
				<View style={s.footer}>
					<View style={s.brand}>
						<SunMarkPdf size={18} />
						<Text style={s.footerName}>Aja Agora</Text>
					</View>
					<Text style={s.footerTag}>Seguimos com você até a contemplação — e depois dela.</Text>
				</View>
			</Page>
		</Document>
	);
}

/** Renderiza a proposta em PDF (Buffer). Node-only (usado no fechamento server-side). */
export function renderProposalPdf(data: ProposalPdfData): Promise<Buffer> {
	return renderToBuffer(<ProposalDocument data={data} />);
}
