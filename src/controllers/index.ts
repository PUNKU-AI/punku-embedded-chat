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
  additional_headers?: { [key: string]: string },
  onStreamData?: (data: any) => void,
  onStreamEnd?: () => void,
  onStreamError?: (error: any) => void
) {
  let data: any = { input_type, input_value: message, output_type };

  if (tweaks) {
    data["tweaks"] = tweaks;
  }

  if (output_component) {
    data["output_component"] = output_component;
  }

  if (sessionId.current && sessionId.current !== "") {
    data.session_id = sessionId.current;
  }

  let headers: { [key: string]: string } = { "Content-Type": "application/json" };

  if (api_key) {
    headers["x-api-key"] = api_key;
  }

  if (additional_headers) {
    headers = { ...headers, ...additional_headers };
  }

  const url = `${baseUrl}/api/v1/run/${flowId}?stream=true`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ HTTP Error Response:", errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Stream not supported");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        onStreamEnd?.();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines; keep any trailing partial line in the buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const eventData = line.trim();

        if (eventData === "[DONE]") {
          onStreamEnd?.();
          return;
        }

        if (eventData === "") {
          continue;
        }

        try {
          onStreamData?.(JSON.parse(eventData));
        } catch (parseError) {
          // A malformed line means a dropped event; keep streaming but leave a trace
          console.warn("Failed to parse streaming event, skipping line:", line, parseError);
        }
      }
    }
  } catch (error) {
    console.error("Streaming error:", error);
    // The error is surfaced via the callback; do not rethrow, the caller does
    // not await this promise and a rethrow becomes an unhandled rejection.
    onStreamError?.(error);
  }
}

export async function sendFeedback(
  baseUrl: string,
  message_id: string,
  feedback: string,
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

  // Request body according to the MessageUpdate model
  const requestBody = {
    properties: {
      positive_feedback: feedback === "positive",
    },
  };

  const response = await fetch(`${baseUrl}/api/v1/monitor/messages/${message_id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return {
    data: await response.json().catch(() => null),
    status: response.status,
  };
}
