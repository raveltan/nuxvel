import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { H3Adapter } from "@bull-board/h3";
import { defineEventHandler, type EventHandler } from "h3";
import { QUEUE_BOARD_PATH } from "../jobs/board-path";
import { queueNames, useQueue } from "../jobs/queue";

let board: EventHandler | undefined;

function boardHandler() {
  if (board) return board;

  const adapter = new H3Adapter();

  adapter.setBasePath(QUEUE_BOARD_PATH);
  createBullBoard({
    queues: queueNames().map((queue) => new BullMQAdapter(useQueue(queue))),
    serverAdapter: adapter,
  });

  board = adapter.registerHandlers().handler;

  return board;
}

export default defineEventHandler(async (event): Promise<unknown> => boardHandler()(event));
