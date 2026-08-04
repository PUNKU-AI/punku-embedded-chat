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
      let chunkCount = 0;
  
      // console.log('🔄 Starting to read stream...');
  
      while (true) {
        const { done, value } = await reader.read();
          
        if (done) {
          // console.log('✅ Stream completed naturally');
          onStreamEnd?.();
          break;
        }
  
        chunkCount++;
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
          // console.log(`🔍 Processing line:`, JSON.stringify(line));
          try {
            const eventData = line.trim();
            // console.log(`📝 Event data:`, JSON.stringify(eventData));
            
            if (eventData === '[DONE]') {
              // console.log('🏁 Received [DONE] signal');
              onStreamEnd?.();
              return;
            }
            
            if (eventData === '') {
              // console.log('📭 Empty event data, skipping');
              continue;
            }
            
            const parsedData = JSON.parse(eventData);
            // console.log('✨ Parsed data:', parsedData);
            onStreamData?.(parsedData);
          } catch (parseError) {
            // console.warn('⚠️ Failed to parse streaming data:', parseError);
            // console.warn('🔍 Raw line that failed:', JSON.stringify(line));
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
