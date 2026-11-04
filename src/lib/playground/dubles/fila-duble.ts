// Dublê da fila de vendedores (simulação F4): registra chamadas, sem rede nem DB.
import type { FilaDuble } from "../simulacao/tipos";

export type ChamadaDaFila = { conversationId: string; resumo: string; quando: string };
export type FilaDubleConfig = { atendentes: number; horaFixa?: string; agora?: () => Date };
export type { FilaDuble };

export function criarFilaDuble(cfg: FilaDubleConfig) {
	const registro: ChamadaDaFila[] = [];
	const agora = cfg.agora ?? (() => new Date());
	return {
		chamar(c: Omit<ChamadaDaFila, "quando">): { notificados: number; semAtendentes: boolean } {
			registro.push({ ...c, quando: agora().toISOString() });
			return { notificados: cfg.atendentes, semAtendentes: cfg.atendentes <= 0 };
		},
		chamadas(): readonly ChamadaDaFila[] {
			return registro;
		},
		atendentes(): number {
			return cfg.atendentes;
		},
		horaLocal(): string | null {
			return cfg.horaFixa ?? null;
		},
	};
}
