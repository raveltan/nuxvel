export default defineJob({
  handler: () => {
    process.kill(process.pid, "SIGTERM");
    throw new Error("probe.fails-while-stopping failed as the worker stopped");
  },
});
