// Quais variáveis de ambiente um cenário do golden-set realmente exige.
//
// Existe porque o gate mentiu. Em 2026-08-13, `pnpm eval` reportou
// `golden-fecho-nao-anda-pra-tras` como **FAIL** — "turno 6 esperava
// comparison_table, veio gate:identify". O produto não tinha defeito nenhum
// naquele turno: o cenário manda `"cpf": "${E2E_TEST_CPF}"`, a variável não
// estava definida, o runner expandiu para **string vazia** e enviou um CPF
// vazio à administradora. O funil, corretamente, voltou a pedir identidade.
//
// Os outros 8 cenários da suíte declaram `requiresEnv` no JSON e são pulados;
// este esqueceu de declarar. É a falha clássica de invariante que depende de
// alguém lembrar: o dado necessário JÁ ESTÁ no texto do cenário (`${VAR}`), e
// mesmo assim exigíamos que fosse repetido à mão numa segunda lista.
//
// Um FAIL falso custa mais caro que um teste ausente: manda consertar produto
// que não está quebrado, e queima a confiança no gate inteiro. A regra da casa
// para isso já existia e foi violada aqui: **inconclusivo ≠ veredito** — o
// runner deve PULAR com aviso alto, nunca reprovar.

/** Toda `${VAR}` citada no cenário, na ordem em que aparece, sem repetição. */
export function variaveisCitadas(cenarioSerializado: string): string[] {
	const nomes = new Set<string>();
	for (const m of cenarioSerializado.matchAll(/\$\{([A-Z0-9_]+)\}/g)) nomes.add(m[1]);
	return [...nomes];
}

/**
 * As envs que faltam para o cenário rodar de verdade — a união do que o JSON
 * declarou (`requiresEnv`) com o que o TEXTO cita. A segunda fonte é a que não
 * depende de disciplina humana.
 */
export function envsFaltando(args: {
	cenarioSerializado: string;
	declaradas?: string[];
	ambiente: Record<string, string | undefined>;
}): string[] {
	const exigidas = new Set([
		...(args.declaradas ?? []),
		...variaveisCitadas(args.cenarioSerializado),
	]);
	return [...exigidas].filter((nome) => !args.ambiente[nome]?.trim());
}
