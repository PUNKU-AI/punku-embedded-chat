import { createBackendStreamError, createHttpError } from "./backendError";
import { fetchWithWidgetAuth, WidgetCredentials } from "./widgetAuth";

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export class InvalidRequestHeaderError extends Error {
  code = "ERR_INVALID_REQUEST_HEADER";
  headerName: string;
  reason: string;

  constructor(headerName: string, reason: string) {
    super(`Invalid request header "${headerName}": ${reason}`);
    this.name = "InvalidRequestHeaderError";
    this.headerName = headerName;
    this.reason = reason;
    Object.setPrototypeOf(this, InvalidRequestHeaderError.prototype);
  }
}

export type StreamTerminal = "end" | "done";

export class StreamProtocolError extends Error {
  code: string;

  constructor(message: string, code = "ERR_STREAM_PROTOCOL") {
    super(message);
    this.name = "StreamProtocolError";
    this.code = code;
    Object.setPrototypeOf(this, StreamProtocolError.prototype);
  }
}

function validateRequestHeader(headerName: string, headerValue: unknown) {
  if (!HEADER_NAME_PATTERN.test(headerName)) {
    throw new InvalidRequestHeaderError(
      headerName,
      "header names must be valid HTTP token characters"
    );
  }

  if (typeof headerValue !== "string") {
    throw new InvalidRequestHeaderError(headerName, "header values must be strings");
  }

  for (let index = 0; index < headerValue.length; index += 1) {
    const codePoint = headerValue.charCodeAt(index);

    if (codePoint > 255) {
      throw new InvalidRequestHeaderError(
        headerName,
        "header values must contain only ISO-8859-1 code points"
      );
    }

    if (codePoint === 0 || codePoint === 10 || codePoint === 13) {
      throw new InvalidRequestHeaderError(
        headerName,
        "header values cannot contain null, carriage return, or newline characters"
      );
    }
  }
}

function buildRequestHeaders(
  authHeaders: { [key: string]: string },
  additional_headers?: { [key: string]: string }
) {
  let headers: { [key: string]: string } = { "Content-Type": "application/json", ...authHeaders };

  if (additional_headers) {
    headers = { ...headers, ...additional_headers };
  }

  Object.keys(headers).forEach((headerName) => {
    validateRequestHeader(headerName, headers[headerName]);
  });

  return headers;
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
  publishable_key?: string,
){
  let data: any = {input_type, input_value: message, output_type}
  
  if (tweaks) {
    data["tweaks"]= tweaks
  }

  if (output_component) {
    data["output_component"] = output_component;
  }

  // Invalid extra headers fail before any request, also before a token request.
  buildRequestHeaders({}, additional_headers);

  const url = `${baseUrl}/api/v1/run/${flowId}`;
  const credentials: WidgetCredentials = {
    hostUrl: baseUrl, flowId, sessionId, publishableKey: publishable_key, apiKey: api_key,
  };

    const response = await fetchWithWidgetAuth(credentials, (authHeaders) => {
      // The token request can change the session, so the body reads it at send time.
      if (sessionId.current && sessionId.current !== "") {
        data.session_id = sessionId.current;
      }
      return fetch(url, {
        method: 'POST',
        headers: buildRequestHeaders(authHeaders, additional_headers),
        body: JSON.stringify(data)
      });
    });
    
    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }
    
    const responseData = await response.json();
    
    // Keep the response format used by chat callers.
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
    onStreamEnd?: (terminal?: StreamTerminal) => void,
    onStreamError?: (error: any) => void,
    publishable_key?: string,
  ){
    let data: any = {input_type, input_value: message, output_type}
      
    if (tweaks) {
        data["tweaks"]= tweaks
    }
  
    if (output_component) {
        data["output_component"] = output_component;
    }
  
    try {
      // Invalid extra headers fail before any request, also before a token request.
      buildRequestHeaders({}, additional_headers);
      const url = `${baseUrl}/api/v1/run/${flowId}?stream=true`
      const credentials: WidgetCredentials = {
        hostUrl: baseUrl, flowId, sessionId, publishableKey: publishable_key, apiKey: api_key,
      };
    
      // console.log('🚀 Starting streaming request to:', url);
      // console.log('📦 Request data:', data);
      // console.log('📋 Headers:', headers);
    
      const response = await fetchWithWidgetAuth(credentials, (authHeaders) => {
        // The token request can change the session, so the body reads it at send time.
        if (sessionId.current && sessionId.current !== "") {
          data.session_id = sessionId.current;
        }
        return fetch(url, {
          method: 'POST',
          headers: buildRequestHeaders(authHeaders, additional_headers),
          body: JSON.stringify(data)
        });
      });
  
      // console.log('📡 Response status:', response.status);
      // console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
  
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP Error Response:', errorText);
        throw createHttpError(response.status, errorText);
      }
  
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Stream not supported');
      }
  
      const decoder = new TextDecoder();
      let buffer = '';
      let terminalReceived = false;

      const processEventLine = (line: string): boolean => {
        const eventData = line.trim();

        if (eventData === '') {
          return false;
        }

        if (eventData === '[DONE]') {
          terminalReceived = true;
          onStreamEnd?.("done");
          return true;
        }

        let parsedData: any;
        try {
          parsedData = JSON.parse(eventData);
        } catch {
          throw new StreamProtocolError(
            "The assistant returned an invalid stream response. Please try again.",
            "ERR_INVALID_STREAM_EVENT"
          );
        }

        onStreamData?.(parsedData);

        if (parsedData?.event === "error") {
          terminalReceived = true;
          throw createBackendStreamError(parsedData);
        }

        if (parsedData?.event === "end") {
          terminalReceived = true;
          onStreamEnd?.("end");
          return true;
        }

        return false;
      };
  
      // console.log('🔄 Starting to read stream...');
  
      while (true) {
        const { done, value } = await reader.read();
          
        if (done) {
          buffer += decoder.decode();

          if (buffer && processEventLine(buffer)) {
            return;
          }

          if (!terminalReceived) {
            throw new StreamProtocolError(
              "The assistant response ended before it completed. Please try again.",
              "ERR_PREMATURE_STREAM_END"
            );
          }

          return;
        }
  
        const chunkText = decoder.decode(value, { stream: true });
        // console.log(`📦 Chunk ${chunkCount}:`, JSON.stringify(chunkText));
        
        buffer += chunkText;
        // console.log(`🗃️ Current buffer:`, JSON.stringify(buffer));
        
        // Process complete lines
        const lines = buffer.split('\n');
        const incompleteLine = lines.pop() || '';
        
        // console.log(`📄 Complete lines to process:`, lines);
        // console.log(`⏳ Incomplete line kept in buffer:`, JSON.stringify(incompleteLine));
        
        buffer = incompleteLine;
  
        for (const line of lines) {
          if (processEventLine(line)) {
            return;
          }
        }
      }
    } catch (error) {
      console.error('💥 Streaming error:', error);
      onStreamError?.(error);
      throw error;
    }
  }

export interface FeedbackWidgetContext {
  flowId: string;
  sessionId: { current: string };
  publishableKey?: string;
}

export async function sendFeedback(
  baseUrl: string,
  message_id: string,
  feedback: string,
  api_key?: string,
  additional_headers?: {[key: string]: string},
  widget?: FeedbackWidgetContext
) {
  // Preserve case-insensitive overrides. Fetch otherwise joins duplicate names.
  const headersWith = (authHeaders: Record<string, string>) => Object.fromEntries(
    Object.entries(buildRequestHeaders(authHeaders, additional_headers))
      .map(([name, value]) => [name.toLowerCase(), value])
  );
  // Invalid extra headers fail before any request, also before a token request.
  headersWith({});

  // Prepare the request body according to MessageUpdate model
  const requestBody = {
    properties: {
      positive_feedback: feedback === 'positive' ? true : false
    }
  };

  const send = (authHeaders: Record<string, string>) => fetch(
    `${baseUrl}/api/v1/monitor/messages/${message_id}`,
    {
      method: 'PUT',
      headers: headersWith(authHeaders),
      body: JSON.stringify(requestBody),
      credentials: 'same-origin'
    }
  );
  // With the widget's context the feedback uses the visitor token of the chat session.
  const response = widget
    ? await fetchWithWidgetAuth(
        {
          hostUrl: baseUrl,
          flowId: widget.flowId,
          sessionId: widget.sessionId,
          publishableKey: widget.publishableKey,
          apiKey: api_key,
        },
        send
      )
    : await send(api_key ? { "x-api-key": api_key } : {});

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  // Feedback endpoints can return JSON, plain text, or no content.
  const responseText = await response.text();
  let responseData: unknown = responseText;
  if (responseText) {
    try {
      responseData = JSON.parse(responseText);
    } catch {
      // A successful text response still confirms the feedback update.
    }
  }

  return {
    data: responseData,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  };
}
