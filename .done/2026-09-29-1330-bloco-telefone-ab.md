# bloco-telefone-ab — FIX-394…FIX-398 (o teste B/C do telefone no ponto da oferta)

**Status:** concluído em 29/09/2026 · branch `feat/telefone-ab` (worktree `feat-telefone-ab`)
**Prazo da cliente:** teste rodando quinta **01/10** à noite / sexta manhã.
**ADR:** `docs/decisoes/blocos/2026-09-29-bloco-telefone-ab.md`

O gargalo que a Bruna nomeou na call de 29/09 (*"daqui não desce"*): quem vê a
oferta não se identifica, e sem telefone não há ligação, SMS nem WhatsApp. O bloco
entregou **duas maneiras de pedir o telefone no ponto em que a pessoa vê a
oferta**, atribuídas **por visita**, com o resultado **separado por variante**.

## O que foi entregue

- **FIX-394 — a variante é da visita** (`variante-da-visita.ts`, `personas.ts`,
  `route.ts`): hash determinístico (FNV-1a) do id da visita → **B** ou **C**, 50/50.
  Mesma visita ⇒ mesmo caminho (recarga não troca); semente inválida **lança**.
  A variante nasce gravada na conversa (`conversations.metadata`) — **sem tabela
  nova, sem migration** — junto do `webCookie`.
- **FIX-395 — variante B** (`desbloqueio-do-telefone.ts`, `telefone-do-desbloqueio.tsx`,
  `adapter.ts`, `chat-message.tsx`, `actions.ts`, `route.ts`): o telefone vem
  **antes** de liberar a comparação. O reveal é **retido** no stream; o card usa o
  campo de celular que já existe (mesma máscara/validação do gate `identify`);
  telefone já conhecido ⇒ não pede de novo; telefone inválido não libera nada;
  falha ao gravar o contato não prende a pessoa.
- **FIX-396 — variante C**: a melhor opção aparece com a **parcela legível** e o
  resto **borrado**; o telefone no próprio card desbloqueia. **"Agora não" existe e
  funciona** (fecha o pedido sem apagar a comparação — sem isso o card vira
  pedágio e a pessoa abandona o site). Acessibilidade: o blur não é a única pista
  (texto `sr-only` + foco no conteúdo liberado).
- **FIX-398 — `viu oferta` tem UMA verdade** (`sinais-do-funil.ts`): a lista do
  painel passou a **derivar** de uma classificação exaustiva de todo artifact
  (`Record<ArtifactType, boolean>`), cobrindo os quatro tipos que provam número na
  tela. Quem via a comparação no web **não era contado** — estava subcontado.
- **FIX-397 — o resultado** (`resultado-do-teste-do-telefone.ts`,
  `src/app/api/admin/performance/telefone-ab/route.ts`): por variante, **visitas**,
  **telefones**, **chegaram à comparação** e a taxa. Sem dado ⇒ **"não
  calculável"**, nunca zero. Endpoint só-admin; a tela fica para outro bloco (para
  não colidir com a onda 2).

## Decisões de desenho

1. **A cópia é literal** do `docs/decisoes/2026-09-29-copia-do-desbloqueio-do-telefone.md`
   (que entrou versionado neste ramo — vivia só na `develop`). Texto no
   componente **cliente**; nada fixo no servidor, conforme o CLAUDE.md.
2. **Persistir no `conversations.metadata`, não em `visits`.** A premissa do
   FIX-394 ("persiste com a visita") não cabia sem migration — e como a variante é
   derivável do `visitId`, gravar na conversa não cria segunda verdade.
3. **O estado do desbloqueio é uma função pura**, usada pelo servidor e pelo
   cliente: uma pergunta, uma resposta. Duas implementações divergiriam na
   primeira mudança.
4. **Re-emissão, não re-busca.** Em B, quando o telefone chega, o servidor
   re-emite os cards **guardados nos artifacts** — sem chamar a Bevi de novo e sem
   inventar número.
5. **A liberação é declarada, não deduzida**: "Agora não" (C) e telefone conhecido
   ⇒ `livre`; o resto cai em B ou C pela variante.

## Prova

- `pnpm vitest run src/lib/chat/` → **15 arquivos / 98 testes** ✅
- `pnpm vitest run src/components/chat/` → **73 arquivos / 405 testes** ✅
- `pnpm vitest run src/lib/admin/` → **43 arquivos / 507 testes** ✅
- `pnpm typecheck` ✅ · `biome check src/` ✅ (1461 arquivos)
- TDD strict, item a item: 1 commit Conventional por item (5 commits).
- 🚫 **Nenhuma mensagem real de WhatsApp foi disparada** — nenhum template,
  nenhum teste A/B na Meta. Telefone de teste é FALSO (`11999999999`); nenhuma PII
  real em arquivo versionado.
- Nada em `src/app/admin/` foi tocado. Sem PR, sem merge, sem deploy (conforme o
  override do bloco: quem integra é o orquestrador).

## Lacunas honestas

- **⚠️ O teste só existe onde o telefone ainda não foi pedido antes da busca.**
  Sem a vitrine (`VITRINE_CPF`/`VITRINE_CELULAR`), o gate `identify` (CPF+celular)
  roda **antes** do `search`; no reveal o celular já é conhecido e o estado é
  `livre` — o B/C **não dispara**. Se produção estiver sem vitrine, no dia 01/10 o
  endpoint devolve as duas variantes "não calculável". Conferir antes de investir
  mais mídia.
- **"Chegaram à comparação" na variante B está otimista**: o nó `persist` grava os
  artifacts do reveal antes de o adapter retê-los na tela, então quem caiu em B e
  nunca deu o telefone conta ali. Para B, o degrau que traduz a experiência é
  `telefones`. Corrigir exige reter **dentro do grafo** — não foi feito de
  propósito (parte mais sensível do runtime).
- **Sem evento de exposição por variante**: "visitas por variante" é derivado das
  conversas que nasceram com variante. Com ~60 pessoas é aproximação.
- **A tela de resultado não existe** (só o endpoint) — decisão do `_bloco.md`.
- **Nada foi verificado no browser** (instrução do bloco): a prova é unitária,
  de integração com banco e de tipos.