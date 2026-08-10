import type { SVGProps } from "react";

/**
 * Casinha do pictograma de contemplações (Figma, `casinha.svg`).
 *
 * Vem do design, e não do lucide, porque o desenho é próprio: telhado com haste
 * lateral e quatro janelinhas. O `fill` original era `#F2404F` fixo; aqui vira
 * `currentColor` para a grade poder alternar coral (contemplada) e cinza (não
 * contemplada) só trocando a classe de cor.
 */
export function Casinha({ className, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 29 25"
			fill="currentColor"
			className={className}
			aria-hidden="true"
			{...props}
		>
			<path d="M14.4947 4.34839L4.44531 14.4461V24.4472H11.161V17.4899H17.7801V24.4472H24.4958V14.4461L14.4947 4.34839ZM12.6588 10.0495H14.2049V11.5956H12.6588V10.0495ZM12.6588 13.7697V12.2237H14.2049V13.7697H12.6588ZM16.3307 13.7697H14.7846V12.2237H16.3307V13.7697ZM16.3307 10.0495V11.5956H14.7846V10.0495H16.3307Z" />
			<path d="M15.4123 0.917977L15.0258 0.579775L14.4944 0L13.9629 0.579775L10.0011 4.49325V2.12584H5.991V8.55167L4.44494 10.0494L0 14.5427L1.73932 16.282L4.44494 13.5764L8.50336 9.56628L14.4944 3.52696L27.2494 16.282L28.9887 14.5427L15.4123 0.917977Z" />
		</svg>
	);
}
