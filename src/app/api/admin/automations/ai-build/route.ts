/**
 * AI Builder de automação.
 * Admin descreve em linguagem natural → Claude gera grafo válido.
 * Grafo é validado contra Zod e estrutura antes de devolver.
 *
 * Cobre CA-P0-03 + CA-P1-11 do TEST-PLAN.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { STAGE_ORDER } from "@/lib/admin/lead-stages";
import { requireRole } from "@/lib/admin/require-role";
import { validateGraphStructure } from "@/lib/automation/schema";

// Schema de saída esperado do LLM. Cada tipo de node tem schema próprio
// (discriminated union por `type`) → o provider força o LLM a preencher
// os campos certos pra cada tipo. Sem isso, LLM "esquece" toStages,
// durationMs, etc. e o save explode com VALIDATION_ERROR.

const LeadStageVals = ["novo", "engajado", "qualificado", "em_negociacao", "proposta_enviada", "fechado_ganho", "perdido"] as const;
const StageEnum = z.enum(LeadStageVals);

const AiNodeSchema = z.discriminatedUnion("type", [
	z.object({
		id: z.string().min(1),
		type: z.literal("trigger.stage_changed"),
		config: z.object({
			fromStages: z.array(StageEnum).optional(),
			toStages: z.array(StageEnum).min(1),
		}),
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("trigger.idle_in_stage"),
		config: z.object({
			stage: StageEnum,
			durationMs: z.number().int().positive(),
		}),
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("trigger.chat_event"),
		config: z.object({
			eventType: z.enum(["no_reply", "asked_for_human"]),
		}),
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("condition.has_field"),
		config: z.object({
			field: z.enum(["email", "phone", "name"]),
			op: z.enum(["is_set", "is_empty"]),
		}),
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("condition.recently_received"),
		config: z.object({
			channel: z.enum(["whatsapp", "web"]),
			withinMs: z.number().int().positive(),
		}),
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("action.send_whatsapp"),
		config: z.discriminatedUnion("mode", [
			z.object({
				mode: z.literal("template"),
				templateName: z.string().min(1),
				params: z.record(z.string(), z.string()).default({}),
			}),
			z.object({ mode: z.literal("free_text"), text: z.string().min(1) }),
		]),
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("action.send_email"),
		config: z.object({
			subject: z.string().min(1).max(200),
			html: z.string().min(1),
		}),
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("action.move_to_stage"),
		config: z.object({ stage: StageEnum }),
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("action.add_note"),
		config: z.object({ text: z.string().min(1) }),
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("wait"),
		config: z.object({ durationMs: z.number().int().positive() }),
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("end"),
		config: z.object({}),
	}),
]);

const AiEdgeSchema = z.object({
	id: z.string().min(1),
	source: z.string().min(1),
	target: z.string().min(1),
	label: z.string().optional(),
});

const AiGraphResponseSchema = z.object({
	triggerType: z.enum(["stage_changed", "idle_in_stage", "chat_event"]),
	graph: z.object({
		nodes: z.array(AiNodeSchema).min(2),
		edges: z.array(AiEdgeSchema),
	}),
});

const SYSTEM = `Você é o construtor de automações de funil do Aja Agora (plataforma B2C de consórcio).

Sua tarefa: dado um pedido em PT-BR, gere um grafo de automação JSON válido.

Tipos de node disponíveis:
- "trigger.stage_changed": config { fromStages?: stage[], toStages: stage[] }
- "trigger.idle_in_stage": config { stage: stage, durationMs: number }
- "trigger.chat_event": config { eventType: "no_reply" | "asked_for_human" }
- "condition.has_field": config { field: "email"|"phone"|"name", op: "is_set"|"is_empty" }
- "condition.recently_received": config { channel: "whatsapp"|"web", withinMs: number }
- "action.send_whatsapp": config { mode: "template"|"free_text", templateName?: string, params?: object, text?: string }
- "action.send_email": config { subject: string, html: string }
- "action.move_to_stage": config { stage: stage }
- "action.add_note": config { text: string }
- "wait": config { durationMs: number }
- "end": config {}

Stages válidos: ${STAGE_ORDER.join(", ")}.

Regras invioláveis:
1. Sempre 1 trigger e pelo menos 1 end.
2. Grafo deve ser DAG (sem ciclos).
3. Todo caminho do trigger leva a um end.
4. send_whatsapp em modo template SÓ se for plausível admin ter um template cadastrado; caso contrário, sugira send_email ou modo free_text com observação na descrição. Para WhatsApp fora da janela 24h, exigir template.
5. NÃO invente actions que não existem (ex: delete_leads, http_call) — você só tem as listadas.
6. Use durationMs em milissegundos: 1h = 3600000, 1d = 86400000.
7. IDs de nodes/edges curtos (n1, n2, e1, e2...).
8. Para condition, os edges precisam de label "true" e "false".

Se o pedido for ambíguo, malicioso ou impossível, retorne grafo mínimo trigger→end com action.add_note explicando.

## EXEMPLO DE GRAFO VÁLIDO (referência obrigatória)

Pedido: "Quando lead entrar em novo, mandar email se tiver, senão WhatsApp."

\`\`\`json
{
  "triggerType": "stage_changed",
  "graph": {
    "nodes": [
      { "id": "n1", "type": "trigger.stage_changed", "config": { "toStages": ["novo"] } },
      { "id": "n2", "type": "condition.has_field", "config": { "field": "email", "op": "is_set" } },
      { "id": "n3", "type": "action.send_email", "config": { "subject": "Bem-vindo ao Aja Agora", "html": "<p>Olá {{lead.name}}, conta com a gente!</p>" } },
      { "id": "n4", "type": "action.send_whatsapp", "config": { "mode": "free_text", "text": "Olá {{lead.name}}, recebemos seu interesse!" } },
      { "id": "n5", "type": "end", "config": {} }
    ],
    "edges": [
      { "id": "e1", "source": "n1", "target": "n2" },
      { "id": "e2", "source": "n2", "target": "n3", "label": "true" },
      { "id": "e3", "source": "n2", "target": "n4", "label": "false" },
      { "id": "e4", "source": "n3", "target": "n5" },
      { "id": "e5", "source": "n4", "target": "n5" }
    ]
  }
}
\`\`\`

Note: trigger SEMPRE tem \`toStages\` (array). Condition SEMPRE tem 2 edges com label "true"/"false". Todo path leva a \`end\`. End tem \`config: {}\` literal. \`send_whatsapp.config\` tem campo \`mode\` discriminator.`;

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
			schema: AiGraphResponseSchema,
			system: SYSTEM,
			prompt: `Pedido do admin: ${prompt}\n\nGere o grafo JSON.`,
			maxOutputTokens: 1500,
		});

		const out = result.object;
		// Atribui posições x/y se vierem sem (LLM costuma omitir)
		out.graph.nodes = out.graph.nodes.map((n, idx) => ({
			...n,
			...(((n as { position?: unknown }).position
				? {}
				: { position: { x: 80 + idx * 240, y: 120 } }) as object),
		}));

		const structure = validateGraphStructure(out.graph);
		if (!structure.ok) {
			return NextResponse.json(
				{ error: "INVALID_GRAPH", message: structure.error, raw: out },
				{ status: 422 },
			);
		}
		return NextResponse.json(out);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[ai-build] failed:", msg);
		return NextResponse.json({ error: "AI_FAILED", message: msg }, { status: 500 });
	}
}
