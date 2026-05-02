import sgMail from "@sendgrid/mail";

let initialized = false;

function init() {
	if (initialized) return;
	const apiKey = process.env.SENDGRID_API_KEY;
	if (!apiKey) {
		throw new Error("SENDGRID_API_KEY is not set. Configure it in .env before sending emails.");
	}
	sgMail.setApiKey(apiKey);
	initialized = true;
}

export interface SendEmailParams {
	to: string;
	subject: string;
	html: string;
	text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<void> {
	init();

	const from = process.env.SENDGRID_FROM_EMAIL;
	if (!from) {
		throw new Error("SENDGRID_FROM_EMAIL is not set. Configure it in .env before sending emails.");
	}

	try {
		await sgMail.send({
			to,
			from,
			subject,
			html,
			text: text ?? stripHtml(html),
		});
		console.log(`[sendgrid] Email sent to ${to} | subject: "${subject}"`);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sendgrid] Failed to send to ${to}: ${message}`);
		throw err;
	}
}

function stripHtml(html: string): string {
	return html
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim();
}
