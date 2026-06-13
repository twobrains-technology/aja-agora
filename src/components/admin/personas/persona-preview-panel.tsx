"use client";

import { Loader2, Send } from "lucide-react";
import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const SAMPLE_MAX = 500;

type PreviewResult = { text: string; modelLatencyMs: number };

type ValidationDetails = {
	formErrors?: string[];
	fieldErrors?: Record<string, string[] | undefined>;
};

export function PersonaPreviewPanel({ personaId }: { personaId?: string }) {
	const { getValues } = useFormContext();
	const [sample, setSample] = useState("olá, gostaria de saber mais");
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<PreviewResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [errorDetails, setErrorDetails] = useState<ValidationDetails | null>(null);

	async function runPreview() {
		setError(null);
		setErrorDetails(null);
		setResult(null);
		setLoading(true);
		try {
			const formValues = getValues();
			const url = personaId
				? `/api/admin/personas/${personaId}/preview`
				: "/api/admin/personas/preview";
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...formValues, sampleMessage: sample }),
			});
			const body = (await res.json()) as Partial<PreviewResult> & {
				error?: string;
				details?: ValidationDetails;
			};
			if (!res.ok) {
				setError(body.error ?? `HTTP ${res.status}`);
				setErrorDetails(body.details ?? null);
				return;
			}
			setResult({ text: body.text ?? "", modelLatencyMs: body.modelLatencyMs ?? 0 });
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Testar conversa</CardTitle>
				<CardDescription>
					Roda a persona com os valores do form sem salvar. Use pra ver como o tom muda antes de
					publicar.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="space-y-1.5">
					<Textarea
						rows={3}
						maxLength={SAMPLE_MAX}
						value={sample}
						onChange={(e) => setSample(e.target.value)}
						placeholder="Mensagem do cliente..."
					/>
					<div className="flex items-center justify-between">
						<span className="text-xs text-muted-foreground">
							{sample.length}/{SAMPLE_MAX}
						</span>
						<Button
							type="button"
							onClick={runPreview}
							disabled={loading || sample.trim().length === 0}
							size="sm"
						>
							{loading ? (
								<Loader2 className="size-3.5 animate-spin" />
							) : (
								<Send className="size-3.5" />
							)}
							Testar
						</Button>
					</div>
				</div>

				{error && (
					<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-1.5">
						<div>{error}</div>
						{errorDetails &&
							((errorDetails.formErrors?.length ?? 0) > 0 ||
								Object.keys(errorDetails.fieldErrors ?? {}).length > 0) && (
								<ul className="list-disc pl-4 text-xs">
									{errorDetails.formErrors?.map((msg, i) => (
										<li key={`f-${i}`}>{msg}</li>
									))}
									{Object.entries(errorDetails.fieldErrors ?? {}).map(([field, msgs]) =>
										(msgs ?? []).map((msg, i) => (
											<li key={`${field}-${i}`}>
												<span className="font-medium">{field}:</span> {msg}
											</li>
										)),
									)}
								</ul>
							)}
					</div>
				)}

				{result && (
					<div className="rounded-md border bg-muted/30 p-3 space-y-2">
						<div className="text-xs text-muted-foreground">
							Resposta da AI · {result.modelLatencyMs}ms
						</div>
						<div className="text-sm whitespace-pre-wrap">
							{result.text || <span className="text-muted-foreground italic">(vazio)</span>}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
