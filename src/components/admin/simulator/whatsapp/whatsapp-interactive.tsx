"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Mensagens interactive do WhatsApp (botões reply + list message).
 * O callback `onReply(replyId, replyTitle)` dispara o POST /send com kind=interactive.
 */

interface ButtonAction {
	type: "reply";
	reply: { id: string; title: string };
}

interface InteractiveButtonPayload {
	type: "button";
	body: { text: string };
	action: { buttons: ButtonAction[] };
}

interface ListRow {
	id: string;
	title: string;
	description?: string;
}

interface InteractiveListPayload {
	type: "list";
	body: { text: string };
	action: {
		button: string;
		sections: Array<{ title: string; rows: ListRow[] }>;
	};
}

export type InteractivePayload = InteractiveButtonPayload | InteractiveListPayload;

interface WhatsAppInteractiveProps {
	payload: InteractivePayload;
	onReply: (replyId: string, replyTitle: string) => void;
	disabled?: boolean;
}

export function WhatsAppInteractive({ payload, onReply, disabled }: WhatsAppInteractiveProps) {
	if (payload.type === "button") {
		return <ReplyButtons payload={payload} onReply={onReply} disabled={disabled} />;
	}
	return <ListMessage payload={payload} onReply={onReply} disabled={disabled} />;
}

function ReplyButtons({
	payload,
	onReply,
	disabled,
}: {
	payload: InteractiveButtonPayload;
	onReply: (replyId: string, replyTitle: string) => void;
	disabled?: boolean;
}) {
	return (
		<div className="flex w-full justify-start">
			<div className="w-full max-w-[80%] overflow-hidden rounded-lg bg-white text-sm shadow-sm dark:bg-[#202c33]">
				<div className="px-3 py-2 text-[#111] dark:text-white whitespace-pre-wrap break-words">
					{payload.body.text}
				</div>
				<div className="flex flex-col divide-y divide-border border-t">
					{payload.action.buttons.slice(0, 3).map((b) => (
						<button
							key={b.reply.id}
							type="button"
							onClick={() => onReply(b.reply.id, b.reply.title)}
							disabled={disabled}
							className={cn(
								"px-3 py-2.5 text-center text-sm font-medium text-[#00a884] hover:bg-muted/50",
								disabled && "opacity-50",
							)}
						>
							{b.reply.title}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

function ListMessage({
	payload,
	onReply,
	disabled,
}: {
	payload: InteractiveListPayload;
	onReply: (replyId: string, replyTitle: string) => void;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="flex w-full justify-start">
			<div className="w-full max-w-[80%] overflow-hidden rounded-lg bg-white text-sm shadow-sm dark:bg-[#202c33]">
				<div className="px-3 py-2 text-[#111] dark:text-white whitespace-pre-wrap break-words">
					{payload.body.text}
				</div>
				<Sheet open={open} onOpenChange={setOpen}>
					<SheetTrigger
						type="button"
						disabled={disabled}
						className={cn(
							"w-full border-t px-3 py-2.5 text-center text-sm font-medium text-[#00a884] hover:bg-muted/50",
							disabled && "opacity-50",
						)}
					>
						☰ {payload.action.button}
					</SheetTrigger>
					<SheetContent side="bottom" className="max-h-[60vh]">
						{payload.action.sections.map((sec) => (
							<div key={sec.title} className="space-y-1">
								<SheetHeader>
									<SheetTitle>{sec.title}</SheetTitle>
								</SheetHeader>
								<ul className="divide-y divide-border">
									{sec.rows.map((row) => (
										<li key={row.id}>
											<button
												type="button"
												className="w-full px-1 py-3 text-left hover:bg-muted/50"
												onClick={() => {
													onReply(row.id, row.title);
													setOpen(false);
												}}
											>
												<div className="text-sm font-medium">{row.title}</div>
												{row.description && (
													<div className="text-xs text-muted-foreground">{row.description}</div>
												)}
											</button>
										</li>
									))}
								</ul>
							</div>
						))}
					</SheetContent>
				</Sheet>
			</div>
		</div>
	);
}
