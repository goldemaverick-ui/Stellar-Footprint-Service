/**
 * Standard API response envelope for all endpoints
 */
export interface ResponseEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
