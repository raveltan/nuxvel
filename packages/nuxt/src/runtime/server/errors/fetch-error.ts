import { RateLimitedError, TransientError } from "./taxonomy";

interface FetchFailure {
  status?: number;
  response?: Response;
}

function fetchFailure(error: unknown): FetchFailure | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.name !== "FetchError") return fetchFailure(error.cause);

  return {
    status: "status" in error && typeof error.status === "number" ? error.status : undefined,
    response: "response" in error && error.response instanceof Response ? error.response : undefined,
  };
}

function retryAfterSeconds(response: Response | undefined) {
  const seconds = Number(response?.headers.get("retry-after"));

  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

export function toFetchTaxonomyError(error: unknown): TransientError | RateLimitedError | undefined {
  const failure = fetchFailure(error);

  if (!failure) return undefined;

  const { status, response } = failure;

  if (status === 429) {
    return new RateLimitedError("An upstream service is rate limiting us", {
      retryAfter: retryAfterSeconds(response),
    });
  }

  if (status === undefined || status === 408 || status >= 500) {
    return new TransientError(
      status === undefined ? "An upstream service did not answer" : `An upstream service answered ${status}`,
      { cause: error },
    );
  }

  return undefined;
}
