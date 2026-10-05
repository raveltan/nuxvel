import errorClassifiers from "#nuxvel/error-classifiers";
import { type TaxonomyError, isKnownTaxonomyError } from "./taxonomy";

export function classifyWithApp(error: unknown): TaxonomyError | undefined {
  const classifiers: readonly { classify: (error: unknown) => unknown }[] = errorClassifiers;

  for (const { classify } of classifiers) {
    const classified = classify(error);

    if (isKnownTaxonomyError(classified)) return classified;
  }

  return undefined;
}
