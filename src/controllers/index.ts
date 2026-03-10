import axios from "axios";

// Error types for better diagnostics
export type NetworkErrorType =
  | 'network_blocked'    // Request never reached server (firewall, DNS, ad blocker)
  | 'timeout'            // Request timed out
  | 'server_error'       // Server responded with 5xx
  | 'client_error'       // Server responded with 4xx
  | 'cors_error'         // CORS-related failure
  | 'unknown';           // Catch-all

export class ChatNetworkError extends Error {
  public errorType: NetworkErrorType;
  public statusCode?: number;
  public requestUrl: string;
  public retryable: boolean;

  constructor(
    message: string,
    errorType: NetworkErrorType,
    requestUrl: string,
    statusCode?: number
  ) {
    super(message);
    this.name = 'ChatNetworkError';
    this.errorType = errorType;
    this.statusCode = statusCode;
    this.requestUrl = requestUrl;
    this.retryable = errorType === 'network_blocked' || errorType === 'timeout' || errorType === 'server_error';
  }
}

function classifyFetchError(error: unknown, url: string): ChatNetworkError {
  if (error instanceof ChatNetworkError) return error;

  if (error instanceof TypeError) {
    // TypeError: Failed to fetch — typical for network blocks, CORS, DNS failures
    const message = error.message || '';
    if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('Network request failed')) {
      return new ChatNetworkError(
        `Unable to reach the server. The request to ${new URL(url).hostname} was blocked. This may be caused by a firewall, ad blocker, or network restriction.`,
        'network_blocked',
        url
      );
    }
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ChatNetworkError(
      'The request timed out. Please check your internet connection and try again.',
      'timeout',
      url
    );
  }

  const msg = error instanceof Error ? error.message : String(error);
  return new ChatNetworkError(msg, 'unknown', url);
}

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000]; // 1s, 3s

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  maxRetries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: ChatNetworkError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = classifyFetchError(error, url);

      // Only retry on retryable errors and if we have retries left
      if (!lastError.retryable || attempt >= maxRetries) {
        throw lastError;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt] || 3000));
    }
  }

  throw lastError || new ChatNetworkError('Request failed', 'unknown', url);
}

export async function sendMessage(
  baseUrl: string,
  flowId: string,
  message: string,
  input_type: string,
  output_type: string,
  sessionId: React.MutableRefObject<string>,
  output_component?: string,
  tweaks?: Object,
  api_key?: string,
  additional_headers?: {[key:string]:string},
){
  let data: any = {input_type, input_value: message, output_type}

  if (tweaks) {
    data["tweaks"]= tweaks
  }

  if (output_component) {
    data["output_component"] = output_component;
  }

  if(sessionId.current && sessionId.current !== ""){
    data.session_id=sessionId.current;
  }

  let headers:{[key:string]:string} = {"Content-Type": "application/json"}

  if (api_key) {
    headers["x-api-key"] = api_key;
  }

  if (additional_headers) {
    headers = {...headers, ...additional_headers};
  }

  const url = `${baseUrl}/api/v1/run/${flowId}`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const errorType = response.status >= 500 ? 'server_error' : 'client_error';
    throw new ChatNetworkError(
      `HTTP error! status: ${response.status}`,
      errorType,
      url,
      response.status
    );
  }

  const responseData = await response.json();

  // Return axios-like format
  return {
    data: responseData,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  };
}

  export async function streamMessage(
    baseUrl: string,
    flowId: string,
    message: string,
    input_type: string,
    output_type: string,
    sessionId: React.MutableRefObject<string>,
    output_component?: string,
    tweaks?: Object,
    api_key?: string,
    additional_headers?: {[key:string]:string},
    onStreamData?: (data: any) => void,
    onStreamEnd?: () => void,
    onStreamError?: (error: any) => void
  ){
    let data: any = {input_type, input_value: message, output_type}

    if (tweaks) {
        data["tweaks"]= tweaks
    }

    if (output_component) {
        data["output_component"] = output_component;
    }

    if(sessionId.current && sessionId.current !== ""){
      data.session_id=sessionId.current;
    }

    let headers:{[key:string]:string} = {"Content-Type": "application/json"}

    if (api_key) {
        headers["x-api-key"] = api_key;
    }

    if (additional_headers) {
      headers = {...headers, ...additional_headers};
    }

    const url = `${baseUrl}/api/v1/run/${flowId}?stream=true`

    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('HTTP Error Response:', errorText);
        const errorType = response.status >= 500 ? 'server_error' : 'client_error';
        throw new ChatNetworkError(
          `HTTP error! status: ${response.status}, body: ${errorText}`,
          errorType,
          url,
          response.status
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Stream not supported');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          onStreamEnd?.();
          break;
        }

        const chunkText = decoder.decode(value, { stream: true });

        buffer += chunkText;

        // Process complete lines
        const lines = buffer.split('\n');
        const incompleteLine = lines.pop() || '';

        buffer = incompleteLine;

        for (const line of lines) {
          try {
            const eventData = line.trim();

            if (eventData === '[DONE]') {
              onStreamEnd?.();
              return;
            }

            if (eventData === '') {
              continue;
            }

            const parsedData = JSON.parse(eventData);
            onStreamData?.(parsedData);
          } catch (parseError) {
            // Non-JSON line, skip
          }
        }
      }
    } catch (error) {
      // Classify the error if it's not already classified
      const classifiedError = error instanceof ChatNetworkError
        ? error
        : classifyFetchError(error, url);
      console.error('Streaming error:', classifiedError);
      onStreamError?.(classifiedError);
      throw classifiedError;
    }
  }

export async function sendFeedback(
  baseUrl: string,
  message_id: string,
  feedback: string,
  api_key?: string,
  additional_headers?: {[key: string]: string}
) {
  let headers: {[key: string]: string} = {"Content-Type": "application/json"}
  if (api_key) {
    headers["x-api-key"] = api_key;
  }
  if (additional_headers) {
    headers = Object.assign(headers, additional_headers);
  }

  // Prepare the request body according to MessageUpdate model
  const requestBody = {
    properties: {
      positive_feedback: feedback === 'positive' ? true : false
    }
  };

  return axios.put(
    `${baseUrl}/api/v1/monitor/messages/${message_id}`,
    requestBody,
    { headers }
  );
}
