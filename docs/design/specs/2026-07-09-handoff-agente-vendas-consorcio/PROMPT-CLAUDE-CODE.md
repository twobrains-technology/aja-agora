# Prompt de abertura — colar no Claude Code

> Cole o texto abaixo na sessão, com este pacote anexado/descompactado no repo.

---

Anexei um handoff completo (`handoff/`) do comportamento validado do nosso agente de vendas de consórcio. Ele **já foi escrito em cima do mapa da nossa arquitetura real** — FSM em `orchestrator/` + gates em `qualify-state.ts`, cards como tools `present_*` com payload coagido server-side, Bevi Trilho B ativo, motores em `consorcio/`.

**Leia nesta ordem:** `README.md` → `docs/00-mapa-crosswalk.md` → `docs/01` → `docs/02` → `docs/03` → `docs/05` → `docs/06`.
Os mockups em `mockups/*.html` são referência visual — abra se precisar entender um card.

**Antes de escrever qualquer código:**

1. Valide o `00-mapa-crosswalk.md` contra o código atual. Para cada linha marcada REAPROVEITA/ESTENDE/NASCE, confirme se o mapa está certo. Onde eu errei, me corrija com o caminho do arquivo.
2. Confirme especificamente:
   - A ordem atual da cadeia em `nextGate()` (`qualify-state.ts:51`) — `experience` está mesmo antes de `search`?
   - `recommendation.ts` já tem alguma checagem de `netCredit >= valorDoBem`? (suspeito que não — é o PR2)
   - Existe `referenceMonth` (mês do lance histórico) vindo da Bevi, ou só o `anchorMonth` constante? (Pendência P5, afeta a calibração da curva nova)
   - O `offer-mapper` normaliza `averageBid` por oferta?
   - `availableSlots` chega confiável da Bevi hoje?
3. Me devolva os **conflitos** entre o comportamento-alvo e o que já está implementado.

**Depois disso**, execute o `docs/06-plano-implementacao.md` na ordem, **um PR por vez**, parando pra revisão entre eles. Comece pelo **PR0** (substituir a curva do lance — a matemática que sustenta a agulha inteira), depois **PR2** (guardrail de crédito líquido).

**Restrições que não se negociam:**
- Invariante financeiro vai em **código**, nunca no prompt.
- `taxaContemplacao` **não pode ser exibida** (semântica não documentada).
- **Não** oferecer redução de prazo em lugar nenhum.
- Escassez só com `availableSlots` real; nunca inventar o total do grupo.
- **A curva de lance atual em `contemplation-dial.ts:89-96` está errada e DEVE ser substituída** (PR0). A fórmula canônica está em `docs/03-regras-calculo.md`. O modelo AMORTIZA (`:116-122`) está certo e permanece.

Não implemente nada antes de me devolver o resultado dos passos 1–3.
