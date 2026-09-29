---
bloco: bloco-telefone-ab
branch: feat/telefone-ab
workspace: feat-telefone-ab
onda: 3
depends_on: []
paralelo_com: []
itens: [FIX-394, FIX-395, FIX-396, FIX-397, FIX-398]
escopo_arquivos:
  - src/lib/chat/
  - src/components/chat/
  - src/app/api/chat/
  - src/lib/admin/sinais-do-funil.ts
  - src/app/api/admin/performance/
---
# Bloco telefone A/B — a entrega de quinta (01/10)

**Prazo: quinta-feira à noite.** É o compromisso que o Kairo assumiu com a Bruna na call de 29/09
(11:37–12:37). Não é um item de backlog: é a frente que destrava o funil.

## O gargalo, com as palavras dela

> *"Então, primeiro coisa que a gente está falando aqui de plano de ação é: antes de mostrar a
> simulação, a gente colocar o telefone. Só para a gente pôr aqui em prática, o que a gente vai fazer?
> Já que tem esse gargalo aqui que daqui não desce."* — Bruna Perrotta, 12:07:52

Quem vê a oferta **não se identifica**. Sem telefone, a única ação possível é remarketing por evento —
não dá para ligar, mandar SMS nem chamar no WhatsApp. O lead fica "descoberto" exatamente no ponto em
que ele já demonstrou interesse.

## O que foi decidido na call (e por quem)

| | |
|---|---|
| **B** | pedir o telefone **antes** de liberar a comparação — ideia da **Bruna** |
| **C** | **blur** na melhor opção: a pessoa vê que o prêmio existe, borrado, e o telefone desbloqueia — ideia do **Gustavo** |
| **A** | "como está hoje" — **descartada**: medir o problema conhecido gasta massa que não temos |
| Regra | cada **visita** cai numa variante (não é por pessoa): *"eu entrei, eu vou cair na A. O Caio entrou, cai na B."* — Gustavo, 12:10:35 |
| Meta | **≥30 leads em cada variante** (≈60 pessoas chegando na conversa) |
| Cópia | já escrita em `docs/decisoes/2026-09-29-copia-do-desbloqueio-do-telefone.md`, na régua do `Remarketing_WhatsApp_V3.pdf` (a Bruna orientou: **uma pergunta só**, curta, sem prometer contemplação, sem citar administradora por nome, LGPD explícita) |

O Kairo endossou o blur (12:08:56): *"Eu gosto dessa estratégia do Gustavo de causar ali aquele
sentimento de curiosidade. Eu acho que é melhor do que pedir o telefone dele de cara."*

## Ordem interna

**394 → 395 → 396 → 397 → 398.** A atribuição da variante primeiro (é a fundação: sem ela os dois
caminhos não são comparáveis), depois cada caminho, depois a prova de que dá para medir, e por último
a correção do sinal "viu oferta" — que é o que a medição inteira usa.

## O que este bloco NÃO faz

- **Não** dispara mensagem real de WhatsApp para cliente. Nenhum teste chama a Meta.
- **Não** mexe na tela do painel além do endpoint: o desenho da tela de resultado vem depois (para não
  colidir com o bloco de custo, que está na onda 2).
- **Não** decide prazo de teste nem volume de investimento: isso é do dono.
- **Não** mergeia, não abre PR, não faz deploy.
## Onde as coisas vivem — MEDIDO em 29/09 (não presuma, isto foi verificado)

| O quê | Onde |
|---|---|
| A visita nasce e o cookie é setado — **é aqui que o sorteio da variante entra** (já existe `registrarVisita()` e há um comentário no `/direto` dizendo "quando o sorteio entrar no proxy.ts") | `src/proxy.ts:184`, `:120` (`LANDINGS`), `:122` (`ehLanding`), `:291` (`matcher`) |
| Cookies da visita (`aja_uid`, `aja_visit`, TTL 90 d) e a decisão nova-visita-vs-reuso (30 min) | `src/lib/attribution/visit-cookie.ts:12-16`, `:105` |
| Gravação da visita (`visits`) e leitura pelo cookie | `src/lib/attribution/visit-store.ts:46`, `:174` |
| Tabelas: `visits` (`visitorId`) e `conversations.visitId` → a variante pode morar aqui | `src/db/schema.ts:345`, `:351`, `:406` |
| O gate de identidade (CPF + celular + LGPD) — **já tem `momento: "fecho" | "pre-busca"`**: é a alavanca da variante B | `src/lib/web/adapter.ts:193`; componente `src/components/chat/artifacts/gate-identity-form.tsx:186` (campo do telefone), `:111-118` (submit) |
| A cópia do gate de identidade por canal (é aqui que o texto do pedido do telefone vive hoje) | `src/lib/agent/orchestrator/gate-questions.ts:272` |
| Captura pré-reveal alternativa: artifact `lead_form` (nome + telefone + e-mail) | `src/components/chat/artifacts/lead-form.tsx:47`; política em `src/lib/agent/orchestrator/tool-policy.ts:135` |
| **O "reveal" da melhor opção** — junta `recommendation_card` (cota recomendada) + `comparison_table`: é a superfície da variante C | `src/components/chat/reveal-selection.tsx:87` |
| Cards da oferta | `comparison-table.tsx:34`, `simulation-result.tsx:34`, `recommendation-card.tsx:74`; despacho em `src/components/chat/artifact-renderer.tsx:25` (`:56/:57/:60`) |
| Escrita do artifact (uma função só) e o log do card na mensagem | `src/lib/conversation/cards.ts:53`; `src/lib/conversation/messages.ts:86`; nó `persist` em `src/lib/agent/langgraph/nodes/persist.ts` |
| Artefatos de oferta reconhecidos pelo painel (a lista do FIX-398) | `src/lib/admin/sinais-do-funil.ts:338` |
| Funil de 7 etapas e percurso de 9 passos (para o resultado do teste) | `src/lib/admin/performance-types.ts:32`; `src/lib/admin/percurso-types.ts:39`, `:93` |
| Já existe uma variante A/B de HERO por ROTA (não por visita) — não confunda com esta | `src/components/kv/heros.tsx:101`; `src/components/kv/landing-kv.tsx:39` |

**Consequência para o plano:** se `proxy.ts` já grava a visita e seta cookie, a variante **não precisa de
`Math.random()` no cliente**: decide-se no middleware, persiste-se com a visita e chega ao componente por
prop/contexto — que é o padrão que o hero já usa (`LandingKv({ hero })`).
