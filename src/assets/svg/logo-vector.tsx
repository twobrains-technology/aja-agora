import type { SVGAttributes } from "react";

const LogoVector = (props: SVGAttributes<SVGElement>) => {
	return (
		<svg
			width="1em"
			height="1em"
			viewBox="0 0 40 40"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			{...props}
		>
			<title>Aja Agora</title>
			{/* Geometric "A" */}
			<path
				d="M12 32L20 10L28 32"
				stroke="currentColor"
				strokeWidth="3.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path d="M14.5 25H25.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />

			{/* AI spark dot */}
			<circle cx="31" cy="9" r="3" fill="currentColor" opacity="0.5" />
		</svg>
	);
};

export default LogoVector;
