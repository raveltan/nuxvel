import { type MaybeRefOrGetter, type Reactive, reactive, toValue } from "vue";
import { useQuery, useQueryCache, type EntryKeyTagged, type UseQueryReturn } from "@pinia/colada";
import type {
  ChannelEvent,
  ChannelMessage,
  ChannelName,
  ChannelParams,
} from "../../server/realtime/registry";
import { presenceRoom } from "../../shared/realtime/presence-room";
import { useChannelSubscription } from "../realtime/channel-subscription";

type EventPayload<Name extends ChannelName, Event extends ChannelEvent<Name>> = Extract<
  ChannelMessage<Name>,
  { event: Event }
>["payload"];

/** How a channel's events update a query, passed to {@link useLiveQuery}. */
export interface LiveQueryUpdates<TData, Name extends ChannelName> {
  /** The channel whose broadcasts update this query. */
  channel: Name;
  /**
   * The room of the channel to follow, such as `{ boardId: 7 }`. The
   * channel's `defineChannel` names the params, so a wrong param fails
   * to compile. Leave it out to follow the channel itself.
   */
  params?: ChannelParams<Name>;
  /**
   * One patch per event name, returning the new cached value. Each
   * patch's payload is typed as its event schema's output, as the
   * channel's `defineChannel` declares it. An event with no patch here
   * and no entry in `refetch` is ignored.
   */
  on?: {
    [Event in ChannelEvent<Name>]?: (data: TData, payload: EventPayload<Name, Event>) => TData;
  };
  /**
   * The events that refetch the query instead of patching it: `true`
   * refetches on every such event, a predicate on the payload only
   * when it returns `true`. Use it when the payload does not hold the
   * new data.
   */
  refetch?: {
    [Event in ChannelEvent<Name>]?: true | ((payload: EventPayload<Name, Event>) => boolean);
  };
}

/**
 * Runs a tRPC query and keeps it up to date from a realtime channel,
 * by patching its cached result or by refetching it.
 *
 * Auto-imported, and returns what `$api.<path>.useQuery()` returns:
 * Pinia Colada's `useQuery()` result wrapped in `reactive()`, so
 * `posts.data` needs no `.value` and `<QueryState>` works unchanged.
 * Do not destructure the result: wrap it in `toRefs()` first, so the
 * fields stay reactive. It joins the channel when the
 * component mounts, over the connection `useChannel()` shares, and
 * leaves it on unmount. Each broadcast whose event name has a patch in
 * `on` replaces the query's cache entry with what the patch returns —
 * nothing is patched while the query has no cached data yet. Each
 * broadcast that `refetch` selects refetches the query instead, unless
 * the query is disabled. A failed refetch sets the query's `error`. A
 * `created` patch should skip an id the list already holds: the query
 * may have fetched the row after it was broadcast. After a reconnect
 * that missed more events than the channel's replay buffer holds, the
 * server sends `resync` and the query refetches instead. With `params`,
 * it follows one room of the channel, and only the `broadcast()` calls
 * with the same `params` update the query. Reach for
 * the `optimistic` option of `$api.<path>.useMutation()` instead to patch from this tab's own mutations,
 * and for `useChannel()` when the events are not about a query.
 *
 * @param queryOptions Usually `$api.<path>.queryOptions(input)`, or
 * a getter returning it — `() => $api.post.byId.queryOptions({ id:
 * id.value })` — so a changed input refetches, and later broadcasts
 * patch the entry for the new input.
 * @param updates Which channel to follow, and how its events patch or
 * refetch the query — see {@link LiveQueryUpdates}.
 *
 * @example
 * ```ts
 * const posts = useLiveQuery($api.post.list.queryOptions(), {
 *   channel: "posts",
 *   on: {
 *     created: (rows, payload) => {
 *       const post = postSchema.parse(payload);
 *       return rows.some((row) => row.id === post.id) ? rows : [...rows, post];
 *     },
 *     deleted: (rows, { id }) => rows.filter((row) => row.id !== id),
 *   },
 * });
 *
 * const ticket = useLiveQuery($api.ticket.show.queryOptions({ id }), {
 *   channel: "tickets",
 *   refetch: { updated: (payload) => payload.id === id },
 * });
 *
 * const cards = useLiveQuery($api.card.list.queryOptions({ boardId }), {
 *   channel: "board",
 *   params: { boardId },
 *   refetch: { moved: true },
 * });
 * ```
 */
export function useLiveQuery<TData, TError, Name extends ChannelName>(
  queryOptions: MaybeRefOrGetter<{
    key: EntryKeyTagged<TData, TError>;
    query: () => Promise<TData>;
    enabled?: boolean;
  }>,
  updates: LiveQueryUpdates<TData, Name>,
): Reactive<UseQueryReturn<TData>> {
  const queryCache = useQueryCache();
  const query = useQuery(() => toValue(queryOptions));

  function refetch() {
    queryCache.invalidateQueries({ key: toValue(queryOptions).key, exact: true }).catch(() => undefined);
  }

  function apply<Event extends ChannelEvent<Name>>(event: Event, payload: EventPayload<Name, Event>) {
    const refetchWhen = updates.refetch?.[event];

    if (refetchWhen === true || refetchWhen?.(payload)) return refetch();

    const update = updates.on?.[event];

    if (!update) return;

    const { key } = toValue(queryOptions);
    const cached = queryCache.getQueryData(key);

    if (cached === undefined) return;

    queryCache.setQueryData(key, update(cached, payload));
  }

  function receive(message: ChannelMessage<Name>) {
    apply(message.event, message.payload);
  }

  useChannelSubscription(
    updates.params === undefined ? updates.channel : presenceRoom(updates.channel, updates.params),
    (message) => {
      // broadcast() validated the payload against the event's schema before sending it
      receive(message as ChannelMessage<Name>);
    },
    refetch,
  );

  return reactive(query);
}
