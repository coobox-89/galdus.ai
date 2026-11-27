// Minimal OpenAI-compatible server for end-to-end tests: chat (streamed or not) and embeddings.
import http from 'node:http';

const REPLY = 'Ecco una risposta di prova da **Galdus**: tutto funziona.';
const port = Number(process.env.FAKE_LLM_PORT || 9002);

http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const now = Math.floor(Date.now() / 1000);
    if (req.url.endsWith('/embeddings')) {
      const input = Array.isArray(body.input) ? body.input : [body.input];
      return json(res, { object: 'list', model: body.model, data: input.map((_, i) => ({ object: 'embedding', index: i, embedding: Array(8).fill(0.01 * (i + 1)) })), usage: { prompt_tokens: 1, total_tokens: 1 } });
    }
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const w of REPLY.split(' ')) res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: now, model: body.model, choices: [{ index: 0, delta: { content: `${w} ` }, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: now, model: body.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 9, total_tokens: 14 } })}\n\n`);
      return res.end('data: [DONE]\n\n');
    }
    json(res, { id: 'x', object: 'chat.completion', created: now, model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: REPLY }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 9, total_tokens: 12 } });
  });
}).listen(port, '127.0.0.1');

function json(res, obj) { const b = JSON.stringify(obj); res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(b) }); res.end(b); }
