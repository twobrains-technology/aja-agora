CREATE TABLE "experimento_fila" (
	"experimento" text PRIMARY KEY NOT NULL,
	"proximo" bigint DEFAULT 0 NOT NULL
);
