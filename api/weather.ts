import { handleWeather, toResponse } from '../server/handlers.js';

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return toResponse(await handleWeather(params, process.env));
}
