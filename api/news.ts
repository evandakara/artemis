import { handleNews, toResponse } from '../server/handlers.js';

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return toResponse(await handleNews(params, process.env));
}
