export function getChatPosition(
  triggerPosition: DOMRect,
  Cwidth: number,
  Cheight: number,
  position?: string,
): { 
  top: string; 
  left: string;
  position?: string;
} {
  if (!triggerPosition) {
    return { top: "0px", left: "0px" }; // Return empty string if trigger position is not available
  }
  const { top, left, width, height } = triggerPosition;
  const distance = 5; // Adjust this value to set the desired distance from the trigger
  
  if (!position) return { top: distance + height + "px", left: width + "px" };
  
  switch (position) {
    case "top-left":
      return { top: -distance - Cheight + "px", left: -Cwidth + "px" };
    case "top-center":
      return { top: -distance - Cheight + "px", left: width/2 - Cwidth/2 + "px" };
    case "top-right":
      return { top: -distance - Cheight + "px", left: width + "px" };
    case "center-left":
      return { top: width/2 - Cheight/2 + "px", left: -Cwidth - distance + "px" };
    case "center-right":
      return {
        top: width/2 - Cheight/2 + "px",
        left: width + distance + "px",
      };
    case "bottom-right":
      return { top: distance + height + "px", left: width + "px" };
    case "bottom-center":
      return {
        top: distance + height + "px",
        left: width/2 - Cwidth/2 + "px",
      };
    case "bottom-left":
      return { top: distance + height + "px", left: -Cwidth + "px" };
    default:
      return { top: distance + height + "px", left: width + "px" };
  }
}

export function getAnimationOrigin(position?: string) {
  if (!position) return "origin-top-left";
  
  switch (position) {
    case "top-left":
      return 'origin-bottom-right';
    case "top-center":
      return "origin-bottom";
    case "top-right":
      return "origin-bottom-left";
    case "center-left":
      return "origin-center";
    case "center-right":
      return "origin-center";
    case "bottom-right":
      return "origin-top-left";
    case "bottom-center":
      return "origin-top";
    case "bottom-left":
      return "origin-top-right";
    default:
      return "origin-top-left";
  }
}

export function extractMessageFromOutput(output: any) {
  try {
    // Handle string input directly
    if (typeof output === "string") return output;

    // Handle null/undefined
    if (!output) return "";

    // Handle basic type/message structure
    if (output?.type === "text") return output.message;
    if (output?.type === "object" && output?.message?.text) return output.message.text;

    // Handle messages array
    if (output?.messages?.length > 0) {
      const firstMessage = output.messages[0];
      if (firstMessage.message) return firstMessage.message;
    }

    // Handle nested output structure
    if (output?.outputs?.[0]?.outputs) {
      const outputs = output.outputs[0].outputs;
      if (typeof outputs === 'string') return outputs;
      
      // Check for message in nested structure
      const message = outputs.message?.message?.text || 
                     outputs.message?.text ||
                     (outputs.messages && outputs.messages[0]?.message);
      
      if (message) return message;
    }

    // Handle artifacts structure
    if (output?.artifacts?.message) {
      return output.artifacts.message;
    }

    // Handle results structure
    if (output?.results?.message?.text) {
      return output.results.message.text;
    }

    // Handle nested message objects
    if (output?.message?.message?.text) {
      return output.message.message.text;
    }

    // Handle direct text property
    if (output?.text) {
      return output.text;
    }

    // If we find a message property at the root with data
    if (output?.message?.data?.text) {
      return output.message.data.text;
    }

    // Check nested message data structure
    if (output?.data?.message?.text) {
      return output.data.message.text;
    }

    // Handle first level message property
    if (output?.message && typeof output.message === 'string') {
      return output.message;
    }

    // If no string found, stringify the output for debugging
    console.warn("Unknown message structure:", output);
    return "Message structure not recognized";
  } catch (error) {
    console.error("Error extracting message:", error);
    return "Error processing message";
  }
}
