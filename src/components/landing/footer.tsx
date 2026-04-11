import Link from "next/link";

import { Separator } from "@/components/ui/separator";

export function Footer() {
  return (
    <footer>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 max-md:flex-col sm:px-6 sm:py-6 md:gap-6 md:py-8">
        <Link href="/" className="text-xl font-semibold">
          Aja Agora
        </Link>

        <div className="flex items-center gap-5 whitespace-nowrap">
          <a
            href="#"
            className="opacity-80 transition-opacity duration-300 hover:opacity-100"
          >
            Termos de Uso
          </a>
          <a
            href="#"
            className="opacity-80 transition-opacity duration-300 hover:opacity-100"
          >
            Política de Privacidade
          </a>
        </div>
      </div>

      <Separator />

      <div className="mx-auto flex max-w-7xl justify-center px-4 py-8 sm:px-6">
        <p className="text-center font-medium text-balance">
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
