# Plano — vendedor livre (B1)

Mandato: `docs/design/2026-10-20-mandato-vendedor-livre.md`.

## Decisões de engenharia deste bloco

1. **Motor novo ao lado do velho.** `pi/turno-livre.ts` só entra quando
   `AGENTE_LIVRE=1`. O turno atual continua intacto até o B3 — não existe janela quebrada.
2. **Skills lidas do disco, não do SDK.** O `loadSkillsFromDir` do pi vive no pacote ESM
   (mesmo problema do `require` que já custou um turno mudo). Aqui as skills são dois `.md`
   versionados em `src/lib/agent/pi/skills/`, lidos com `node:fs`, com frontmatter parseado
   no nosso código (20 linhas). O texto injetado é idêntico ao que o SDK produziria.
   Os `.md` entram na imagem por `outputFileTracingIncludes` (conferir no `.next/standalone`).
3. **Tools que gravam.** `buscar_cartas` (identidade da casa), `fazer_proposta` (identidade
   do cliente, cifrada no servidor), `falar_com_humano`, `save_contact_name`. Nenhuma
   `present_*`.
4. **Card por resultado.** `buscar_cartas` → um `comparison_table`; `fazer_proposta` →
   `real_offer`. O modelo recebe resumo compacto; o payload cheio vai só para o card.
5. **CPF nunca chega ao modelo.** Captura no servidor antes do beat: `storeIdentity` +
   texto mascarado + linha "[CPF recebido e guardado]".
6. **Persist enxuto** reusando o que é fato: `saveMessage` (dois balões por
   `text-boundary`), `registrarCardEnviado`, `persistMeta` antes do artifact, nome do
   contato, `lead-stage`, `turno-do-cliente`, `uso_de_ia`.

## Ordem de execução

1. skills (2 `.md`) + loader;
2. `persist-livre.ts`;
3. `tools-livres.ts`;
4. `turno-livre.ts`;
5. fiação em `orchestrator/index.ts` (flag) + `next.config.ts` (tracing);
6. verificação: typecheck · vitest `src/lib/agent/pi` · `scripts/smoke-pi.ts` com a flag.

## O que NÃO se toca aqui

`persist.ts`, `turno.ts`, `route`, `emit-card`, canais e workers: o B3 apaga depois que o
motor novo fecha a ponta nos dois canais.