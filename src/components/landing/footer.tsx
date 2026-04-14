import Link from "next/link";

import Logo from "@/components/shadcn-studio/logo";
import { Separator } from "@/components/ui/separator";

export function Footer() {
  return (
    <footer>
      <Separator />

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-6 max-md:flex-col sm:px-6 md:py-8">
        <Link href="/">
          <Logo />
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <a
            href="#"
            className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            Termos de Uso
          </a>
          <a
            href="#"
            className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            Politica de Privacidade
          </a>
        </div>
      </div>

      <Separator />

      <div className="mx-auto flex max-w-7xl justify-center px-4 py-8 sm:px-6">
        <p className="text-muted-foreground text-center text-sm text-balance">
          {`\u00A9${new Date().getFullYear()}`}{" "}
          <Link href="/" className="hover:underline">
            Aja Agora
          </Link>
          . Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
