// Smoke da Conversions API: dispara UM evento sintético pelo adapter de verdade.
//
// Run: META_CAPI_TEST_EVENT_CODE=TESTxxxxx npx tsx src/scripts/smoke-capi.ts
//
// Usa `montarPayload`/`enviarParaMeta` do próprio produto, e não um curl à
// parte: um curl provaria que a Meta aceita ALGUM payload, não que aceita o
// NOSSO. O que se quer saber aqui é se o adapter está certo.
//
// Sem `META_CAPI_TEST_EVENT_CODE` o script se recusa a rodar: sem o código, o
// evento sintético entraria na conta real e viraria sinal de campanha — um
// contrato que não existe ensinando o algoritmo.

import { getConversionsConfig } from "../lib/conversions/config";
import { hashEmail, hashPhone } from "../lib/conversions/hash";
import { type EventoParaEnvio, enviarParaMeta, montarPayload } from "../lib/conversions/meta-capi";

async function main() {
	const cfg = getConversionsConfig();

	if (!cfg.testEventCode) {
		console.error(
			"Recuse-se a sujar a conta: defina META_CAPI_TEST_EVENT_CODE (aba 'Testar eventos').",
		);
		process.exit(1);
	}
	if (!cfg.pixelId || !cfg.accessToken) {
		console.error("Faltam META_PIXEL_ID e/ou META_CAPI_ACCESS_TOKEN.");
		process.exit(1);
	}

	const agora = new Date();
	const evento: EventoParaEnvio = {
		id: "smoke",
		eventName: "lead_qualificado",
		eventKey: `smoke-${Math.floor(agora.getTime() / 1000)}:lead_qualificado`,
		occurredAt: agora,
		value: "50000",
		currency: "BRL",
		hashedEmail: hashEmail("smoke.teste@ajaagora.com.br"),
		hashedPhone: hashPhone("+5511999999999"),
		fbc: null,
		fbp: null,
		ctwaClid: null,
		actionSource: "website",
	};

	const payload = montarPayload([evento], cfg);
	console.log("Payload que sai daqui (o mesmo do produto):");
	console.log(JSON.stringify(payload, null, 2));

	const resultado = await enviarParaMeta([evento], cfg);
	console.log(
		resultado.ok
			? `\n✓ ACEITO pela Meta — veja em Testar eventos (código ${cfg.testEventCode})`
			: `\n✗ RECUSADO: ${resultado.erro}`,
	);
	process.exit(resultado.ok ? 0 : 1);
}

main().catch((err) => {
	console.error("Falhou:", err);
	process.exit(1);
});
