# ADR — Onda "Ata mudanças AJA AGORA" (2026-07-04)

Decisões de desenho da onda `integ/ata-mudancas-aja` (FIX-215..224), derivadas da Ata de
alinhamento com o cliente ([`docs/jornada/atas/2026-07-04-mudancas-cliente.md`](../../jornada/atas/2026-07-04-mudancas-cliente.md)).

### 2026-07-04 — Remover a pergunta de lance da entrada da jornada

- **Contexto:** a jornada canônica (Passo 2) perguntava "Pretende dar um lance?" + educava sobre lance embutido **antes** da busca. Bernardo (stakeholder): todo consórcio tem lance; perguntar na largada não faz sentido e confunde o cliente que nem sabe o que é embutido.
- **Decisão:** mover o lance pra **depois do reveal**. Fluxo novo: valor → identidade → **busca/mostra opções** → conversa de lance. A busca nunca teve o lance como pré-requisito (só a identidade, `tool-policy.ts:139`) — o que prendia o lance antes era a ordem do funil + o acoplamento nos handlers.
- **Alternativas descartadas:** manter o lance na entrada — rejeitado pelo stakeholder; tornar o lance opcional-mas-presente na entrada — ainda confunde.
- **Consequências:** ✅ funil mais curto até o "brilho no olho"; ✅ 1ª busca roda sem depender de lance. ⚠️ **reverte a colocação** de FIX-92/118/212 (educação de embutido); os testes desses são reescritos pro novo lugar. 🎲 a 1ª busca roda sem `lanceEmbutido` → precisa re-simulação quando o lance for definido depois.
- **Reversibilidade:** média (git revert do bloco; muda a máquina de gates).
- **Status:** aceita. **Evidência:** FIX-215.

### 2026-07-04 — Terminologia "reserva de cota" (não "contratar/fechar")

- **Contexto:** o produto é uma **reserva de cota** (tipo booking), não uma contratação/fechamento. O cliente não paga nada até o boleto chegar.
- **Decisão:** todo texto de usuário passa a falar "reservar / reserva de cota / reserva confirmada"; adicionar "Você não paga nada agora — tipo booking". Identificadores de código (`intent:"contratar"`, `contractState`) permanecem.
- **Alternativas descartadas:** manter "contratar" — dá impressão errada de compromisso/pagamento imediato.
- **Consequências:** ✅ expectativa correta do cliente, menos fricção. ⚠️ 11 pontos de copy + templates HSM a alinhar.
- **Reversibilidade:** fácil. **Status:** aceita. **Evidência:** FIX-216.

### 2026-07-04 — Lance embutido AMORTIZA a dívida (parcela pós-contemplação cai) — T2

- **Contexto:** tensão T2 (era PENDENTE-Bernardo): a jornada dizia que o lance amortiza o saldo (parcela pós cai); o código/`CONTEXT` D18/C4 + `system-prompt.ts:222` diziam que o embutido só reduz o crédito líquido, não a dívida. A Ata (ex.: 6.800 → ~800 após o lance) resolve a favor da **amortização**.
- **Decisão:** implementar o modelo **amortiza** (`remainingBalance = parcela×meses − (ownCash + embutido)`), invertendo o código atual. Vai só pra **develop** (não prod) atrás de teste. ⚠️ **PENDENTE-Bernardo validar o número exato antes de prod.**
- **Alternativas descartadas:** manter o modelo "só reduz crédito" — contraria o exemplo e o pitch da Ata; deixar tudo PENDENTE-Bernardo — trava um P0 "indispensável".
- **Consequências:** ✅ o card mostra a parcela caindo (o diferencial de venda); ✅ corrige o bug do rótulo mentiroso (parcelas idênticas rotuladas "menor"). 🎲 número financeiro exposto ao cliente ainda não validado com o especialista → gate humano antes de prod.
- **Reversibilidade:** média (test-backed). **Status:** aceita-condicional (PENDENTE-Bernardo pro número). **Evidência:** FIX-221.

### 2026-07-04 — Escopo: onda 1 = P0 + P1 diretos; 2-estágios e PDF pra onda 2

- **Contexto:** a Ata é grande. A recomendação em 2 estágios e a proposta/PDF com marca própria são design-heavy e/ou bloqueadas (Trilho A de fechamento travado, D10).
- **Decisão:** onda 1 entrega os P0 + P1 diretos (fluxo, copy, canal WhatsApp, valor digitável, busca com/sem embutido, cards básicos). **Recomendação em 2 estágios completa** e **Proposta/PDF com marca** ficam pra **onda 2**. Não-dev (Figma do Lucas, número da mesa na Meta, mockup/vídeo, demo backoffice) → PENDENTE-KAIRO/processo.
- **Alternativas descartadas:** tudo numa onda — risco alto de conflito/design; só os P0 — deixaria P1 diretos e baratos de fora sem motivo.
- **Consequências:** ✅ onda focada e integrável; ⚠️ o "brilha o olho" completo (estágio 2) fica pra depois.
- **Reversibilidade:** n/a (decisão de escopo). **Status:** aceita.
