/** Shared shutdown flag — set by server.js, read by any module. */
let shuttingDown = false;
module.exports = {
  isShuttingDown: () => shuttingDown,
  setShuttingDown: () => { shuttingDown = true; },
};
