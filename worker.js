import { mergeArrays, streamMultipart } from "./index";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        // Extract the boundary from the content-type header
        const contentType = request.headers.get("content-type");
        if (!contentType || !contentType.includes("multipart/form-data")) {
          return new Response("Expected multipart/form-data", { status: 400 });
        }

        const boundary = contentType.split("boundary=")[1];
        if (!boundary) {
          return new Response("No boundary found in content-type", {
            status: 400,
          });
        }

        const results = [];
        for await (const part of streamMultipart(request.body, boundary)) {
          console.log(`Field name: ${part.name}`);
          if (part.filename) {
            console.log(`Filename: ${part.filename}`);
          }
          results.push(part);

          // Process the part data (Uint8Array)
          const data = await collectData(part.data);
          console.log(`Data length: ${data.length} bytes`);
        }

        return new Response(JSON.stringify(results), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(`Error processing form: ${error.message}`, {
          status: 500,
        });
      }
    }

    // For non-POST requests, return simple form
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Multipart Form Example</h1>
          <form method="post" enctype="multipart/form-data">
            <p><input type="text" name="name" placeholder="Your name"></p>
            <p><input type="file" name="file"></p>
            <p><button type="submit">Submit</button></p>
          </form>
        </body>
      </html>
    `,
      { headers: { "Content-Type": "text/html" } },
    );
  },
};

async function collectData(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return mergeArrays(...chunks);
}
