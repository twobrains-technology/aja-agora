/**
 * AI-suggest pra template WhatsApp.
 * Admin descreve em PT-BR → Claude gera nome, categoria, body, footer.
 * Body usa {{1}} {{2}} pra placeholders.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/admin/require-role";

const TemplateSuggestionSchema = z.object({
	name: z
		.string()
		.regex(/^[a-z0-9_]+$/, "snake_case")
		.min(3)
		.max(80),
	category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
	bodyText: z.string().min(10).max(1024),
	footerText: z.string().max(60).optional(),
	placeholdersDescription: z
		.string()
		.optional()
		.describe("Descrição curta de cada placeholder, ex: '{{1}} = nome do lead, {{2}} = produto'."),
});

const SYSTEM = `Você é um especialista em templates do WhatsApp Business da Meta para um produto de consórcio chamado Aja Agora.

Regras inflexíveis:
- "name" em snake_case minúsculo, descritivo (ex: lembrete_simulacao).
- "category": use UTILITY para lembretes, follow-ups, notificações transacionais. MARKETING para promocional/desconto. AUTHENTICATION só para OTP.
- "bodyText" em pt-BR, tom humano e cordial, evita gírias e exclamações em excesso. NUNCA prometa retorno financeiro garantido nem use termos de "investimento" — é consórcio, não investimento.
- Use placeholders {{1}}, {{2}}... apenas quando necessário (ex: nome do lead). Sequencial a partir de {{1}}.
- "footerText" opcional, máx 60 caracteres.
- NÃO inclua "Olá [nome]" como texto fixo — se quer saudação personalizada, use {{1}}.

Saída: JSON com name, category, bodyText, footerText (opcional), placeholdersDescription (opcional).`;

export async function POST(req: Request) {
	const { error } = await requireRole("admin", "attendant");
	if (error) return error;

	const body = (await req.json().catch(() => ({}))) as { prompt?: string };
	const prompt = body.prompt?.trim();
	if (!prompt) {
		return NextResponse.json({ error: "PROMPT_REQUIRED" }, { status: 400 });
	}

	try {
		const result = await generateObject({
			model: anthropic(process.env.AI_MODEL ?? "claude-sonnet-4-6"),
			schema: TemplateSuggestionSchema,
			system: SYSTEM,
			prompt: `Gere um template WhatsApp para: ${prompt}`,
			maxOutputTokens: 800,
		});
		return NextResponse.json(result.object);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[ai-suggest] failed:", msg);
		return NextResponse.json({ error: "AI_FAILED", message: msg }, { status: 500 });
	}
}
