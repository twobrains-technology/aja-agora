# bloco-toques — FIX-379, FIX-380, FIX-381 (a régua responde "para quem foi, e como")

**Status:** concluído · 2026-09-28 · branch `feat/toques-lista` (worktree `feat-toques-lista`)

A pergunta do dono na reunião de 22/09 — *"já foram enviados oito: para quem que foi? E como que
foi? Foi o primeiro toque, o segundo ou o terceiro?"* — só existia agregada. O bloco deu PORTA a
ela: o número virou link, a lista ganhou filtro por passo e a coluna "Passo atual" passou a dizer
quando e COMO o último toque saiu.

## O que foi entregue

- **FIX-380 — a forma do envio** (`remarketing-tela.ts`, `remarketing-queries.ts`): `formaDoEnvio`
  deriva do banco se o último toque saiu como **texto livre** (turno de retomada), **template**
  (nome do template) ou **template aguardando** (na fila da Meta) — e devolve **"Não registrado"**
  quando não há rastro nenhum, nunca "texto livre" por omissão. **Sem coluna nova, sem migration**
  (o porquê está no ADR `docs/decisoes/blocos/2026-09-28-bloco-toques.md`).
- **FIX-379 — a porta** (`route.ts`, `remarketing-tela.ts`, `resumo-da-regua.tsx`,
  `insights-da-regua.tsx`, `tabela-remarketing.tsx`, `remarketing/page.tsx`): o cartão "Toques
  enviados" e cada degrau do funil levam à lista recortada (`?passo=0..3` ou `com_toque`), com
  chip do filtro ativo e estado vazio que explica o filtro. A coluna "Passo atual" mostra passo,
  data do último toque, forma e se a pessoa respondeu depois.
- **FIX-381 — o teto real** (`route.ts`, `remarketing-tela.ts`): a rota lê o `remarketing_config`
  e passa `maxToques` no shape; `passoLegivel`/`cotaLegivel` e os rótulos do resumo que citavam
  "3" passam a citar o teto vigente. Sem cadastro, o valor de fábrica (o mesmo do ciclo).

## Decisões de desenho (e o motivo)

1. **Reuso, não coluna** (FIX-380). A evidência já está no banco: a fila
   (`whatsapp_outbound_queue`) diz template enfileirado/despachado; a fala do agente logo depois
   do toque (ancorada no `ultimo_toque_em`, sem inbound no meio) diz turno de retomada — o envio
   de template NÃO grava mensagem; `whatsapp_templates` cobre o envio direto do template aprovado.
   Uma coluna nasceria NULL para todo o histórico e criaria uma segunda verdade ao lado da fila.
   `messages.template_name` entrou na ordem, mas **não** é a evidência principal: hoje quem grava
   essa coluna é o painel do atendente, não a régua.
2. **A forma desconhecida é `nao_registrado`.** Nunca "texto livre" por omissão — a mesma
   disciplina do `estadoHonestoDaRegua`.
3. **Filtro por passo é puro e não mexe nos agregados.** Contadores, funil e resumo continuam
   sendo do recorte inteiro; filtrá-los junto faria o funil mudar de forma ao clicar num degrau.
4. **O contador "Toques enviados" aponta para `com_toque`** (quem recebeu ao menos um toque), e
   não para um passo: o número é a SOMA dos passos, não um passo.
5. **Ordem interna 380 → 379 → 381**, como o `_bloco.md` manda (a forma é insumo da coluna).

## Prova

- `pnpm vitest run src/lib/admin/ src/components/admin/remarketing/` → **29 arquivos / 346 testes
  verdes** (11 arquivos de integração pulados, sem banco migrado no worktree).
- `pnpm typecheck` verde; `biome check` limpo nos arquivos tocados.
- SQL da forma validado contra o Postgres local (LATERAL da fala e da fila), sem erro, e o
  comportamento da janela conferido em dados reais de `messages`.
- Nenhuma mensagem de WhatsApp foi disparada em teste ou comando.

## Lacunas honestas

- **Envio direto de template aprovado sem o nome no cadastro** sai como `nao_registrado` — sem
  rastro no banco, não há como nomear. Enquanto os templates `remarketing_oportunidade_*` não
  estiverem aprovados, todo template passa pela fila e é nomeado.
- **"Esgotou os 3 toques"** (rótulo da SITUAÇÃO, em `ROTULO_DA_SITUACAO`) segue com o número fixo;
  os rótulos do resumo já usam o teto vigente. Está fora do escopo dos cards e registrado no ADR.
- **Nada foi medido em produção** (a página em si não foi aberta no browser, por instrução do
  bloco): a prova é unitária + typecheck.

## Commits

- `f790469e` — feat(admin): a régua diz COMO o toque saiu (FIX-380)
- `2b164605` — feat(admin): "toques enviados" e o funil viram porta para a lista (FIX-379)
- `8a93a762` — feat(admin): o teto da régua na tela vem do cadastro (FIX-381)

## Conflito esperado com o `bloco-regua` (não resolvido aqui, por desenho)

Editaram as MESMAS duas regiões de arquivo em paralelo. A ordem de merge combinada no `_bloco.md`
é **bloco-regua primeiro**, e este resolve:

- `src/lib/admin/remarketing-tela.ts` — este bloco acrescentou seções **no fim** do arquivo (forma
  do envio + filtro por passo) e tocou `passoLegivel`/`cotaLegivel`/`linhaDaTela`/`linhasDaTela`
  (assinatura com `maxToques`) e a interface `RespostaDaRegua`. O `bloco-regua` mexe em motivo e
  cadência — colisão provável só nas assinaturas citadas.
- `src/app/api/admin/remarketing/route.ts` — este bloco tocou o parse de parâmetros, o `try` do
  cadastro (`lerParametrosRegua`) e a construção da resposta. O `bloco-regua` deve mexer no miolo
  da leitura; conflito provável no bloco de imports e no corpo do `GET`.