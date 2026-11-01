/* Bounded shutdown for a child created by the calling test, including signal exits. */
const { once } = require('node:events');
module.exports = async function stopChild(child, graceMs = 3000) {
    if (child.exitCode !== null || child.signalCode !== null) return { forced: false };
    const exited = once(child, 'exit'); let timer;
    child.kill('SIGTERM');
    try {
        await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, graceMs); })]);
    } finally { clearTimeout(timer); }
    const forced = child.exitCode === null && child.signalCode === null;
    if (forced) { child.kill('SIGKILL'); await exited; }
    return { forced };
};
