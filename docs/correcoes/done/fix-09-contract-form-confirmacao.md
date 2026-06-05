---
id: FIX-9
titulo: "Passo 5 re-pede CPF e celular que já foram informados no identify"
status: done
rodada: 2026-06-05 manhã (teste manual em tela)
commit: 4820e12
executado_em: 2026-06-05
---

# FIX-9 — Passo 5 re-pede CPF e celular que já foram informados no identify

**Onde acontece:** Passo 5, fechamento. Usuário clica **"Sim, quero
contratar agora"** → agente: "Boa! Pra fechar, só preciso de uns dados
rápidos:" → artifact `contract_form` ("Vamos fechar sua proposta",
Administradora: CANOPUS) com:

- Campo **CPF** — VAZIO (placeholder 000.000.000-00)
- Campo **Celular** — VAZIO (placeholder (11) 99999-9999)
- Checkbox LGPD + botão "Continuar com segurança"

**Problema (palavras do Kairo):** "Ele está pedindo novamente aqui, depois
que eu falei que quero fechar, de novo o CPF e o celular. Está **totalmente
incorreto**, uma vez que já foi informado."

CPF e celular JÁ foram coletados no gate `identify` (pré-reveal,
obrigatório — o tripwire `IdentityNotCollectedError` garante; identidade
salva cifrada via `storeIdentity`/`loadIdentity`). Esse gap já estava no
done report de 2026-06-04 como follow-up de UX — agora é correção oficial.

**Direção do fix:**
1. `contract_form` **pré-preenchido** com os dados do identify — CPF
   mascarado (028.\*\*\*.\*\*\*-38), celular formatado. Usuário só confere,
   marca LGPD e confirma.
2. Alternativa mais curta: identidade completa + consentimento já dado →
   reduzir a 1 clique de confirmação, sem form.
3. Avaliar o que o gate `consent` do início já cobre vs o checkbox LGPD do
   create-proposal Bevi (`termoLgpd`/`consultaDados`) — o checkbox pode ter
   que ficar; os CAMPOS de dados, nunca.
4. **Segurança:** CPF nunca em claro no payload do artifact — mascarar na
   UI, manter cifrado no backend (AES-256-GCM, IDENTITY_ENC_KEY).

**Regressão:** integration test (identidade presente → contract_form
pré-preenchido/mascarado) + Camadas 1/2.

---

## Observações colaterais minhas (dos prints — validar com Kairo na estruturação)

> Itens que EU notei nos prints mas o Kairo não apontou explicitamente.
> Não viram FIX sem validação.

1. **Copy emendada no reveal** (print do FIX-9): "…Quer ajustar a carta de
   crédito?**Show**, esse plano encaixa bem no que você pediu!" — frases
   coladas sem espaço/quebra, parecendo o agente respondendo a si mesmo
   (mesma família do "Boa!" do FIX-5).
2. **"Deixa eu buscar as melhores opções pra você, Kairo!"** seguido
   imediatamente do detalhamento completo — promessa de busca + resultado
   no mesmo turno soa estranho.
3. **CTAs duplicados** no card de simulação (já anotado no FIX-7): botão
   "Tenho interesse" do card + chips "Tenho interesse!" / "Ajustar valor" /
   "Ver outras opções".
4. **Badge "43% compatível"** no card de recomendação único (FIX-7): score
   baixo exposto ao usuário na ÚNICA opção mostrada — vender "a mais
   adequada pro seu perfil" com 43% mina a confiança. Rever se o score
   deve aparecer e como.
