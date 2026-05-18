"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const LoginForm = () => {
	const [isVisible, setIsVisible] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const router = useRouter();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setLoading(true);

		try {
			const result = await authClient.signIn.email({ email, password });
			if (result.error) {
				setError(result.error.message || "Credenciais invalidas");
			} else {
				router.push("/admin");
			}
		} catch {
			setError("Erro ao conectar. Tente novamente.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<form className="space-y-4" onSubmit={handleSubmit}>
			{error && (
				<div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
					{error}
				</div>
			)}

			{/* Email */}
			<div className="space-y-1">
				<Label className="leading-5" htmlFor="userEmail">
					Email*
				</Label>
				<Input
					type="email"
					id="userEmail"
					placeholder="admin@ajaagora.com.br"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
				/>
			</div>

			{/* Password */}
			<div className="w-full space-y-1">
				<Label className="leading-5" htmlFor="password">
					Senha*
				</Label>
				<div className="relative">
					<Input
						id="password"
						type={isVisible ? "text" : "password"}
						placeholder="Digite sua senha"
						className="pr-9"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
					<Button
						variant="ghost"
						size="icon"
						type="button"
						onClick={() => setIsVisible((prevState) => !prevState)}
						className="text-muted-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent"
					>
						{isVisible ? <EyeOffIcon /> : <EyeIcon />}
						<span className="sr-only">{isVisible ? "Esconder senha" : "Mostrar senha"}</span>
					</Button>
				</div>
			</div>

			<Button className="w-full" type="submit" disabled={loading}>
				{loading ? "Entrando..." : "Entrar"}
			</Button>
		</form>
	);
};

export default LoginForm;
