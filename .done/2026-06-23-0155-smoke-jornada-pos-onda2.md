# Done Report — Smoke ao vivo da jornada (pós-merge onda 2)

**Data:** 2026-06-23 01:55 · **Branch:** develop (`0460c42a`) · **Ambiente:** `http://aja-develop.orb.local` (Bevi REAL, gateway=bevi)
**Tipo:** smoke E2E ao vivo (navegação no chat via Playwright, "como o cliente"), pós-merge dos blocos fix-resimula-faixa-reveal + sweep-multifaixa.

## O que foi validado (a jornada de verdade, com Bevi real)

Naveguei a jornada como um cliente real navegaria — sem mock, descoberta real na Bevi com identidade verdadeira. Cobertura:

| Passo (docx) | O que rodou | Resultado |
|---|---|---|
| 1 · Necessidade + nome | "Quero trocar de carro" → card de nome → "Maria" | ✅ |
| 2 · Cliente (qualify + educação + identidade) | experiência ("primeira vez") → educação do consórcio → card de CPF/celular + LGPD → identidade aceita | ✅ |
| 3-4 · Descoberta + simular + revelar | descoberta REAL na Bevi (256k, "receber rápido") → **recomendação BANCO DO BRASIL** (R$ 284k / 72m / R$ 5.138,92/mês / 21 contemplados) + simulação com lance 60,44% + decision prompt | ✅ (~18s) |
| 5 · Contratar | NÃO submetido (gateway=bevi cria proposta real) + bloqueado pelo bug residual abaixo | ⏭️ fora de escopo |

## 🎯 O ponto central: o bug da Maria está corrigido (validado AO VIVO)

O bug que você viu nos logs — cliente troca de faixa de valor depois de ver a 1ª cota e o agente trava em "instabilidade" — **acabou**. Reproduzi o cenário exato e o fix segurou:

- **"Na verdade, quero ver opções de R$ 130 mil"** → o agente **re-buscou na Bevi** e recomendou **ITAÚ** (R$ 150k / 50m). ✅
- **"E se fosse R$ 180 mil?"** → re-buscou de novo → **comparison_table com 3 grupos** (BB / Itaú / Rodobens). ✅
- **Duas trocas seguidas, zero "instabilidade", zero loop, zero alucinação.** O bug original travava já na 1ª troca e repetia 6×.

Evidência: `smoke-01-reveal-256k-bb.png`, `smoke-02-troca-faixa-130k-itau.png`, `smoke-03-troca-180k-comparison.png` (na raiz do repo).

## Bug residual encontrado (anotado, não corrigido)

Ao **escolher um grupo específico** da comparison_table ("quero o Banco do Brasil"), o agente fabricou o id `bb-auto-200k-72m` (mesmo vício do `auto-130k-60m` da Maria) e a simulação falhou — *"esse grupo deu um problema agora"*.

- **Mesmo root cause do fix que entrou, caminho diferente:** o fix-68 cobriu a re-busca por **troca de valor** (validado); não cobriu a **seleção de um grupo já listado**.
- **Melhorou mesmo assim:** o agente **degradou com elegância** (ofereceu a 2ª opção) em vez de entrar no loop infinito da Maria — o fix reduziu o estrago até no caminho não coberto.
- Anotado em `docs/correcoes/inbox/bug-simulate-grupo-comparison-id-fabricado.md` (candidato a FIX-71): expor o quotaId real nos cards + resolver a escolha server-side em vez de depender da LLM copiar o hash.

## Observação de qualidade (positiva)

O **sweep multi-faixa** (a evolução da recomendação) está vivo como opt-in por chamada de tool — o agente o acionou ao buscar várias opções e o **circuit breaker funcionou** (`budget_exhausted, swept 2 de 3 faixas`), sem travar a jornada. Vale só calibrar se 2 de 3 faixas bastam (a Bevi é lenta).

## Gaps honestos

- **Passo 5 (contratação) não foi exercido** — gateway=bevi criaria proposta real; e ficou bloqueado pelo bug residual de seleção de grupo. Fica pra um smoke dedicado com CPF de teste descartável.
- **Não virou teste automatizado** — foi smoke manual-like ao vivo. O cenário "escolher grupo da comparison" merece cassette (Camada 2) quando o FIX-71 for feito.
- **Latência real da Bevi:** descoberta ~18s, re-busca ~28-43s. Aceitável pra dev, mas confirma a necessidade do spike (FIX-69) antes de escalar o sweep.

## Veredito

A entrega da onda 2 **resolve o problema que dava a cara** (cliente preso ao trocar de faixa) e a jornada flui de ponta a ponta até a decisão, com dados reais da Bevi. Sobra um caso irmão (escolher grupo da lista) que cai no mesmo conserto e já está na fila.
