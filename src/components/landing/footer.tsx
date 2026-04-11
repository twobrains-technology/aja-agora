import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-between">
          {/* Brand */}
          <div className="text-center md:text-left">
            <p className="text-lg font-bold text-foreground">Aja Agora</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Consorcio inteligente com IA
            </p>
          </div>

          {/* Links */}
          <nav className="flex gap-6 text-sm" aria-label="Footer">
            <Link
              href="/chat"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Comecar conversa
            </Link>
            <Link
              href="#faq"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Perguntas frequentes
            </Link>
          </nav>
        </div>

        {/* Legal */}
        <div className="mt-10 border-t border-border pt-8">
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            Aja Agora nao e uma administradora de consorcio. Atuamos como
            plataforma de recomendacao. Todos os grupos sao geridos por
            administradoras autorizadas pelo Banco Central do Brasil.
          </p>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            &copy; 2026 Aja Agora. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
