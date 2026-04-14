// Run with: npx tsx src/scripts/seed-admin.ts
import { auth } from "../lib/auth";
import { db } from "../db";
import { user } from "../db/schema";
import { eq } from "drizzle-orm";

async function seedAdmin() {
	const email = process.env.ADMIN_EMAIL;
	const password = process.env.ADMIN_PASSWORD;

	if (!email || !password) {
		console.error("ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required");
		process.exit(1);
	}

	if (password.length < 8) {
		console.error("ADMIN_PASSWORD must be at least 8 characters");
		process.exit(1);
	}

	try {
		// Create user via Better Auth API
		const result = await auth.api.signUpEmail({
			body: {
				email,
				password,
				name: "Admin",
			},
		});

		// Update role to admin (input: false prevents setting during signup)
		await db
			.update(user)
			.set({ role: "admin" })
			.where(eq(user.id, result.user.id));

		console.log(`Admin user created successfully: ${email} (role: admin)`);
	} catch (error) {
		if (error instanceof Error && error.message.includes("already exists")) {
			console.log(`Admin user already exists: ${email}`);
		} else {
			console.error("Failed to create admin user:", error);
			process.exit(1);
		}
	}
}

seedAdmin();
