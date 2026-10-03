export type ApiErrorCode = 'not_found' | 'validation' | 'unauthorized' | 'forbidden' | 'conflict' | 'network' | 'unknown';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  /** Field-level validation messages, keyed by field name. */
  fields?: Record<string, string>;
  requestId?: string;
}

/** Throwable form of `ApiError`; adapters emit this so consumers can narrow with `instanceof`. */
export class ApiException extends Error implements ApiError {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiException';
  }
}
