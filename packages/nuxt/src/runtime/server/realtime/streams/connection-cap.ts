import { RateLimitedError } from "../../errors/taxonomy";

const RETRY_AFTER_SECONDS = 10;

const openByOwner = new Map<string, number>();

export function claimConnectionSlot(owner: string, max: number) {
  const open = openByOwner.get(owner) ?? 0;

  if (open >= max) {
    throw new RateLimitedError(`At most ${max} realtime connections can be open at once`, {
      retryAfter: RETRY_AFTER_SECONDS,
    });
  }

  openByOwner.set(owner, open + 1);

  return () => {
    const left = (openByOwner.get(owner) ?? 1) - 1;

    if (left > 0) openByOwner.set(owner, left);
    else openByOwner.delete(owner);
  };
}
