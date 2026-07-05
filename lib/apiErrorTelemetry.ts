// Roadmap V3 — persist Edge/API non-2xx responses for admin rollups.

import { createServerSupabase } from './supabaseServer';

export type ApiErrorSource = 'public-api' | 'ai-proxy' | 'middleware';

export interface RecordApiErrorInput {
  source: ApiErrorSource | string;
  route: string;
  statusCode: number;
  message?: string | null;
}

export const recordApiError = async (input: RecordApiErrorInput): Promise<void> => {
  if (input.statusCode < 400) return;
  try {
    const supabase = createServerSupabase();
    const { error } = await supabase.rpc('record_api_error', {
      payload_source: input.source,
      payload_route: input.route,
      payload_status_code: input.statusCode,
      payload_message: input.message ?? null,
    });
    if (error) {
      console.warn('record_api_error failed', error.message);
    }
  } catch (err) {
    console.warn('record_api_error failed', err);
  }
};

/** Attach logging to a finished Response without changing its body/headers. */
export const logApiResponse = async (
  source: ApiErrorSource,
  route: string,
  response: Response,
  message?: string | null
): Promise<Response> => {
  if (response.status >= 400) {
    await recordApiError({
      source,
      route,
      statusCode: response.status,
      message: message ?? (response.statusText || null),
    });
  }
  return response;
};

export const apiErrorResponse = async (
  source: ApiErrorSource,
  route: string,
  body: ConstructorParameters<typeof Response>[0],
  init: ConstructorParameters<typeof Response>[1]
): Promise<Response> => logApiResponse(source, route, new Response(body, init));
