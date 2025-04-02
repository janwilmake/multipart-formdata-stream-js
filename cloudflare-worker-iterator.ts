/**
 *  This is an example on how to use `getReadableFormDataStream` to apply a filter and transformations on FormData.
 */

import { getReadableFormDataStream } from "./index";
import { Part } from "./types";

/**
 * Example filter function that determines which parts to keep
 */
function filterPart(part: Part): boolean {
  // This is a dummy filter function
  // You could filter based on name, filename, content-type, etc.

  if (
    part.filename?.endsWith(".js") ||
    part.filename?.endsWith("/README.md") ||
    part.filename?.endsWith("/package.json")
  ) {
    return true;
  }

  // Default to false - don't keep other parts
  return false;
}

const transformPart = async (part: Part) => {
  if (part["content-transfer-encoding"] === "binary") {
    return null;
  }

  if (part["content-length"] && Number(part["content-length"]) > 1000) {
    return null;
  }

  part.filename = "/test" + part.filename;

  // Modify data for TypeScript files
  if (part.filename?.endsWith(".ts")) {
    // Convert existing data to text
    const decoder = new TextDecoder();
    const originalText = decoder.decode(
      part.data as Uint8Array<ArrayBufferLike>,
    );

    // Prepend a line
    const modifiedText = `// Modified on ${new Date().toISOString()}\n${originalText}`;

    // Convert back to Uint8Array
    const encoder = new TextEncoder();
    part.data = encoder.encode(modifiedText);

    // Update content-length if it exists
    if (part["content-length"]) {
      part["content-length"] = part.data.length.toString();
    }
  }
  return part;
};

/**
 * Cloudflare Worker handler
 */
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    // URL to fetch multipart data from
    const sourceUrl =
      "http://ingestzip.uithub.com/https://github.com/janwilmake/fetch-each/archive/refs/heads/main.zip?omitFirstSegment=true";

    try {
      // Fetch the remote multipart content
      const response = await fetch(sourceUrl, {
        headers: { Authorization: `Basic ${btoa("jan:secret")}` },
      });

      if (!response.ok) {
        return new Response(
          `Failed to fetch data: ${response.status} ${response.statusText}`,
          { status: 502 },
        );
      }

      // Use the getReadableStream function with the filterPart function
      const { readable, boundary } = await getReadableFormDataStream({
        response,
        filterPart,
        transformPart,
      });

      // Return the filtered multipart stream
      return new Response(readable, {
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Disposition": 'attachment; filename="filter-formdata.txt"',
        },
      });
    } catch (error: any) {
      // Handle any unexpected errors
      return new Response(`Error processing multipart data: ${error.message}`, {
        status: 500,
      });
    }
  },
};
