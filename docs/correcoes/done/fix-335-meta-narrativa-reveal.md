---
id: FIX-335
titulo: "Meta-narrativa no reveal: 'Agora vou te recomendar a mais adequada', 'Agora vou detalhar como fica sua simulação'"
status: done
bloco: bloco-b-reveal-web
arquivos:
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/sanitizer.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
executado_em: 2026-07-14
---

# FIX-335 — o agente narra o próprio pipeline

## Cenário (4/4 dossiês web)
> "Encontramos 23 boas opções pra você! **Agora vou te recomendar a mais adequada:**"
> "**Agora vou detalhar como fica sua simulação:**"

Soa como log de execução, não como gente vendendo. O juiz: *"as 4 conversas soam como um log
de pipeline"*.

## Root cause
O prompt já proíbe narrar mecânica ("vou buscar", "deixa eu usar a ferramenta"), e o sanitizer
tem `isMechanismNarrationClaim` — mas o padrão "Agora vou <ação de produto>" escapa: não é
mecânica de ferramenta, é anúncio de passo.

## Correção proposta
| O quê | Onde |
|---|---|
| Directives do reveal param de descrever a sequência ("(1) escreva… (2) chame…") de um jeito que o modelo ecoa como narração | `directives.ts` (search-summary / recomendação) |
| Guard: "agora vou te <verbo>" / "agora vou detalhar" entra na família de narração de processo | `sanitizer.ts` (`isProcessPreamble`) |

⚠️ Cuidado pra não virar mordaça: o objetivo é o agente **fazer** em vez de **anunciar**, não
ficar mudo. Não adicione mais proibição do que o necessário.

## Regressão exigida
- Unit: sanitizer dropa "Agora vou te recomendar a mais adequada:".

## Implementação

**sanitizer.ts** — novos patterns (`PRODUCT_STEP_ANNOUNCEMENT_PATTERNS`, dentro da MESMA família
de `isProcessPreamble`, como pedido na correção): bloqueia "(agora) vou/deixa eu (te) recomendar/
destacar/detalhar/aprofundar" incondicionalmente (verbos de decisão/análise do produto — quase
nunca carregam conteúdo por si, são sempre anúncio de passo) e "(agora) vou/deixa eu (te) mostrar/
simular" só quando seguido de objeto VAGO ("a mais adequada", "a melhor opção", "como funciona em
detalhes") — nunca bloqueia quando o modelo nomeia uma entidade/número real ("Vou simular a
Rodobens com R$ 900 mil" continua passando, testado explicitamente). Cobri as 11 frases exatas do
veredito (4 dossiês) + a frase-alvo da regressão exigida.

**directives.ts** — achei o cano furado: `buildSearchSummaryDirective` (passo 2, anúncio pós-busca)
literalmente MANDAVA o modelo usar a copy "Encontramos 3 boas opções para o seu perfil. Agora
vamos te recomendar a mais adequada:" — quase idêntica à frase que o veredito flagrou. Troquei
pela copy do mockup ("Encontramos 3 boas opções pra você!" / "Separei as melhores opções pro seu
perfil:") e adicionei uma linha explícita proibindo anunciar o PRÓXIMO passo. Isso é reforço
(defesa suplementar) — o mecanismo real é o guard do sanitizer, determinístico, que não depende
do modelo obedecer.

Sem virar mordaça: os verbos bloqueados são só os de ANÚNCIO de decisão vazia ("vou recomendar",
"vou destacar"), nunca "simular"/"mostrar" sozinhos (que seguem livres quando acompanhados de
conteúdo real) — o modelo continua livre pra narrar com números/entidades reais, só não pode
anunciar o PRÓXIMO passo antes de dá-lo.

Teste: `sanitizer.test.ts` (bloco "FIX-335"), 3 casos novos + suíte inteira do sanitizer (81
testes) e das diretivas/system-prompt/integração do reveal, todos verdes.
