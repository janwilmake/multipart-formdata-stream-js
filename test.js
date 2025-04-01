//@ts-check
/**
 * Test file for the JavaScript Multipart Parser
 */

import { expect } from "expect";
import {
  StreamSearch,
  MATCH,
  ReadableStreamSearch,
  parseMultipart,
  stringToArray,
  arrayToString,
  mergeArrays,
} from "./index.js";

/**
 * Creates a ReadableStream from array data
 * @param {Array<Uint8Array|string>} chunks - Data chunks to stream
 * @returns {ReadableStream<Uint8Array>} - Readable stream containing the chunks
 */
function makeStream(chunks) {
  // Convert string chunks to Uint8Arrays
  const byteChunks = chunks.map((chunk) =>
    typeof chunk === "string" ? stringToArray(chunk) : chunk,
  );

  return new ReadableStream({
    start(controller) {
      byteChunks.forEach((chunk) => {
        controller.enqueue(chunk);
      });
      controller.close();
    },
  });
}

/**
 * Tests the StreamSearch core functionality
 */
async function testStreamSearch() {
  console.log("Testing StreamSearch...");

  /**
   * Run a test case for the StreamSearch
   * @param {string} needle - Pattern to search for
   * @param {string[]} chunks - Chunks of data to feed
   * @param {string[]} expected - Expected split results
   * @param {string} lookbehind - Expected lookbehind data
   */
  function testCase(needle, chunks, expected, lookbehind) {
    const search = new StreamSearch(needle);

    const outchunks = [[]];
    for (const chunk of chunks) {
      for (const token of search.feed(stringToArray(chunk))) {
        if (token === MATCH) {
          outchunks.push([]);
        } else {
          outchunks[outchunks.length - 1].push(token);
        }
      }
    }

    const end = search.end();
    outchunks[outchunks.length - 1].push(end);

    const result = outchunks.map((chunks) =>
      chunks.map(arrayToString).join(""),
    );

    expect(result).toEqual(expected);
    expect(arrayToString(end)).toBe(lookbehind);
  }

  /**
   * Run a suite of tests with different chunking strategies
   * @param {Function} splitFn - Function to split the input data
   */
  function runTestSuite(splitFn) {
    // Test single character needle
    console.log("  Testing single character needle...");
    testCase("0", splitFn("123456789"), ["123456789"], "");
    testCase("x", splitFn("hello world"), ["hello world"], "");
    testCase("1", splitFn("1234567891"), ["", "23456789", ""], "");
    testCase("2", splitFn("1234567892"), ["1", "3456789", ""], "");
    testCase("9", splitFn("1234567899"), ["12345678", "", ""], "");

    // Test two-character needle (different characters)
    console.log("  Testing two-character needle (different characters)...");
    testCase("ab", splitFn("123456789"), ["123456789"], "");
    testCase("ab", splitFn("a23456789"), ["a23456789"], "");
    testCase("ab", splitFn("12a45678a"), ["12a45678a"], "a");
    testCase("ab", splitFn("12a45678b"), ["12a45678b"], "");
    testCase("ab", splitFn("ab3456789ab"), ["", "3456789", ""], "");
    testCase("ab", splitFn("1ab456789ab"), ["1", "456789", ""], "");

    // Test two-character needle (identical characters)
    console.log("  Testing two-character needle (identical characters)...");
    testCase("aa", splitFn("123456789"), ["123456789"], "");
    testCase("aa", splitFn("a23456789"), ["a23456789"], "");
    testCase("aa", splitFn("12a45678a"), ["12a45678a"], "a");
    testCase(
      "\n\n",
      splitFn("\n\nhello world\n\n"),
      ["", "hello world", ""],
      "",
    );

    // Test empty payload
    console.log("  Testing empty payload...");
    testCase("1", splitFn(""), [""], "");
    testCase("abc", splitFn(""), [""], "");

    // Test needles larger than payload
    console.log("  Testing needles larger than payload...");
    testCase("ab", splitFn("a"), ["a"], "a");
    testCase("hello", splitFn("hm"), ["hm"], "");

    // Miscellaneous tests
    console.log("  Testing miscellaneous cases...");
    testCase("hello", splitFn("hello world"), ["", " world"], "");
    testCase("hello", splitFn("helo world"), ["helo world"], "");
    testCase("abcb", splitFn("ababcb"), ["ab", ""], "");
    testCase(
      "\r\n--boundary\r\n",
      splitFn(
        "some binary data\r\n--boundary\rnot really\r\nmore binary data\r\n--boundary\r\n",
      ),
      ["some binary data\r\n--boundary\rnot really\r\nmore binary data", ""],
      "",
    );
  }

  // Test feeding all data in one pass
  console.log("  Testing feeding all data in one pass...");
  runTestSuite((s) => [s]);

  // Test feeding data byte by byte
  console.log("  Testing feeding data byte by byte...");
  runTestSuite((s) => s.split(""));

  // Test feeding data in chunks of 3 bytes
  console.log("  Testing feeding data in chunks of 3 bytes...");
  runTestSuite((s) => {
    const chunks = [];
    for (let i = 0; i < s.length; i += 3) {
      chunks.push(s.substr(i, 3));
    }
    return chunks;
  });
}

/**
 * Tests the ReadableStreamSearch functionality
 */
async function testReadableStreamSearch() {
  console.log("Testing ReadableStreamSearch...");

  /**
   * Run a test suite for ReadableStreamSearch
   * @param {string} needle - Pattern to search for
   * @param {string} payload - Data to search in
   * @param {string[]} expected - Expected results
   */
  async function testSuite(needle, payload, expected) {
    // Test allStrings() method
    const allStrings = await new ReadableStreamSearch(
      needle,
      makeStream([payload]),
    ).allStrings();
    expect(allStrings).toEqual(expected);

    // Test arrays() iterator
    const iter = new ReadableStreamSearch(
      needle,
      makeStream([payload]),
    ).arrays();
    for (let i = 0; i < expected.length; i++) {
      const { done, value } = await iter.next();
      expect(done).toBe(false);
      expect(arrayToString(value)).toBe(expected[i]);
    }

    const final = await iter.next();
    expect(final.done).toBe(true);
    expect(final.value).toBe(undefined);
  }

  await testSuite("z", "12345z67890", ["12345", "67890"]);
  await testSuite("ab", "12a45678a", ["12a45678a"]);
}

/**
 * Generate a multipart payload from parts
 * @param {Array<Object>} parts - Parts to include in payload
 * @param {string} boundary - Boundary string
 * @returns {string} - Formatted multipart payload
 */
function multipartPayload(parts, boundary) {
  boundary = "\r\n--" + boundary;
  return (
    boundary +
    "\r\n" +
    parts
      .map((part) => {
        let contentDisposition = `Content-Disposition: form-data; name="${part.name}"`;
        if (part.filename) {
          contentDisposition += `; filename="${part.filename}"`;
        }

        let contentType = "";
        if (part.contentType) {
          contentType = `\r\nContent-Type: ${part.contentType}`;
        }

        return contentDisposition + contentType + "\r\n\r\n" + part.data;
      })
      .join(boundary + "\r\n") +
    boundary +
    "--"
  );
}

/**
 * Tests the multipart parser functionality
 */
async function testMultipartParser() {
  console.log("Testing Multipart Parser...");

  const expectedParts = [
    { name: "a", data: "form value a" },
    { name: "b", data: "file value b", filename: "b.txt" },
    {
      name: "c",
      data: "file value c\r\nhas\r\nsome new \r\n lines",
      filename: "c.txt",
      contentType: "text/plain",
    },
    {
      name: "d",
      data: "weird title",
      filename: "d=.txt",
      contentType: "text/plain",
    },
  ];

  const boundary = "some random boundary";
  const testPayload = multipartPayload(expectedParts, boundary);
  console.log("Test payload created.");

  /**
   * Create a stream that delivers data in chunks of specified size
   * @param {string} payload - Full payload
   * @param {number} size - Chunk size
   * @returns {ReadableStream<Uint8Array>} - Stream of chunks
   */
  function chunkedStream(payload, size) {
    let pos = 0;
    return new ReadableStream({
      type: "bytes",
      pull(controller) {
        let end = pos + size;
        if (end > payload.length) {
          end = payload.length;
        }

        controller.enqueue(stringToArray(payload.slice(pos, end)));

        if (end === payload.length) {
          controller.close();
        }

        pos = end;
      },
    });
  }

  /**
   * Normalize data to string for comparison
   * @param {string|Uint8Array} data - Data to normalize
   * @returns {string} - String representation
   */
  function normalizeData(data) {
    return typeof data === "string" ? data : arrayToString(data);
  }

  /**
   * Compare two parts for equality
   * @param {Object} actual - Actual part
   * @param {Object} expected - Expected part
   */
  function equalParts(actual, expected) {
    expect(actual.name).toBe(expected.name);
    expect(actual.filename).toBe(expected.filename);
    expect(actual.contentType).toBe(expected.contentType);
    expect(normalizeData(actual.data)).toBe(normalizeData(expected.data));
  }

  // Test parseMultipart function
  const parts = await parseMultipart(chunkedStream(testPayload, 3), boundary);
  expect(parts.length).toBe(expectedParts.length);

  for (let i = 0; i < parts.length; i++) {
    equalParts(parts[i], expectedParts[i]);
  }
}

// Run all tests
async function runTests() {
  console.log("Starting tests...");

  try {
    await testStreamSearch();
    await testReadableStreamSearch();
    await testMultipartParser();

    console.log("All tests passed!");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

runTests();
