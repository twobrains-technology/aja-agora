"use client";

import type { Node as RFNode } from "@xyflow/react";
import {
	addEdge,
	Background,
	type Connection,
	Controls,
	type Edge,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

type Node = RFNode<{ label: string; config: Record<string, unknown>; nodeType: string }>;
import "@xyflow/react/dist/style.css";
import { History, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AutomationGraph } from "@/lib/automation/schema";
import { AutomationAiDialog } from "./automation-ai-dialog";
import { AutomationNodeConfigSheet } from "./node-config-sheet";
import { AutomationNodePalette } from "./node-palette";

type StoredAutomation = {
	id: string;
	name: string;
	description: string | null;
	triggerType: "stage_changed" | "idle_in_stage" | "chat_event";
	triggerConfig: Record<string, unknown>;
	graph: AutomationGraph;
	enabled: boolean;
	version: number;
};

interface ShellProps {
	mode: "new" | "edit";
	initial?: StoredAutomation;
	initialAiOpen?: boolean;
}

const STAGE_X = 100;
const STAGE_Y = 100;

export function AutomationEditorShell(props: ShellProps) {
	return (
		<ReactFlowProvider>
			<AutomationEditor {...props} />
		</ReactFlowProvider>
	);
}

function AutomationEditor({ mode, initial, initialAiOpen }: ShellProps) {
	const router = useRouter();
	const [name, setName] = useState(initial?.name ?? "");
	const [enabled, setEnabled] = useState(initial?.enabled ?? false);
	const [version, setVersion] = useState(initial?.version ?? 1);
	const [aiOpen, setAiOpen] = useState(Boolean(initialAiOpen));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

	const initialFlowNodes = useMemo<Node[]>(() => {
		if (!initial) {
			return [
				{
					id: "trigger-1",
					type: "default",
					data: {
						label: "Trigger: stage_changed",
						config: { toStages: ["qualificado"] },
						nodeType: "trigger.stage_changed",
					},
					position: { x: STAGE_X, y: STAGE_Y },
				},
				{
					id: "end-1",
					type: "default",
					data: { label: "End", config: {}, nodeType: "end" },
					position: { x: STAGE_X + 350, y: STAGE_Y },
				},
			];
		}
		return initial.graph.nodes.map((n) => ({
			id: n.id,
			type: "default",
			data: { label: labelForType(n.type), config: n.config, nodeType: n.type },
			position: n.position ?? { x: STAGE_X, y: STAGE_Y },
		}));
	}, [initial]);

	const initialFlowEdges = useMemo<Edge[]>(() => {
		if (!initial) return [{ id: "e-1", source: "trigger-1", target: "end-1" }];
		return initial.graph.edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			label: e.label,
		}));
	}, [initial]);

	const [nodes, setNodes, onNodesChange] = useNodesState(initialFlowNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlowEdges);

	const onConnect = useCallback(
		(connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
		[setEdges],
	);

	const handleAddNode = useCallback(
		(nodeType: string, configDefault: Record<string, unknown>) => {
			const id = `node-${Date.now()}`;
			setNodes((nds) => [
				...nds,
				{
					id,
					type: "default",
					data: { label: labelForType(nodeType), config: configDefault, nodeType },
					position: { x: STAGE_X + Math.random() * 400, y: STAGE_Y + Math.random() * 200 },
				},
			]);
		},
		[setNodes],
	);

	const applyAiGraph = useCallback(
		(g: AutomationGraph, triggerType: StoredAutomation["triggerType"]) => {
			setNodes(
				g.nodes.map((n, i) => ({
					id: n.id,
					type: "default",
					data: { label: labelForType(n.type), config: n.config, nodeType: n.type },
					position: n.position ?? { x: STAGE_X + i * 220, y: STAGE_Y },
				})),
			);
			setEdges(
				g.edges.map((e) => ({
					id: e.id,
					source: e.source,
					target: e.target,
					label: e.label,
				})),
			);
			void triggerType;
		},
		[setNodes, setEdges],
	);

	const updateNodeConfig = useCallback(
		(nodeId: string, config: Record<string, unknown>) => {
			setNodes((nds) =>
				nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, config } } : n)),
			);
		},
		[setNodes],
	);

	const activeNode = useMemo(
		() => (activeNodeId ? (nodes.find((n) => n.id === activeNodeId) ?? null) : null),
		[activeNodeId, nodes],
	);

	async function handleSave() {
		setSaving(true);
		setError(null);
		const graph: AutomationGraph = {
			nodes: nodes.map((n) => {
				const d = n.data as { nodeType: string; config: Record<string, unknown> };
				return {
					id: n.id,
					type: d.nodeType,
					config: d.config,
					position: { x: n.position.x, y: n.position.y },
				};
			}) as AutomationGraph["nodes"],
			edges: edges.map((e) => ({
				id: e.id,
				source: e.source,
				target: e.target,
				label: typeof e.label === "string" ? e.label : undefined,
			})),
		};

		const triggerNode = graph.nodes.find((n) => n.type.startsWith("trigger."));
		const triggerType = (triggerNode?.type.replace("trigger.", "") ??
			"stage_changed") as StoredAutomation["triggerType"];
		const triggerConfig = (triggerNode?.config ?? { toStages: ["qualificado"] }) as Record<
			string,
			unknown
		>;

		try {
			if (mode === "new") {
				const res = await fetch("/api/admin/automations", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: name || "Sem nome",
						triggerType,
						triggerConfig,
						graph,
						enabled,
					}),
				});
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					throw new Error(data.message || data.error || `HTTP ${res.status}`);
				}
				const row = (await res.json()) as { id: string };
				router.push(`/admin/automations/${row.id}`);
			} else if (initial) {
				const res = await fetch(`/api/admin/automations/${initial.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name,
						triggerType,
						triggerConfig,
						graph,
						enabled,
						version,
					}),
				});
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					throw new Error(data.message || data.error || `HTTP ${res.status}`);
				}
				const row = (await res.json()) as { version: number };
				setVersion(row.version);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
				<Input
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Nome da automação"
					className="max-w-sm"
				/>
				<label className="flex items-center gap-2 text-sm">
					<input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
					Ativada
				</label>
				<div className="ml-auto flex items-center gap-2">
					{mode === "edit" && initial ? (
						<Button
							variant="ghost"
							size="sm"
							render={<Link href={`/admin/automations/${initial.id}/runs`} />}
						>
							<History className="size-3.5" />
							Runs
						</Button>
					) : null}
					<Button variant="outline" onClick={() => setAiOpen(true)}>
						<Sparkles className="size-3.5" />
						IA
					</Button>
					<Button onClick={handleSave} disabled={saving || !name}>
						{saving ? "Salvando..." : "Salvar"}
					</Button>
				</div>
			</div>

			{error ? (
				<div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
					{error}
				</div>
			) : null}

			<div className="flex h-[640px] gap-3 rounded-lg border bg-card">
				<AutomationNodePalette onAdd={handleAddNode} />
				<div className="flex-1">
					<ReactFlow
						nodes={nodes}
						edges={edges}
						onNodesChange={onNodesChange}
						onEdgesChange={onEdgesChange}
						onConnect={onConnect}
						onNodeClick={(_, n) => setActiveNodeId(n.id)}
						fitView
					>
						<Background />
						<Controls />
						<MiniMap />
					</ReactFlow>
				</div>
			</div>

			<AutomationAiDialog
				open={aiOpen}
				onOpenChange={setAiOpen}
				onApply={(graph, triggerType) => {
					applyAiGraph(graph, triggerType);
					setAiOpen(false);
				}}
			/>

			<AutomationNodeConfigSheet
				node={activeNode}
				onClose={() => setActiveNodeId(null)}
				onSave={(config) => {
					if (activeNodeId) updateNodeConfig(activeNodeId, config);
					setActiveNodeId(null);
				}}
			/>
		</div>
	);
}

function labelForType(type: string): string {
	const map: Record<string, string> = {
		"trigger.stage_changed": "Trigger · Stage mudou",
		"trigger.idle_in_stage": "Trigger · Lead parado",
		"trigger.chat_event": "Trigger · Evento chat",
		"condition.has_field": "Condição · Campo preenchido",
		"condition.recently_received": "Condição · Recebeu recente",
		"action.send_whatsapp": "Ação · Enviar WhatsApp",
		"action.send_email": "Ação · Enviar Email",
		"action.move_to_stage": "Ação · Mover stage",
		"action.add_note": "Ação · Adicionar nota",
		wait: "Esperar",
		end: "Fim",
	};
	return map[type] ?? type;
}
