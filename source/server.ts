import { createServer } from 'node:http';

export const Server = createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405).end();
    return;
  }

  if (req.url === '/health') {
    const status = JSON.stringify({
      status: 'ok'
    })

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(status);

    return;
  }

  res.writeHead(404).end();
});
