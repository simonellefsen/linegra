import { extractE2eAccessToken } from '../../lib/e2eToken';
import { createServiceSupabase } from '../../lib/supabaseService';

export const config = { runtime: 'edge' };

const notFound = () =>
  new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const env =
    (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {};
  const serviceEmail = env.E2E_SERVICE_USER_EMAIL;
  const servicePassword = env.E2E_SERVICE_USER_PASSWORD;
  if (!serviceEmail || !servicePassword) {
    return notFound();
  }

  const token =
    extractE2eAccessToken(request.headers.get('authorization')) ??
    extractE2eAccessToken(request.headers.get('x-e2e-token'));
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing E2E access token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let serviceClient;
  try {
    serviceClient = createServiceSupabase();
  } catch {
    return notFound();
  }

  const { data: tokenId, error: consumeError } = await serviceClient.rpc('consume_e2e_access_token', {
    payload_token: token,
  });
  if (consumeError || !tokenId) {
    return new Response(JSON.stringify({ error: 'Invalid or expired E2E access token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await serviceClient.auth.signInWithPassword({
    email: serviceEmail,
    password: servicePassword,
  });
  if (error || !data.session) {
    return new Response(JSON.stringify({ error: 'E2E service sign-in failed' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return Response.json({ session: data.session });
}
