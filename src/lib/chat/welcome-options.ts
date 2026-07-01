import type { GatePartOption } from "./ui-message";

/**
 * Fonte ÚNICA das categorias clicáveis de ENTRADA do chat web (Passo 1 da
 * jornada canônica). Bv2-01 / Bruna v1 #20: 3 categorias — Imóvel, Automóvel,
 * Moto. Moto SUBSTITUIU "serviços"/"Outros" nos chips, em paridade com o
 * WhatsApp (`welcomeButtonsToWhatsApp`) e a landing (`hero` CHIPS).
 *
 * A categoria `servicos` continua VIVA no domínio (Category/CATEGORY_META/
 * turn-analyzer/qualify-config) e acessível por TEXTO LIVRE ("quero fazer uma
 * reforma") — só deixou de ser opção clicável de entrada.
 *
 * ⚠️ NÃO duplicar esta lista. Tanto o adapter web (evento `welcome-categories`)
 * quanto o `EmptyState` do chat (`message-list.tsx`) importam daqui. A
 * duplicação era a causa-raiz do FIX-130: o FIX-121 corrigiu só a cópia do
 * adapter e a cópia do `message-list` ficou com a 4ª categoria ("Outros"),
 * então a PRIMEIRA tela do chat web ainda mostrava 4 chips.
 */
export const WELCOME_OPTIONS: GatePartOption[] = [
	{ value: "imovel", label: "Imóvel" },
	{ value: "auto", label: "Automóvel" },
	{ value: "moto", label: "Moto" },
];
