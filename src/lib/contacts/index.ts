// FIX-42 — módulo de cliente unificado (`contacts`).
export {
	attachContact,
	type Contact,
	type ContactInput,
	consolidateIdentifiers,
	findContactByIdentifier,
	hasIdentifier,
	type NormalizedContactInput,
	normalizeContactInput,
	resolveContact,
} from "./resolve";
