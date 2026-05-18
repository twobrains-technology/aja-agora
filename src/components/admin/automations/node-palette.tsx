"use client";

import { Button } from "@/components/ui/button";

type PaletteItem = {
	label: string;
	nodeType: string;
	defaults: Record<string, unknown>;
	group: "Trigger" | "Condition" | "Action" | "Flow";
};

const ITEMS: PaletteItem[] = [
	{
		label: "Stage mudou",
		nodeType: "trigger.stage_changed",
		defaults: { toStages: ["qualificado"] },
		group: "Trigger",
	},
	{
		label: "Lead parado",
		nodeType: "trigger.idle_in_stage",
		defaults: { stage: "qualificado", durationMs: 24 * 3600_000 },
		group: "Trigger",
	},
	{
		label: "Tem email",
		nodeType: "condition.has_field",
		defaults: { field: "email", op: "is_set" },
		group: "Condition",
	},
	{
		label: "Recebeu recente",
		nodeType: "condition.recently_received",
		defaults: { channel: "whatsapp", withinMs: 24 * 3600_000 },
		group: "Condition",
	},
	{
		label: "Enviar WhatsApp",
		nodeType: "action.send_whatsapp",
		defaults: { mode: "template", templateName: "", params: {} },
		group: "Action",
	},
	{
		label: "Enviar Email",
		nodeType: "action.send_email",
		defaults: { subject: "Assunto", html: "<p>Olá {{lead.name}},</p>" },
		group: "Action",
	},
	{
		label: "Mover stage",
		nodeType: "action.move_to_stage",
		defaults: { stage: "qualificado" },
		group: "Action",
	},
	{
		label: "Adicionar nota",
		nodeType: "action.add_note",
		defaults: { text: "Nota gerada automaticamente." },
		group: "Action",
	},
	{ label: "Esperar", nodeType: "wait", defaults: { durationMs: 2 * 3600_000 }, group: "Flow" },
	{ label: "Fim", nodeType: "end", defaults: {}, group: "Flow" },
];

const GROUPS: Array<PaletteItem["group"]> = ["Trigger", "Condition", "Action", "Flow"];

interface Props {
	onAdd: (nodeType: string, defaults: Record<string, unknown>) => void;
}

export function AutomationNodePalette({ onAdd }: Props) {
	return (
		<div className="w-56 shrink-0 border-r bg-muted/30 p-3 space-y-3 overflow-y-auto">
			<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				Paleta
			</div>
			{GROUPS.map((group) => (
				<div key={group} className="space-y-1.5">
					<div className="text-xs font-semibold">{group}</div>
					{ITEMS.filter((i) => i.group === group).map((item) => (
						<Button
							key={item.nodeType}
							variant="outline"
							size="sm"
							className="w-full justify-start"
							onClick={() => onAdd(item.nodeType, item.defaults)}
						>
							+ {item.label}
						</Button>
					))}
				</div>
			))}
		</div>
	);
}
