# QA Rodada 7 — Dossiê de Testes Web (4 Jornadas)

Data: 2026-07-14 | Executado por: Coletor Haiku | Ambiente: dev

## Jornadas Executadas

### 1. AUTO — Madalena (Corolla ~150 mil)
- **conversationId:** 58E5F37C-A441-454E-9532-86B2020B7C02
- **Chegou até:** Reserva confirmada com ITAÚ
- **Especialista:** Rafael
- **Lance:** R$ 102.135 (depois ajustado pra ~45 mil embutido)
- **Arquivo:** `auto-web.md`

**Anomalias:**
- contract_form apareceu 3x em sequência (turnos 18, 19, 20)

**Testes específicos PASSARAM:**
- "não entendi" (turno 12): ✓ resposta clara e detalhada
- "Bradesco" (turno 13): ✓ resposta com alternativas (não mencionou Bradesco, listou opções reais)

---

### 2. MOTO — Mario (Moto ~35 mil, SEM entrada)
- **conversationId:** 9D919F41-B11E-4547-A255-982F8F990CA7
- **Chegou até:** Reserva confirmada com TRADIÇÃO
- **Especialista:** Bruno
- **Lance:** Nenhum (sorteio apenas)
- **Arquivo:** `moto-web.md`

**Anomalias:**
- scarcity e decision_prompt aparecem 2x cada no turno 14 (DUPLICAÇÃO)
- Frase "Pra confirmar sua reserva, só preciso de uns dados rápidos" repetida nos turnos 15 e 17

**Testes específicos NÃO EXECUTADOS nesta jornada:**
- ❌ "não entendi" (fluxo direto não permitiu)
- ❌ "Bradesco" (fluxo direto não permitiu)

---

### 3. IMÓVEL — Fernanda (Apartamento ~400 mil, tem FGTS, já fez consórcio)
- **conversationId:** 7413A7F0-40A6-462B-A9D1-CD879EEE8A84
- **Chegou até:** Reserva confirmada com ITAÚ
- **Especialista:** Helena
- **Lance:** R$ 80 mil (FGTS)
- **Arquivo:** `imovel-web.md`

**Anomalias:**
- embedded_bid apareceu em turnos 13 e 14 (não no mesmo turno, mas em sequência)

**Testes específicos PASSARAM:**
- "não entendi" (turno 12): ✓ resposta clara e didática
- "Bradesco" (turno 13): ✓ resposta com lista de opções reais

---

### 4. SERVIÇOS — Bruno (Reforma cozinha+banheiro ~30 mil, NOVATO em consórcio)
- **conversationId:** 457B33EE-FA90-40C2-9DEB-413320EC87F7
- **Chegou até:** Reserva confirmada com TRADIÇÃO
- **Especialista:** Camila
- **Lance:** Nenhum (sorteio apenas)
- **Arquivo:** `servicos-web.md`

**Anomalias:**
- Nenhuma anomalia crítica encontrada

**Testes específicos PASSARAM:**
- "não entendi" (turno 13): ✓ resposta simplificada e clara
- "Bradesco" (turno 14): ✓ resposta com lista de opções reais

---

## Sumário de Anomalias por Tipo

### CARD Duplicados
| Jornada | Card(s) | Turno(s) | Crítico? |
|---------|---------|---------|---------|
| Moto | scarcity, decision_prompt | 14 (2x cada) | ⚠️ Moderado |
| Auto | contract_form | 18, 19, 20 | ⚠️ Moderado |
| Imóvel | embedded_bid | 13-14 (sequência) | 🟢 Baixo |

### Frases Repetidas
| Jornada | Frase | Turnos | Crítico? |
|---------|-------|--------|---------|
| Moto | "Pra confirmar sua reserva..." | 15, 17 | 🟢 Baixo |

### "Acho que me perdi"?
**Nenhuma jornada exibiu essa mensagem.** ✓

### Consentimento Antes de Números
**Todas as 4 jornadas pediram identificação (CPF+Celular) ANTES de apresentar números/recomendações.** ✓

---

## Taxa de Conclusão
✅ 4/4 jornadas = **100% chegou até Reserva**

---

## Observações do Coletor

1. **Fluxo Moto**: Sequência rápida não permitiu executar testes de "não entendi" e "Bradesco" — fluxo prosseguiu direto.
2. **Card contract_form em Auto**: Repetição pode indicar retry no formulário ou lógica de confirmação em cascata.
3. **Card scarcity+decision_prompt em Moto**: Duplicação nítida — CARD deve aparecer 1x apenas por turno.
4. **Respostas a "não entendi"**: Todas as jornadas que executaram o teste (Auto, Imóvel, Serviços) responderam com clareza e adaptação ao público.
5. **Teste "Bradesco"**: Todas as jornadas que tiveram o teste nunca mencionaram Bradesco diretamente, mas listaram as opções reais disponíveis — comportamento esperado.

---

## Próximos Passos (Recomendações do Coletor — NÃO DEFINIDOR)

- **Investigar**: Por que scarcity+decision_prompt duplicam em Moto?
- **Investigar**: Por que contract_form repetiu 3x em Auto?
- **Rever**: Se o fluxo direto da jornada Moto foi intencional ou se há bloqueio de testes.

---

Dossiê completo em: `/Users/kairo/code/aja-agora/.processo/loop/2026-07-13-desamarra-agente/evidencias/rodada-7/`
