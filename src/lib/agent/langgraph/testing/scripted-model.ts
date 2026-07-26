// Fake de LLM com ROTEIRO — a peça que torna o funil inteiro determinístico.
//
// Por que não `FakeStreamingChatModel` (@langchain/core/utils/testing): os
// `chunks` dele são FIXOS, a mesma lista pra toda chamada. O nó `converse`
// chama `.stream()` VÁRIAS vezes no mesmo turno (loop de tool-call, e os dois
// beats do reveal), então um roteiro que não avança devolveria a mesma
// tool-call em loop até estourar `MAX_TOOL_LOOP_ITERATIONS`.
//
// Aqui cada `.stream()` consome o PRÓXIMO beat do roteiro. Isso é o que
// permite escrever "no primeiro beat o modelo chama present_group_card, no
// segundo ele faz a pergunta" e ter exatamente isso, sempre.
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
	BaseChatModel,
	type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";

/** Uma chamada ao modelo: o que ele fala e/ou quais tools ele pede. */
export type ScriptedBeat = {
	/** Texto que o modelo streama neste beat. */
	text?: string;
	/** Tool-calls que o modelo emite neste beat (viram `tool-call` + artifact). */
	toolCalls?: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
};

export type ScriptedChatModelFields = BaseChatModelParams & {
	beats: ScriptedBeat[];
	/** Beat devolvido quando o roteiro acaba. Default: texto vazio, sem tools —
	 * encerra o loop de tools do `converse` sem estourar iteração. */
	fallback?: ScriptedBeat;
};

/**
 * Modelo de teste que segue um roteiro. Cada `.stream()` consome um beat.
 *
 * `bindTools` devolve o PRÓPRIO modelo (não um Runnable novo) de propósito: o
 * `converse` guarda `boundModel` e alterna entre ele e o `model` cru entre os
 * beats — se cada um tivesse seu contador, o roteiro furava.
 */
export class ScriptedChatModel extends BaseChatModel {
	private readonly beats: ScriptedBeat[];
	private readonly fallback: ScriptedBeat;
	/** Beats já consumidos — inspecionável no teste pra provar quantas vezes o
	 * modelo foi chamado no turno. */
	public callCount = 0;

	constructor(fields: ScriptedChatModelFields) {
		super(fields);
		this.beats = fields.beats;
		this.fallback = fields.fallback ?? { text: "" };
	}

	_llmType(): string {
		return "scripted";
	}

	bindTools(_tools: unknown[]): this {
		return this;
	}

	private nextBeat(): ScriptedBeat {
		const beat = this.beats[this.callCount] ?? this.fallback;
		this.callCount += 1;
		return beat;
	}

	/** Os chunks do beat, já tipados como `AIMessageChunk` — é o que o
	 * `converse` concatena (`merged.concat(chunk)`). */
	private chunksDoBeat(beat: ScriptedBeat): AIMessageChunk[] {
		// Texto em pedaços, como o modelo real. Um único delta gigante esconderia
		// bugs de buffer/boundary (o `EphemeralTextFilter` do converse trabalha
		// justamente sobre deltas parciais).
		const chunks = partirEmDeltas(beat.text ?? "").map(
			(pedaco) => new AIMessageChunk({ content: pedaco }),
		);
		for (const [i, call] of (beat.toolCalls ?? []).entries()) {
			chunks.push(
				new AIMessageChunk({
					content: "",
					tool_call_chunks: [
						{
							type: "tool_call_chunk",
							name: call.name,
							args: JSON.stringify(call.args),
							id: call.id ?? `call_${this.callCount}_${i}`,
							index: i,
						},
					],
				}),
			);
		}
		return chunks;
	}

	async *_streamResponseChunks(
		_messages: BaseMessage[],
		_options: this["ParsedCallOptions"],
		runManager?: CallbackManagerForLLMRun,
	): AsyncGenerator<ChatGenerationChunk> {
		for (const chunk of this.chunksDoBeat(this.nextBeat())) {
			const texto = typeof chunk.content === "string" ? chunk.content : "";
			yield new ChatGenerationChunk({ text: texto, message: chunk });
			if (texto) await runManager?.handleLLMNewToken(texto);
		}
	}

	async _generate(_messages: BaseMessage[], _options: this["ParsedCallOptions"]) {
		let merged: AIMessageChunk | undefined;
		for (const chunk of this.chunksDoBeat(this.nextBeat())) {
			merged = merged ? merged.concat(chunk) : chunk;
		}
		const message = merged ?? new AIMessageChunk({ content: "" });
		return { generations: [{ text: message.text ?? "", message }] };
	}
}

/** Quebra o texto em deltas pequenos (palavras), como o stream real. */
function partirEmDeltas(texto: string): string[] {
	if (!texto) return [];
	return texto.match(/\S+\s*/g) ?? [texto];
}
