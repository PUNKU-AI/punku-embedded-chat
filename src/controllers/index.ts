import axios from "axios";

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

function getBackendStreamErrorMessage(data: any): string {
  const errorData = data?.data;

  if (typeof errorData === "string" && errorData.trim()) {
    return errorData;
  }

  for (const value of [errorData?.text, errorData?.message, errorData?.detail, data?.message]) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "The assistant could not complete the response. Please try again.";
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
  api_key?: string,
  additional_headers?: { [key: string]: string }
) {
  let headers: { [key: string]: string } = { "Content-Type": "application/json" };

  if (api_key) {
    headers["x-api-key"] = api_key;
  }

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

  const headers = buildRequestHeaders(api_key, additional_headers);

  const url = `${baseUrl}/api/v1/run/${flowId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
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
    onStreamEnd?: (terminal?: StreamTerminal) => void,
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
  
    try {
      const headers = buildRequestHeaders(api_key, additional_headers);
      const url = `${baseUrl}/api/v1/run/${flowId}?stream=true`
    
      // console.log('🚀 Starting streaming request to:', url);
      // console.log('📦 Request data:', data);
      // console.log('📋 Headers:', headers);
    
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
  
      // console.log('📡 Response status:', response.status);
      // console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
  
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP Error Response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
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
          throw new StreamProtocolError(
            getBackendStreamErrorMessage(parsedData),
            "ERR_BACKEND_STREAM"
          );
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

export async function sendFeedback(
  baseUrl: string,
  message_id: string,
  feedback: string,
  api_key?: string,
  additional_headers?: {[key: string]: string}
) {
  const headers = buildRequestHeaders(api_key, additional_headers);

  // Prepare the request body according to MessageUpdate model
  const requestBody = {
    properties: {
      positive_feedback: feedback === 'positive' ? true : false
    }
  };

  // console.log(
  //   `PUT ${baseUrl}/api/v1/monitor/messages/${message_id}`,
  //   requestBody,
  //   { headers }
  // );

  return axios.put(
    `${baseUrl}/api/v1/monitor/messages/${message_id}`,
    requestBody,
    { headers }
  );
}
