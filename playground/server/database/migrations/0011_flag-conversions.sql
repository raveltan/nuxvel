CREATE TABLE "flag_conversions" (
	"name" text NOT NULL,
	"unit_id" text NOT NULL,
	"metric" text NOT NULL,
	"converted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "flag_conversions_name_unit_id_metric_pk" PRIMARY KEY("name","unit_id","metric")
);
