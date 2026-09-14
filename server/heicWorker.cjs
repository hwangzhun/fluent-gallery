const { parentPort } = require('node:worker_threads');
const decode = require('heic-decode');

parentPort.once('message', async input => {
  try {
    const result = await decode({ buffer: Buffer.from(input) });
    const data = Buffer.from(result.data);
    parentPort.postMessage({ data, width: result.width, height: result.height }, [data.buffer]);
  } catch (error) {
    parentPort.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
});
