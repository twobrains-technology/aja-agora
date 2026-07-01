---
id: FIX-131
titulo: 'Footer da landing com 3 categorias de entrada (tira "Serviços")'
status: done
executado_em: 2026-07-01
severidade: baixa
projeto: aja-agora
frente: 1 (Descoberta+Qualificação+Identidade) — QA autônomo divergencias-jornada
arquivos: [src/components/landing/brand-footer.tsx, src/components/landing/brand-footer.fix-131.test.tsx]
rodada: 2026-07-01 — QA autônomo da onda divergencias-jornada (validação adversarial no browser real)
decidido: 'remover Serviços do footer (paridade D21); quem decidiu: Kairo via AskUserQuestion; reversível'
---

## Origem (QA visual no browser real — D21 residual)

Ao validar o welcome no browser real (`http://aja-descoberta-qualificacao.orb.local`), o QA
achou que o **footer da landing** (coluna "Consórcio") expunha **4 categorias de entrada** —
Imóvel, Automóvel, Moto e **Serviços**. Diferente de um link informativo, cada item é um
`<button>` que **abre o chat** com um seed de categoria (`onStart(seed)`), ou seja, é uma
**porta de entrada da jornada**.

O hero (`hero.tsx` CHIPS), o welcome do chat (FIX-130) e o WhatsApp têm só **3** (decisão
Bv2-01 / Bruna v1 #20: moto substituiu "Serviços"). A regra D21 diz "3 categorias de entrada,
mesma decisão da landing". O footer ficou com a 4ª.

## Decisão (produto/UX — perguntado ao Kairo)

Por ser borda entre "chip de entrada" e "catálogo de produtos", foi perguntado via
`AskUserQuestion`. **Kairo escolheu: remover "Serviços" do footer** (paridade D21). Reversível.

## Cenário exato

- **Tela:** landing, footer, coluna "Consórcio".
- **Atual (bug):** 4 botões de entrada — Imóvel, Automóvel, Moto, **Serviços**.
- **Esperado:** 3 — Imóvel, Automóvel, Moto. `servicos` segue vivo por texto livre.

## Correção

Remove a linha `{ label: "Serviços", seed: "Quero contratar serviços" }` de `COLS` em
`brand-footer.tsx`. Nada mais muda (servicos permanece no domínio).

## Regressão (componente React puro — Camada 1 render)

`brand-footer.fix-131.test.tsx`: renderiza o `BrandFooter` → assere que NÃO há botão
"Serviços" e que a coluna Consórcio tem exatamente 3 chips (Imóvel/Automóvel/Moto).
**Falhou ANTES do fix** (4 chips / "Serviços" presente), passou depois.

## Verificação

- `pnpm test:unit`: **2201 verdes** (era 2199; +2 testes), zero regressão.
- **Browser real**: footer renderiza 3 categorias (Imóvel/Automóvel/Moto), sem "Serviços".
  Evidência: `tests/e2e/artifacts/welcome-chat-3-categorias-fix130.png` (mesma sessão, welcome
  do chat com 3 categorias confirmado no browser).
