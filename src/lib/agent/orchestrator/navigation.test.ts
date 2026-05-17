import { describe, it, expect } from "vitest";
import {
	BACK_INTENT_REGEX,
	NAV_STACK_CAP,
	detectBackIntent,
	popNavState,
	pushNavState,
	type NavState,
} from "./navigation";

const mk = (id: string): NavState => ({
	persona: id,
	category: "imovel",
	expertiseLevel: "neutro",
	experiencePrev: null,
	qualifyAnswers: {},
});

describe("navigation — stack push/pop com cap (bug #06)", () => {
	it("golden path: A → B → C, back pop pra B (stack [A])", () => {
		let stack: NavState[] = [];
		const a = mk("A");
		const b = mk("B");
		const c = mk("C");
		stack = pushNavState(stack, a);
		stack = pushNavState(stack, b);
		stack = pushNavState(stack, c);
		expect(stack).toEqual([a, b, c]);

		const popped = popNavState(stack);
		expect(popped.popped).toEqual(c);
		expect(popped.stack).toEqual([a, b]);
	});

	it("cap em 20 estados: 21° push descarta o mais antigo", () => {
		let stack: NavState[] = [];
		for (let i = 0; i < NAV_STACK_CAP; i++) {
			stack = pushNavState(stack, mk(String(i)));
		}
		expect(stack.length).toBe(NAV_STACK_CAP);
		expect(stack[0].persona).toBe("0");

		stack = pushNavState(stack, mk(String(NAV_STACK_CAP)));
		expect(stack.length).toBe(NAV_STACK_CAP);
		expect(stack[0].persona).toBe("1"); // o "0" foi descartado
		expect(stack[NAV_STACK_CAP - 1].persona).toBe(String(NAV_STACK_CAP));
	});

	it("voltar do estado inicial (stack vazia): retorna popped=null sem crashar", () => {
		const result = popNavState([]);
		expect(result.popped).toBeNull();
		expect(result.stack).toEqual([]);
	});

	it("push não muta o array original (immutability)", () => {
		const original: NavState[] = [mk("A")];
		const next = pushNavState(original, mk("B"));
		expect(original.length).toBe(1);
		expect(next.length).toBe(2);
	});

	it("pop não muta o array original (immutability)", () => {
		const original: NavState[] = [mk("A"), mk("B")];
		const result = popNavState(original);
		expect(original.length).toBe(2);
		expect(result.stack.length).toBe(1);
	});
});

describe("detectBackIntent — regex ancorada pra evitar falso positivo", () => {
	const positivos = [
		"voltar",
		"Voltar",
		"VOLTAR",
		"volta",
		"voltar pro menu",
		"Voltar para o menu",
		"volta!",
		" voltar  ",
		"voltar.",
	];

	const negativos = [
		"vou voltar amanhã",
		"queria voltar pra ver outras opções",
		"voltei do banco",
		"voltou tarde",
		"reviravolta",
		"olá",
		"quero comprar um imóvel",
		"",
		"   ",
	];

	for (const text of positivos) {
		it(`positivo: "${text}" → true`, () => {
			expect(detectBackIntent(text)).toBe(true);
		});
	}

	for (const text of negativos) {
		it(`negativo: "${text}" → false`, () => {
			expect(detectBackIntent(text)).toBe(false);
		});
	}

	it("regex está exportada pra inspeção", () => {
		expect(BACK_INTENT_REGEX).toBeInstanceOf(RegExp);
	});
});
