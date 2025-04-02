# Streaming multipart/form-data in Cloudflare Workers

Cloudflare Workers provide a powerful serverless environment for processing HTTP requests, including handling form data uploads. This guide focuses on how to efficiently stream and process multipart/form-data in Cloudflare Workers using the `multipart-formdata-stream-js` library.

## Why Stream multipart/form-data?

Streaming multipart data offers several advantages over waiting for the entire request:

- **Memory efficiency**: Process large files without loading everything into memory
- **Better performance**: Start processing data as it arrives
- **Improved user experience**: Handle uploads more responsively
- **Support for larger files**: Overcome memory limitations

## Installation

First, install the `multipart-formdata-stream-js` library:

```bash
npm install multipart-formdata-stream-js
```

## Basic Implementation

Here's how to implement streaming multipart/form-data processing in a Cloudflare Worker:

```javascript
import { streamMultipart, mergeArrays } from "multipart-formdata-stream-js";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        // 1. Extract boundary from content-type
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

        // 2. Process the multipart data stream
        const results = [];
        for await (const part of streamMultipart(request.body, boundary)) {
          // Extract metadata
          const { name, filename, contentType } = part;
          console.log(
            `Processing field: ${name}${filename ? `, file: ${filename}` : ""}`,
          );

          // 3. Stream the part data
          const data = await collectData(part.data);

          // 4. Process the part data as needed
          results.push({
            name,
            filename,
            contentType,
            size: data.length,
          });

          // For this example, we're not storing the data,
          // but you could upload to R2 or process in other ways
        }

        return new Response(JSON.stringify({ success: true, parts: results }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Return a simple HTML form for non-POST requests
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Multipart Form Upload</h1>
          <form method="post" enctype="multipart/form-data">
            <p><input type="text" name="description" placeholder="Description"></p>
            <p><input type="file" name="file"></p>
            <p><button type="submit">Upload</button></p>
          </form>
        </body>
      </html>
    `,
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  },
};

// Helper function to collect all data from a stream
async function collectData(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return mergeArrays(...chunks);
}
```

## Advanced Implementation: Uploading to Cloudflare R2

Here's how to stream an uploaded file directly to R2 storage:

```javascript
import { streamMultipart } from "multipart-formdata-stream-js";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const contentType = request.headers.get("content-type");
        if (!contentType || !contentType.includes("multipart/form-data")) {
          return new Response("Expected multipart/form-data", { status: 400 });
        }

        const boundary = contentType.split("boundary=")[1];
        if (!boundary) {
          return new Response("No boundary found", { status: 400 });
        }

        const uploadResults = [];

        for await (const part of streamMultipart(request.body, boundary)) {
          // Only process file parts with a filename
          if (part.filename) {
            // Create a TransformStream to pipe the data
            const { readable, writable } = new TransformStream();

            // Start uploading to R2 (non-blocking)
            const uploadPromise = env.MY_BUCKET.put(
              `uploads/${Date.now()}-${part.filename}`,
              readable,
              {
                httpMetadata: {
                  contentType: part.contentType || "application/octet-stream",
                },
              },
            );

            // Pipe the part data to R2
            const writer = writable.getWriter();
            const streamPiping = (async () => {
              try {
                for await (const chunk of part.data) {
                  await writer.write(chunk);
                }
              } finally {
                await writer.close();
              }
            })();

            // Wait for upload to complete
            await Promise.all([streamPiping, uploadPromise]);

            uploadResults.push({
              field: part.name,
              filename: part.filename,
              status: "uploaded",
            });
          } else {
            // For non-file fields, collect the data
            const value = new TextDecoder().decode(
              await collectData(part.data),
            );

            uploadResults.push({
              field: part.name,
              value,
            });
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            uploads: uploadResults,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Return form for GET requests
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Upload to R2</h1>
          <form method="post" enctype="multipart/form-data">
            <p><input type="text" name="description" placeholder="Description"></p>
            <p><input type="file" name="file"></p>
            <p><button type="submit">Upload to R2</button></p>
          </form>
        </body>
      </html>
    `,
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  },
};

// Helper function to collect all data from a stream
async function collectData(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []));
}
```

## Processing Image Uploads with Transformations

Here's how to process image uploads with transformations:

```javascript
import { streamMultipart, mergeArrays } from "multipart-formdata-stream-js";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const contentType = request.headers.get("content-type");
        if (!contentType || !contentType.includes("multipart/form-data")) {
          return new Response("Expected multipart/form-data", { status: 400 });
        }

        const boundary = contentType.split("boundary=")[1];
        if (!boundary) {
          return new Response("No boundary found", { status: 400 });
        }

        for await (const part of streamMultipart(request.body, boundary)) {
          // Check if this is an image upload
          if (part.filename && part.contentType?.startsWith("image/")) {
            // Collect image data
            const imageData = await collectData(part.data);

            // Create a response with the image and CF image resizing
            return new Response(imageData, {
              headers: {
                "Content-Type": part.contentType,
                "Content-Disposition": `inline; filename="${part.filename}"`,
                // Apply CF image transformations
                "cf-image-width": "800",
                "cf-image-height": "600",
                "cf-image-fit": "cover",
              },
            });
          }
        }

        return new Response("No image found in upload", { status: 400 });
      } catch (error) {
        return new Response(`Error: ${error.message}`, { status: 500 });
      }
    }

    // Return form for GET requests
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Image Processing</h1>
          <form method="post" enctype="multipart/form-data">
            <p><input type="file" name="image" accept="image/*"></p>
            <p><button type="submit">Process Image</button></p>
          </form>
        </body>
      </html>
    `,
      {
        headers: { "Content-Type": "text/html" },
      },
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
```

## Error Handling and Best Practices

When working with multipart/form-data streams in Cloudflare Workers, keep these best practices in mind:

1. **Validate content type**: Always check the content type header before processing
2. **Extract boundary correctly**: The boundary might contain special characters
3. **Handle large files appropriately**: Use streaming to avoid memory limitations
4. **Set appropriate timeout limits**: Large file uploads may need extended timeouts
5. **Implement proper error handling**: Catch and handle errors from the streaming process
6. **Add security checks**: Validate file types, sizes, and content before processing
7. **Consider using a WAF**: Protect against malicious uploads with a web application firewall

## Troubleshooting

Common issues and solutions:

- **"Unexpected end of stream" error**: The stream ended prematurely, possibly due to a network error
- **"No boundary found" error**: Check that the content-type header includes a valid boundary
- **Memory limits exceeded**: Ensure you're properly streaming the data without accumulating it all in memory
- **Performance issues**: Consider chunking large uploads or using Workers Unbound for larger uploads

## Conclusion

Streaming multipart/form-data in Cloudflare Workers allows you to efficiently handle file uploads and form submissions. By leveraging the streaming capabilities of the `multipart-formdata-stream-js` library, you can process data as it arrives, improving performance and reducing memory usage.

This approach is particularly beneficial for applications that need to handle large file uploads or process form data in real-time. For production applications, consider combining this approach with Cloudflare R2 storage for a complete file upload solution.
