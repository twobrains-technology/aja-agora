// Smoke test for `conversation_evaluations` table.
// Run with: node --env-file=.env scripts/validate-eval-schema.mjs
//
// Verifies E1 acceptance criteria:
// 1. Insert with valid payload succeeds
// 2. Insert with overall_score = 1.5 is rejected by check constraint
// 3. Insert with bogus evaluated_until_message_id is rejected by FK
// 4. DELETE FROM conversations cascades to conversation_evaluations
//
// Creates a throwaway conversation, runs assertions, cleans up.

import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set. Run with: node --env-file=.env scripts/...");
	process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

let convId;
let testsPassed = 0;
let testsFailed = 0;

const ok = (msg) => {
	console.log(`✓ ${msg}`);
	testsPassed++;
};
const fail = (msg, err) => {
	console.error(`✗ ${msg}`, err?.message ?? err ?? "");
	testsFailed++;
};

try {
	// Create throwaway conversation
	const convRes = await client.query(
		`INSERT INTO conversations (channel, status) VALUES ('web', 'active') RETURNING id`,
	);
	convId = convRes.rows[0].id;
	console.log(`Setup: temp conversation ${convId}`);

	// Test 1 — valid insert succeeds
	try {
		await client.query(
			`INSERT INTO conversation_evaluations
			   (conversation_id, rubric_version, judge_model, overall_score, dimensions, flags, top_issues, top_strengths, tokens_input, tokens_output)
			 VALUES ($1, 'v1', 'claude-sonnet-4-6', 0.82, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, 4500, 480)`,
			[
				convId,
				JSON.stringify({
					engajamento: { score: 0.8, reasoning: "x" },
					discovery: { score: 0.7, reasoning: "x" },
					continuidade: { score: 0.9, reasoning: "x" },
					naturalidade: { score: 0.85, reasoning: "x" },
					assertividade: { score: 0.8, reasoning: "x" },
					conversao: { score: 0.7, reasoning: "x" },
				}),
				JSON.stringify({
					hallucination: false,
					missedHandoff: false,
					incompleteDiscovery: false,
					lowEngagement: false,
				}),
				JSON.stringify(["a", "b"]),
				JSON.stringify(["c"]),
			],
		);
		ok("insert válido aceito");
	} catch (err) {
		fail("insert válido deveria passar", err);
	}

	// Test 2 — overall_score = 1.5 is rejected
	try {
		await client.query(
			`INSERT INTO conversation_evaluations
			   (conversation_id, rubric_version, judge_model, overall_score)
			 VALUES ($1, 'v1', 'x', 1.5)`,
			[convId],
		);
		fail("score 1.5 deveria ser rejeitado");
	} catch (err) {
		if (err.message.includes("conversation_evaluations_overall_score_check")) {
			ok("score 1.5 rejeitado pelo check constraint");
		} else {
			fail("score 1.5 falhou por motivo errado", err);
		}
	}

	// Test 3 — bogus evaluated_until_message_id is rejected
	try {
		await client.query(
			`INSERT INTO conversation_evaluations
			   (conversation_id, rubric_version, judge_model, evaluated_until_message_id)
			 VALUES ($1, 'v1', 'x', '00000000-0000-0000-0000-000000000000')`,
			[convId],
		);
		fail("FK message_id inexistente deveria ser rejeitada");
	} catch (err) {
		if (
			err.message.includes("foreign key constraint") &&
			err.message.includes("evaluated_until_message_id")
		) {
			ok("FK message_id inexistente rejeitada");
		} else {
			fail("FK message_id falhou por motivo errado", err);
		}
	}

	// Test 4 — cascade delete
	const beforeRes = await client.query(
		`SELECT count(*)::int AS n FROM conversation_evaluations WHERE conversation_id = $1`,
		[convId],
	);
	if (beforeRes.rows[0].n < 1) {
		fail("setup falhou: nenhuma eval pra testar cascade");
	} else {
		await client.query(`DELETE FROM conversations WHERE id = $1`, [convId]);
		const afterRes = await client.query(
			`SELECT count(*)::int AS n FROM conversation_evaluations WHERE conversation_id = $1`,
			[convId],
		);
		if (afterRes.rows[0].n === 0) {
			ok("cascade delete: evals removidas com a conversa");
			convId = null; // cleanup já feito
		} else {
			fail(`cascade falhou: ${afterRes.rows[0].n} evals ainda presentes`);
		}
	}
} finally {
	if (convId) {
		await client.query(`DELETE FROM conversations WHERE id = $1`, [convId]);
		console.log(`Cleanup: removed temp conversation ${convId}`);
	}
	await client.end();
}

console.log(`\nResultado: ${testsPassed} passed, ${testsFailed} failed`);
process.exit(testsFailed === 0 ? 0 : 1);
