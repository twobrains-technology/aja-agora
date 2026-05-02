export interface InviteEmailParams {
	name: string;
	link: string;
	expiresAt: Date;
}

export interface EmailTemplate {
	subject: string;
	html: string;
	text: string;
}

export function inviteEmailTemplate({ name, link, expiresAt }: InviteEmailParams): EmailTemplate {
	const expiresFormatted = expiresAt.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});

	const subject = "Seu convite para o Aja Agora";

	const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <tr>
            <td style="padding:32px 32px 16px 32px;">
              <div style="font-size:14px;font-weight:600;letter-spacing:0.5px;color:#6366f1;text-transform:uppercase;">Aja Agora</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 8px 32px;">
              <h1 style="margin:0;font-size:24px;line-height:1.3;color:#111827;font-weight:600;">Olá, ${escapeHtml(name)}!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 32px 24px 32px;">
              <p style="margin:0;font-size:16px;line-height:1.6;color:#4b5563;">
                Você foi convidado para atuar como atendente na plataforma <strong>Aja Agora</strong>. Para ativar sua conta, defina sua senha clicando no botão abaixo.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 32px 24px 32px;">
              <a href="${link}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 32px;border-radius:8px;">
                Definir minha senha
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
                Ou copie e cole este link no seu navegador:<br>
                <a href="${link}" style="color:#6366f1;word-break:break-all;">${link}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 32px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#9ca3af;">
                Este link expira em <strong>${expiresFormatted}</strong>. Se você não esperava este convite, pode ignorar este email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

	const text = [
		`Olá, ${name}!`,
		"",
		"Você foi convidado para atuar como atendente na plataforma Aja Agora.",
		"Para ativar sua conta, defina sua senha acessando o link abaixo:",
		"",
		link,
		"",
		`Este link expira em ${expiresFormatted}.`,
		"Se você não esperava este convite, pode ignorar este email.",
	].join("\n");

	return { subject, html, text };
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
