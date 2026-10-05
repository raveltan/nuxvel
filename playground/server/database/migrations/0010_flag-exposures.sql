CREATE TABLE "flag_exposures" (
	"name" text NOT NULL,
	"unit_id" text NOT NULL,
	"variant" text NOT NULL,
	"exposed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "flag_exposures_name_unit_id_variant_pk" PRIMARY KEY("name","unit_id","variant")
);
