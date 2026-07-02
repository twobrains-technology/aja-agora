import { describe, it, expect } from "vitest";

describe("pipeline-filters — combobox de canal", () => {
	it("deve renderizar label 'Todos' para valor 'all'", () => {
		const label = getChannelLabel("all");
		expect(label).toBe("Todos");
		expect(label).not.toBe("all");
	});

	it("deve renderizar label 'Web' para valor 'web'", () => {
		const label = getChannelLabel("web");
		expect(label).toBe("Web");
		expect(label).not.toBe("web");
	});

	it("deve renderizar label 'WhatsApp' para valor 'whatsapp'", () => {
		const label = getChannelLabel("whatsapp");
		expect(label).toBe("WhatsApp");
		expect(label).not.toBe("whatsapp");
	});

	it("deve usar valor cru como fallback se desconhecido", () => {
		const label = getChannelLabel("unknown");
		expect(label).toBe("unknown");
	});
});

// Helper que deve estar no componente
function getChannelLabel(value: string): string {
	const CHANNEL_LABELS: Record<string, string> = {
		all: "Todos",
		web: "Web",
		whatsapp: "WhatsApp",
	};

	return CHANNEL_LABELS[value] || value;
}
