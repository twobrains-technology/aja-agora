"use client";

import { CATALOGO_IDS, rotuloDoCatalogo } from "@/lib/playground/dubles/catalogos";
import type { CatalogoId, DadosDaSimulacao, FonteDeDados } from "@/lib/playground/simulacao/tipos";

type Props = {
	valor: DadosDaSimulacao;
	aoMudar: (d: DadosDaSimulacao) => void;
	desabilitado?: boolean;
};

export function rotuloDaFonte(f: FonteDeDados): string {
	return f === "duble" ? "Fonte: Dublê" : "Fonte: Bevi da dev";
}

export function SeletorDeDados({ valor, aoMudar, desabilitado }: Props) {
	const duble = valor.fonteDeDados === "duble";
	return (
		<fieldset className="space-y-2 rounded border p-2 text-sm" disabled={desabilitado}>
			<legend className="px-1 text-xs font-medium">
				Dados da simulação · {rotuloDaFonte(valor.fonteDeDados)}
			</legend>
			<label className="flex items-center gap-2">
				<span className="w-24">Fonte</span>
				<select
					className="rounded border px-1 py-0.5"
					value={valor.fonteDeDados}
					onChange={(e) => aoMudar({ ...valor, fonteDeDados: e.target.value as FonteDeDados })}
				>
					<option value="duble">Dublê da Bevi (reproduzível)</option>
					<option value="bevi-dev">Bevi da dev</option>
				</select>
			</label>
			<label className="flex items-center gap-2">
				<span className="w-24">Catálogo</span>
				<select
					className="rounded border px-1 py-0.5"
					disabled={!duble}
					value={valor.catalogo}
					onChange={(e) => aoMudar({ ...valor, catalogo: e.target.value as CatalogoId })}
				>
					{CATALOGO_IDS.map((id) => (
						<option key={id} value={id}>
							{rotuloDoCatalogo(id)}
						</option>
					))}
				</select>
				{!duble ? <span className="text-xs">(ignorado na Bevi da dev)</span> : null}
			</label>
			<label className="flex items-center gap-2">
				<span className="w-24">Fila</span>
				<select
					className="rounded border px-1 py-0.5"
					disabled={!duble}
					value={valor.fila.atendentes}
					onChange={(e) =>
						aoMudar({ ...valor, fila: { ...valor.fila, atendentes: Number(e.target.value) } })
					}
				>
					<option value={0}>0 atendentes</option>
					<option value={2}>2 atendentes</option>
				</select>
			</label>
			<label className="flex items-center gap-2">
				<span className="w-24">Hora fixa</span>
				<input
					type="time"
					className="rounded border px-1 py-0.5"
					disabled={!duble}
					value={valor.fila.horaFixa ?? ""}
					onChange={(e) =>
						aoMudar({
							...valor,
							fila: { ...valor.fila, horaFixa: e.target.value || undefined },
						})
					}
				/>
				<span className="text-xs">(opcional)</span>
			</label>
		</fieldset>
	);
}
