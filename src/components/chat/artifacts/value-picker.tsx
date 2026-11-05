"use client";

import { ArrowRight, Check } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { CREDIT_BOUNDS, parseValorDoBem } from "@/lib/agent/qualify-config";
import { useChatContext } from "@/lib/chat/provider";
import type { ValuePickerField, ValuePickerPayload } from "@/lib/chat/types";
import { cartaEstimadaDeMercado, parcelaEstimadaDeMercado } from "@/lib/consorcio/plan-estimate";

export type { ValuePickerField, ValuePickerPayload };

// FIX-107 (revisão da jornada de entrada, 2026-06-28): a web trocou o value_picker
// COMPLEXO (3 sliders interligados valor/parcela/prazo — FIX-16, com recálculo via
// engine value-picker-link) por uma AGULHA SIMPLES só do VALOR DO BEM, de R$ 10.000
// em R$ 10.000. Decisão do Kairo: o valor é coletado por conversa, e o prazo saiu
// da entrada.
//
// ⚠️ A parte "a parcela vem das ofertas REAIS da Bevi, não é mais estimada na
// entrada" VALEU ATÉ 30/08/2026 e não vale mais — ver o bloco da estimativa lá
// embaixo. A agulha única continua (os três sliders interligados não voltaram);
// o que voltou é a parcela como LEITURA ao lado dela, com selo obrigatório. A
// razão original do FIX-107 é o que sustenta o selo: número de administradora
// sai de tool, e o que está na tela aqui é premissa de mercado documentada.
//
// TODO(bloco-jornada-entrada): o agente para de emitir card de apresentação na
// entrada (valor por conversa, FIX-104). Quando o shape final do que o backend
// emitir estabilizar, alinhar o id/label do campo de valor lido aqui.

/** Passo da agulha: R$ 10.000 (decisão do Kairo, 2026-07-21). Arrastar de mil em
 * mil obrigava dezenas de micro-ajustes pra atravessar a faixa de um carro; o
 * cliente pensa em dezenas de milhar ("uns 80 mil"), não em unidades de mil. Quem
 * precisa do valor EXATO digita no campo ao lado, que não faz snap no passo. */
export const VALUE_STEP = 10_000;

/** Escolhe o campo do VALOR DO BEM: o primeiro campo em reais (a entrada não tem
 * mais parcela/prazo). Fallback no primeiro campo do payload. */
function pickAssetField(fields: ValuePickerField[]): ValuePickerField {
	return fields.find((field) => field.format === "currency") ?? fields[0];
}

type Modo = "valor" | "parcela";

type Faixa = { min: number; max: number; step: number; default: number };

const arredondaPara = (n: number, passo: number) => Math.max(passo, Math.round(n / passo) * passo);

/** Faixa da parcela: a do payload, ou derivada da faixa de valor da categoria pela
 * mesma estimativa de mercado que o card já mostra (sem número inventado). */
function faixaDaParcela(payload: ValuePickerPayload): Faixa {
	if (payload.parcela) return payload.parcela;
	const b = CREDIT_BOUNDS[payload.category];
	const de = (v: number) => parcelaEstimadaDeMercado(payload.category, v)?.parcela ?? v / 60;
	const passo = payload.category === "imovel" ? 100 : 50;
	const min = arredondaPara(de(b.min), passo);
	const max = Math.max(min + passo, arredondaPara(de(b.max), passo));
	return { min, max, step: passo, default: Math.min(max, arredondaPara(de(b.default), passo)) };
}

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

/** O texto que volta como fala do cliente — natural, para o agente buscar com
 * `valorDoBem` ou `parcelaMensal`. */
export function textoDoPicker(modo: Modo, valor: number): string {
	if (modo === "parcela") return `Até ${brl(valor)} por mês`;
	if (valor >= 1000 && valor < 1_000_000 && valor % 1000 === 0) return `Uns R$ ${valor / 1000} mil`;
	return `Uns ${brl(valor)}`;
}

export function ValuePicker({
	payload,
	onSubmit,
	active = true,
}: {
	payload: ValuePickerPayload;
	onSubmit?: (values: Record<string, number>) => void;
	active?: boolean;
}) {
	const { sendUserMessage, status, messages } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	const field = pickAssetField(payload.fields);

	const [modo, setModo] = useState<Modo>(payload.modo === "parcela" ? "parcela" : "valor");
	const faixaParcela = faixaDaParcela(payload);
	const [valorBem, setValorBem] = useState(field.default);
	const [valorParcela, setValorParcela] = useState(faixaParcela.default);
	const ehParcela = modo === "parcela";
	const value = ehParcela ? valorParcela : valorBem;
	const setValue = ehParcela ? setValorParcela : setValorBem;
	const faixa: Faixa = ehParcela
		? faixaParcela
		: { min: field.min, max: field.max, step: field.step || VALUE_STEP, default: field.default };
	const [submitted, setSubmitted] = useState(false);

	// R5.5 — O CARD RECOLHE QUANDO O CLIENTE RESPONDE PELA CONVERSA.
	//
	// O value_picker não é o único caminho do valor: quem digita "uns 60 mil"
	// no campo de texto está respondendo a mesma pergunta. Antes o card ficava
	// na tela com o valor default (40.000) do lado da fala real do cliente —
	// dois números diferentes para a mesma pergunta. Agora, qualquer fala nova
	// do cliente depois que o card apareceu recolhe o card.
	//
	// A régua é "chegou fala nova", não "clicou": o clique já se resolvia
	// sozinho em `submitted`. O snapshot do mount separa o histórico (que já
	// existia quando o card montou) do que o cliente mandou DEPOIS dele.
	const idsDeUsuarioAoMontar = useRef<string[] | null>(null);
	const [respondidoNaConversa, setRespondidoNaConversa] = useState(false);
	useEffect(() => {
		const idsDeUsuario = messages.filter((m) => m.role === "user").map((m) => m.id);
		if (idsDeUsuarioAoMontar.current === null) {
			idsDeUsuarioAoMontar.current = idsDeUsuario;
			return;
		}
		const conhecidos = idsDeUsuarioAoMontar.current;
		if (idsDeUsuario.some((id) => !conhecidos.includes(id))) setRespondidoNaConversa(true);
	}, [messages]);

	// FIX-107/FIX-115: o slider (arraste) segue limitado à faixa da categoria —
	// é o range real de grupos que o produto costuma oferecer.
	const clampToSlider = (v: number) => Math.min(faixa.max, Math.max(faixa.min, v));

	// FIX-55: input numérico livre ao lado da agulha — o usuário digita o valor
	// exato (R$ 347.500), sem snap ao step da agulha. FIX-218 (Ata 2026-07-04):
	// o valor digitado NÃO é mais capado à faixa do slider — a faixa é só dica
	// visual; a busca (FIX-219) traz a ordem de grandeza mais próxima. Estado de
	// texto próprio (digitação livre), commit (parse via parseValorDoBem) no
	// blur/Enter.
	const [text, setText] = useState(() => field.default.toLocaleString("pt-BR"));
	useEffect(() => {
		setText(value.toLocaleString("pt-BR"));
	}, [value]);

	const commitText = () => {
		setValue(parseValorDoBem(text) ?? faixa.min);
	};

	// C1 — A FAIXA ESTIMADA, ANTES DE PEDIR QUALQUER DADO (30/08/2026).
	//
	// A auditoria de 28/08 trata isto como a alavanca principal do funil: o bot
	// pedia o dado mais sensível do Brasil antes de entregar um único número.
	// O motor já existia (`plan-estimate.ts`, "modo estimativa de mercado"), mas
	// o card que o usava foi aposentado no FIX-115 e não era emitido em lugar
	// nenhum — medido no banco de produção em 30/08: ZERO artefatos de
	// estimativa em toda a base.
	//
	// Ela vive AQUI, na própria agulha, e não num card à parte, por dois
	// motivos. Primeiro, este é o card que o cliente já vê no instante em que
	// informa o valor — então a reciprocidade não custa um turno a mais
	// justamente no trecho onde 65% das conversas morrem. Segundo, o número se
	// move com a agulha, o que responde a pergunta que a pessoa realmente tem:
	// "e se eu pegar um mais barato?".
	const estimativa = ehParcela ? null : parcelaEstimadaDeMercado(payload.category, value);

	// Espelho da estimativa: na aba de parcela, a carta que essa parcela paga,
	// dentro de CREDIT_BOUNDS (fora dele vira "até"/"a partir de").
	const cartaEst = ehParcela ? cartaEstimadaDeMercado(value, payload.category) : null;
	const limitesCarta = CREDIT_BOUNDS[payload.category];
	const cartaMostrada = cartaEst
		? cartaEst.carta > limitesCarta.max
			? { prefixo: "até", valor: limitesCarta.max }
			: cartaEst.carta < limitesCarta.min
				? { prefixo: "a partir de", valor: limitesCarta.min }
				: { prefixo: "por volta de", valor: cartaEst.carta }
		: null;

	const handleSubmit = () => {
		setSubmitted(true);
		if (onSubmit) {
			onSubmit({ [ehParcela ? "parcela" : field.id]: value });
			return;
		}
		void sendUserMessage(textoDoPicker(modo, value));
	};

	if (submitted || !active || respondidoNaConversa) return null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 300, damping: 25 }}
		>
			<Card className="w-full max-w-[340px] rounded-[12px] shadow-lg border-[color:var(--border-strong)] overflow-hidden">
				<CardContent className="space-y-4 p-[18px]">
					{/* biome-ignore lint/a11y/useSemanticElements: o grupo alterna entre dois
					modos de escolha; trocar por <fieldset> muda a semântica visual do card. */}
					<div
						role="group"
						aria-label="O que você quer definir"
						className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1"
					>
						{("valor parcela".split(" ") as Modo[]).map((m) => (
							<button
								key={m}
								type="button"
								aria-pressed={modo === m}
								data-testid={`modo-${m}`}
								disabled={submitted}
								onClick={() => setModo(m)}
								className={`min-h-[36px] rounded-full px-2 text-xs font-medium ${
									modo === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
								}`}
							>
								{modo === m ? "✓ " : ""}
								{m === "valor" ? "Valor do bem" : "Parcela por mês"}
							</button>
						))}
					</div>
					<div className="space-y-2">
						<div className="flex items-baseline justify-between gap-2.5">
							<span className="text-xs font-medium text-muted-foreground min-w-0">
								{ehParcela ? "Parcela por mês" : field.label}
							</span>
							<span className="flex shrink-0 items-center gap-1 text-primary">
								<span className="text-xs font-medium">R$</span>
								<Input
									value={text}
									inputMode="numeric"
									disabled={submitted}
									onChange={(e) => setText(e.target.value)}
									onBlur={commitText}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											commitText();
										}
									}}
									data-testid={`value-input-${ehParcela ? "parcela" : field.id}`}
									aria-label={ehParcela ? "Parcela por mês" : field.label}
									className="h-7 w-28 px-2 text-right text-sm font-bold text-figure tabular-nums"
								/>
							</span>
						</div>
						<Slider
							value={[value]}
							min={faixa.min}
							max={faixa.max}
							step={faixa.step}
							onValueChange={(val) => {
								if (!submitted) setValue(clampToSlider(Array.isArray(val) ? val[0] : val));
							}}
							disabled={submitted}
						/>
					</div>

					{/* O SELO NÃO É ENFEITE. O invariante do projeto é que número de
					    administradora sai de tool, nunca da cabeça do modelo nem da
					    nossa. Esta conta é premissa de mercado documentada
					    (`TYPICAL_ADMIN_FEE_PCT` / `TYPICAL_TERM_MONTHS`), e a tela tem
					    que dizer isso na cara: sem o selo a estimativa vira promessa, e
					    a oferta real que chega depois vira decepção. */}
					{estimativa ? (
						<div className="rounded-[10px] bg-secondary px-3 py-2.5">
							<p data-testid="parcela-estimada" className="text-sm text-foreground">
								Fica por volta de{" "}
								<span className="font-semibold tabular-nums">
									R$ {Math.round(estimativa.parcela).toLocaleString("pt-BR")}
								</span>
								<span className="text-muted-foreground">/mês</span>{" "}
								<span className="text-muted-foreground">em {estimativa.prazoMeses}x</span>
							</p>
							<p
								data-testid="parcela-estimada-selo"
								className="mt-0.5 text-[11px] leading-[1.35] text-muted-foreground"
							>
								Estimativa de mercado — os valores reais vêm da busca nas administradoras.
							</p>
						</div>
					) : null}

					{cartaEst && cartaMostrada ? (
						<div className="rounded-[10px] bg-secondary px-3 py-2.5">
							<p data-testid="carta-estimada" className="text-sm text-foreground">
								Dá uma carta {cartaMostrada.prefixo}{" "}
								<span className="font-semibold tabular-nums">
									R$ {cartaMostrada.valor.toLocaleString("pt-BR")}
								</span>{" "}
								<span className="text-muted-foreground">em {cartaEst.prazoMeses}x</span>
							</p>
							<p
								data-testid="carta-estimada-selo"
								className="mt-0.5 text-[11px] leading-[1.35] text-muted-foreground"
							>
								Estimativa de mercado — os valores reais vêm da busca nas administradoras.
							</p>
						</div>
					) : null}

					<Button
						onClick={handleSubmit}
						disabled={submitted || isStreaming}
						size="sm"
						className="w-full gap-1.5 rounded-full min-h-[44px]"
					>
						{submitted ? (
							<>
								<Check className="size-3.5" />
								Enviado
							</>
						) : (
							<>
								{ehParcela ? "Ver cartas nessa parcela" : "Ver cartas nesse valor"}
								<ArrowRight className="size-3.5" />
							</>
						)}
					</Button>
				</CardContent>
			</Card>
		</motion.div>
	);
}
