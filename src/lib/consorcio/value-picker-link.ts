// FIX-16 (Kairo, 2026-06-11) — inteligência do ValuePicker (present_value_picker):
// os sliders deixam de ser independentes e passam a respeitar a relação de
// consórcio usada no plan-estimate (FIX-3):
//
//   parcela ≈ bem × (1 + taxa_adm_típica[categoria]) / prazo
//
// Mexeu na parcela ou no prazo → o VALOR DO BEM se ajusta (o usuário descobre
// "quanto de bem cabe no que eu pago"). Mexeu no bem → a PARCELA se ajusta
// (prazo fixo). Premissas TÍPICAS de mercado (TYPICAL_ADMIN_FEE_PCT /
// TYPICAL_TERM_MONTHS) — estimativa, nunca dado de administradora.
//
// O payload da tool é genérico (o agent decide os fields), então os papéis
// (bem/parcela/prazo) são identificados por id canônico + heurística. Quando
// não dá pra identificar com segurança, o componente degrada pro comportamento
// antigo (sliders independentes) — nunca interliga errado.

import type { Category } from "@/lib/agent/personas";
import type { ValuePickerField } from "@/lib/chat/types";
import { TYPICAL_ADMIN_FEE_PCT, TYPICAL_TERM_MONTHS } from "./plan-estimate";

export interface ValuePickerLinkRoles {
	assetId: string;
	monthlyId: string;
	/** Ausente quando o agent não mandou slider de prazo — usa o típico da categoria. */
	termId?: string;
}

const ASSET_ID_RE = /credit|asset|bem|valor|carta|imovel|veiculo/i;
const MONTHLY_ID_RE = /monthly|parcela|budget|mensal|payment/i;
const TERM_ID_RE = /term|prazo|meses|months/i;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Snap ao step do field + clamp aos bounds — derivado sempre cabe no slider. */
function snapToField(field: ValuePickerField, raw: number): number {
	const step = field.step > 0 ? field.step : 1;
	return clamp(Math.round(raw / step) * step, field.min, field.max);
}

/**
 * Identifica quem é bem/parcela/prazo no payload genérico do agent.
 * Retorna null quando não dá pra afirmar com segurança (→ sem interligação).
 */
export function identifyLinkRoles(fields: ValuePickerField[]): ValuePickerLinkRoles | null {
	// Prazo: format months tem prioridade; senão id que pareça prazo.
	const term =
		fields.find((f) => f.format === "months") ??
		fields.find((f) => f.format !== "currency" && TERM_ID_RE.test(f.id));

	const currency = fields.filter((f) => f.id !== term?.id && f.format !== "months");
	if (currency.length < 2) return null;

	let asset = currency.find((f) => ASSET_ID_RE.test(f.id) && !MONTHLY_ID_RE.test(f.id));
	let monthly = currency.find((f) => MONTHLY_ID_RE.test(f.id) && f.id !== asset?.id);

	// Fallback: exatamente 2 currency → o de maior teto é o bem, o outro a parcela.
	if ((!asset || !monthly) && currency.length === 2) {
		const [a, b] = [...currency].sort((x, y) => y.max - x.max);
		asset ??= a.id === monthly?.id ? b : a;
		monthly ??= asset.id === a.id ? b : a;
	}

	if (!asset || !monthly || asset.id === monthly.id) return null;
	return { assetId: asset.id, monthlyId: monthly.id, termId: term?.id };
}

/**
 * Recalcula o campo derivado quando o usuário arrasta um slider:
 * parcela/prazo mudou → deriva o bem; bem mudou → deriva a parcela.
 * Campo fora dos papéis (ex: um 4º slider) → valores intactos.
 */
export function recalcLinkedValues(opts: {
	fields: ValuePickerField[];
	roles: ValuePickerLinkRoles;
	category: Category;
	values: Record<string, number>;
	changedId: string;
}): Record<string, number> {
	const { fields, roles, category, values, changedId } = opts;
	const feeFactor = 1 + TYPICAL_ADMIN_FEE_PCT[category] / 100;
	const term = Math.max(
		1,
		roles.termId ? (values[roles.termId] ?? TYPICAL_TERM_MONTHS[category]) : TYPICAL_TERM_MONTHS[category],
	);

	const fieldOf = (id: string) => fields.find((f) => f.id === id);

	if (changedId === roles.monthlyId || changedId === roles.termId) {
		const assetField = fieldOf(roles.assetId);
		if (!assetField) return values;
		const derived = (values[roles.monthlyId] * term) / feeFactor;
		return { ...values, [roles.assetId]: snapToField(assetField, derived) };
	}

	if (changedId === roles.assetId) {
		const monthlyField = fieldOf(roles.monthlyId);
		if (!monthlyField) return values;
		const derived = (values[roles.assetId] * feeFactor) / term;
		return { ...values, [roles.monthlyId]: snapToField(monthlyField, derived) };
	}

	return values;
}
