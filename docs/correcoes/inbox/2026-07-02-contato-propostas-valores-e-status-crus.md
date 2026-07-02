# Bug — Painel do contato / Propostas: valores financeiros e status crus (sem formato/acento)

- **Data:** 2026-07-02 · **Achado em:** QA dono-de-produto do FUNIL em **PRODUÇÃO** (https://ajaagora.com.br/admin/pipeline)
- **Superfície:** painel de detalhe do contato → tab **"Propostas"** (`src/components/admin/pipeline/contact-detail-panel.tsx`).
- **Severidade:** média — produto financeiro; número cru mina legibilidade/confiança na tela que a mesa usa pra fechar.

## Cenário (reproduzível)
1. `/admin/pipeline` → abrir um lead com proposta (ex.: contato em "Proposta Enviada").
2. Tab **Propostas**.

## Achado (evidência — texto extraído do dialog em prod)
As propostas aparecem assim:
```
ITAU            Crédito 100000 · Parcela 1397.47 · Status simulacao
BANCO DO BRASIL Crédito 131042.24 · Parcela 2365.57 · Status documentos   [Abrir PDF da proposta]
ANCORA  (Atual) Crédito 100000 · Parcela 1438.28 · Status documentos      [Abrir PDF da proposta]
```

### A) Valores financeiros crus (DEFEITO)
- `Crédito 100000` / `Parcela 1397.47` → sem `R$`, sem separador de milhar, decimal com **ponto**.
- **Esperado:** `Crédito R$ 100.000,00 · Parcela R$ 1.397,47` (pt-BR, `Intl.NumberFormat('pt-BR', {currency:'BRL'})`).

### B) Status cru + sem acento (DEFEITO)
- `Status simulacao` → chave de enum exposta; e falta o **ç/ã** → deveria ser humanizado, ex.: **"Simulação"**.
- `Status documentos` → idem, ex.: **"Aguardando documentos"** / label humano.
- **Esperado:** mapa de rótulos humanos e acentuados por status da proposta (Bevi/Conexia), não a chave crua.

## O que está OK (não mexer)
- "Atual" destaca a proposta vigente (FIX-50) ✓. "Abrir PDF da proposta" presente ✓. CPF mascarado no header ✓.

## Regressão sugerida (Camada 1 — render/format puro)
- Formatação: crédito/parcela renderizam `R$ x.xxx,xx`.
- Mapa de status: cada status da proposta tem label humano acentuado (sem chave crua vazando na UI).
