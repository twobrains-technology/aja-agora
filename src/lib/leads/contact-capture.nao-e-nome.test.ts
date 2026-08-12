// Produção, 2026-08 — duas conversas ficaram com `contact_name = "Voltei"`. O
// cliente retomou a conversa digitando "Voltei", o modelo chamou
// `save_contact_name` com isso, e a validação deixou passar: "Voltei" não está
// nas stopwords, tem 6 letras, nenhum dígito. A partir dali o agente
// cumprimentava "Oi, Voltei!" e o lead nascia com esse nome na mesa.
//
// A defesa não pode viver no prompt (Lei 4 — invariante crítico vira código):
// `saveContactName` é o ponto ÚNICO de escrita do nome, nos dois canais, e é
// onde a checagem tem que estar. A lista é fechada de propósito: cobre o que
// clientes reais digitam ao voltar/saudar e os rótulos que o próprio produto
// oferece em botão, sem tentar adivinhar "o que parece nome" — heurística ampla
// aqui rejeitaria nome legítimo, que é um estrago pior.

import { describe, expect, it } from "vitest";
import { ehNomeProprioPlausivel } from "@/lib/leads/contact-capture";

describe("ehNomeProprioPlausivel", () => {
	it("rejeita o 'Voltei' que virou nome de dois leads em produção", () => {
		expect(ehNomeProprioPlausivel("Voltei")).toBe(false);
	});

	it("rejeita verbos de retomada e presença, em qualquer caixa e com acento", () => {
		for (const t of ["voltei", "VOLTEI", "Cheguei", "Voltando", "Retornei", "Estou", "Tô"]) {
			expect(ehNomeProprioPlausivel(t), t).toBe(false);
		}
	});

	it("rejeita rótulo de botão que o próprio produto oferece", () => {
		for (const t of ["Já", "Conheço", "Primeira", "Dúvidas", "Simular", "Continuar"]) {
			expect(ehNomeProprioPlausivel(t), t).toBe(false);
		}
	});

	// Achado ao corrigir o "Voltei": existe um SEGUNDO caminho de escrita do nome
	// — `captureAnswerNode` (langgraph/nodes/capture.ts), que no gate `name` pega
	// a PRIMEIRA palavra do turno e a batiza como nome. Ele tinha uma lista
	// própria, menor, e "Ainda não sei bem" virava `contactName = "Ainda"`. Os
	// dois caminhos agora consultam esta função; estes casos existem pra que a
	// unificação não seja desfeita sem quebrar teste.
	it("rejeita advérbio e verbo que abrem uma resposta que não é nome", () => {
		for (const t of ["Ainda", "Depois", "Agora", "Hoje", "Prefiro", "Talvez"]) {
			expect(ehNomeProprioPlausivel(t), t).toBe(false);
		}
	});

	it("rejeita saudação e confirmação soltas", () => {
		for (const t of ["Oi", "Olá", "Opa", "Bom", "Sim", "Não", "Ok", "Beleza", "Obrigado"]) {
			expect(ehNomeProprioPlausivel(t), t).toBe(false);
		}
	});

	it("aceita nome de gente — inclusive os que lembram palavra comum", () => {
		for (const t of ["Kairo", "Ana", "Vera", "Rosa", "Vitória", "Alan", "Erik", "Monique"]) {
			expect(ehNomeProprioPlausivel(t), t).toBe(true);
		}
	});
});
