import type { Express, Request, Response } from 'express';
import { createApp } from './main';

let cachedServer: Express | undefined;

async function getServer(): Promise<Express> {
  if (!cachedServer) {
    const app = await createApp();
    await app.init();
    cachedServer = app.getHttpAdapter().getInstance() as Express;
  }

  return cachedServer;
}

export default async function handler(request: Request, response: Response) {
  const server = await getServer();
  return server(request, response);
}
