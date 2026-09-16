// Compatibilidade para versões de frontend em cache. ChatOpened é diagnóstico
// client-side; a CAPI V2 só nasce após uma mensagem humana persistida.
import type { NextRequest } from "next/server";

export async function POST(_req: NextRequest) {
	return new Response(null, { status: 204 });
}
