import { streamMultipart } from "multipart-formdata-stream-js";
import { Part } from "./part";

// Basic file upload handler
export async function handleUpload(body: ReadableStream, headers: Headers) {
  // Extract boundary from Content-Type header
  const contentType = headers.get("content-type");
  if (!contentType) {
    throw new Error("No content-type provided. Needed for boundary");
  }
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error("Invalid content type: boundary not found");
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  // Process each part
  for await (const part of streamMultipart(
    body,
    boundary,
  ) as AsyncIterableIterator<Part>) {
    console.log(`Processing: ${part.name}`);

    // Check if it's a file
    if (part.filename) {
      console.log(`File: ${part.filename}, Type: ${part["content-type"]}`);

      // Stream file data
      let totalSize = 0;
      for await (const chunk of part.data) {
        // Process chunk (e.g., write to storage)
        totalSize += chunk.length;
        console.log(`Chunk size: ${chunk.length}`);
      }
      console.log(`Total file size: ${totalSize}`);
    } else {
      // It's a text field - collect and decode
      const decoder = new TextDecoder();
      let text = "";

      for await (const chunk of part.data) {
        text += decoder.decode(chunk, { stream: true });
      }
      text += decoder.decode(); // Final flush

      console.log(`Field ${part.name}: ${text}`);
    }
  }
}
