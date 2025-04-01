//@ts-check

// Universal Module Definition (UMD) pattern for multipart parser
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    // AMD. Register as an anonymous module
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    // Node. CommonJS-like environments that support module.exports
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.MultipartParser = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  // All your existing code goes here
  //@ts-check
  /**
   * @typedef {Object} ContentDisposition
   * @property {string} name
   * @property {string} [filename]
   */

  /**
   * @typedef {Object} Part
   * @property {string} name
   * @property {*} data - Either Uint8Array or AsyncIterableIterator<Uint8Array>
   * @property {string} [filename]
   * @property {string} [contentType]
   */

  /**
   * Based heavily on the Streaming Boyer-Moore-Horspool C++ implementation
   * by Hongli Lai at: https://github.com/FooBarWidget/boyer-moore-horspool
   */

  /**
   * Converts a string to a Uint8Array
   * @param {string} s - The string to convert
   * @returns {Uint8Array} - UTF-8 encoded bytes
   */
  function stringToArray(s) {
    const utf8 = unescape(encodeURIComponent(s));
    return Uint8Array.from(utf8, (_, i) => utf8.charCodeAt(i));
  }

  /**
   * Converts a Uint8Array to a string
   * @param {Uint8Array} a - The array to convert
   * @returns {string} - Decoded string
   */
  function arrayToString(a) {
    return String.fromCharCode.apply(null, a);
  }

  /**
   * Merges multiple Uint8Arrays into one
   * @param {...Uint8Array} arrays - Arrays to merge
   * @returns {Uint8Array} - Combined array
   */
  function mergeArrays(...arrays) {
    const out = new Uint8Array(
      arrays.reduce((total, arr) => total + arr.length, 0),
    );
    let offset = 0;
    for (const arr of arrays) {
      out.set(arr, offset);
      offset += arr.length;
    }
    return out;
  }

  /**
   * Compares two Uint8Arrays for equality
   * @param {Uint8Array} a - First array
   * @param {Uint8Array} b - Second array
   * @returns {boolean} - Whether arrays are equal
   */
  function arraysEqual(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Type for tokens returned by the StreamSearch
   * @typedef {(Uint8Array|Symbol)} Token
   */

  // Symbol used to indicate a needle match
  const MATCH = Symbol("Match");

  /**
   * Adapts a Uint8Array or function to a character function
   * @param {Uint8Array|Function} a - Array or function to adapt
   * @returns {function(number): number} - Function that returns a character at index
   */
  function coerce(a) {
    if (a instanceof Uint8Array) {
      return (index) => a[index];
    }
    return a;
  }

  /**
   * Compare memory blocks
   * @param {Uint8Array|Function} buf1 - First buffer or character function
   * @param {number} pos1 - Position in first buffer
   * @param {Uint8Array|Function} buf2 - Second buffer or character function
   * @param {number} pos2 - Position in second buffer
   * @param {number} len - Length to compare
   * @returns {boolean} - Whether blocks are equal
   */
  function jsmemcmp(buf1, pos1, buf2, pos2, len) {
    const fn1 = coerce(buf1);
    const fn2 = coerce(buf2);

    for (let i = 0; i < len; ++i) {
      if (fn1(pos1 + i) !== fn2(pos2 + i)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Creates occurrence table for Boyer-Moore-Horspool algorithm
   * @param {Uint8Array} s - Needle
   * @returns {number[]} - Occurrence table
   */
  function createOccurenceTable(s) {
    // Populate occurrence table with analysis of the needle,
    // ignoring last letter.
    const table = new Array(256).fill(s.length);
    if (s.length > 1) {
      for (let i = 0; i < s.length - 1; i++) {
        table[s[i]] = s.length - 1 - i;
      }
    }
    return table;
  }

  /**
   * A class that implements the Boyer-Moore-Horspool string search algorithm
   */
  class StreamSearch {
    /**
     * @param {Uint8Array|string} needle - The pattern to search for
     */
    constructor(needle) {
      if (typeof needle === "string") {
        this._needle = needle = stringToArray(needle);
      } else {
        this._needle = needle;
      }

      this._lastChar = needle[needle.length - 1];
      this._occ = createOccurenceTable(needle);
      this._lookbehind = new Uint8Array();
    }

    /**
     * Feed data to the search algorithm
     * @param {Uint8Array} chunk - Data chunk to search in
     * @returns {Token[]} - Array of tokens (Uint8Array data or MATCH symbol)
     */
    feed(chunk) {
      let pos = 0;
      let tokens;
      const allTokens = [];
      while (pos !== chunk.length) {
        [pos, ...tokens] = this._feed(chunk, pos);
        allTokens.push(...tokens);
      }
      return allTokens;
    }

    /**
     * End the search and return remaining lookbehind buffer
     * @returns {Uint8Array} - Remaining data
     */
    end() {
      const tail = this._lookbehind;
      this._lookbehind = new Uint8Array();
      return tail;
    }

    /**
     * Internal feed implementation
     * @param {Uint8Array} data - Data to search in
     * @param {number} buf_pos - Position in buffer
     * @returns {[number, ...Token[]]} - New position and tokens
     * @private
     */
    _feed(data, buf_pos) {
      const tokens = [];

      // Positive: points to a position in `data`
      //           pos == 3 points to data[3]
      // Negative: points to a position in the lookbehind buffer
      //           pos == -2 points to lookbehind[lookbehind_size - 2]
      let pos = -this._lookbehind.length;

      if (pos < 0) {
        // Lookbehind buffer is not empty. Perform Boyer-Moore-Horspool
        // search with character lookup code that considers both the
        // lookbehind buffer and the current round's haystack data.
        while (pos < 0 && pos <= data.length - this._needle.length) {
          const ch = this._charAt(data, pos + this._needle.length - 1);

          if (
            ch === this._lastChar &&
            this._memcmp(data, pos, this._needle.length - 1)
          ) {
            if (pos > -this._lookbehind.length) {
              tokens.push(
                this._lookbehind.slice(0, this._lookbehind.length + pos),
              );
            }

            tokens.push(MATCH);
            this._lookbehind = new Uint8Array();
            return [pos + this._needle.length, ...tokens];
          } else {
            pos += this._occ[ch];
          }
        }

        // No match.
        if (pos < 0) {
          // There's too little data for Boyer-Moore-Horspool to run,
          // so we'll use a different algorithm to skip as much as
          // we can.
          while (pos < 0 && !this._memcmp(data, pos, data.length - pos)) {
            pos++;
          }
        }

        if (pos >= 0) {
          // Discard lookbehind buffer.
          tokens.push(this._lookbehind);
          this._lookbehind = new Uint8Array();
        } else {
          // Cut off part of the lookbehind buffer that has
          // been processed and append the entire haystack
          // into it.
          const bytesToCutOff = this._lookbehind.length + pos;

          if (bytesToCutOff > 0) {
            // The cut off data is guaranteed not to contain the needle.
            tokens.push(this._lookbehind.slice(0, bytesToCutOff));
            this._lookbehind = this._lookbehind.slice(bytesToCutOff);
          }

          this._lookbehind = Uint8Array.from(
            new Array(this._lookbehind.length + data.length),
            (_, i) => this._charAt(data, i - this._lookbehind.length),
          );

          return [data.length, ...tokens];
        }
      }

      pos += buf_pos;

      // Lookbehind buffer is now empty. Perform Boyer-Moore-Horspool
      // search with optimized character lookup code that only considers
      // the current round's haystack data.
      while (pos <= data.length - this._needle.length) {
        const ch = data[pos + this._needle.length - 1];

        if (
          ch === this._lastChar &&
          data[pos] === this._needle[0] &&
          jsmemcmp(this._needle, 0, data, pos, this._needle.length - 1)
        ) {
          if (pos > buf_pos) {
            tokens.push(data.slice(buf_pos, pos));
          }

          tokens.push(MATCH);
          return [pos + this._needle.length, ...tokens];
        } else {
          pos += this._occ[ch];
        }
      }

      // There was no match. If there's trailing haystack data that we cannot
      // match yet using the Boyer-Moore-Horspool algorithm (because the trailing
      // data is less than the needle size) then match using a modified
      // algorithm that starts matching from the beginning instead of the end.
      if (pos < data.length) {
        while (
          pos < data.length &&
          (data[pos] !== this._needle[0] ||
            !jsmemcmp(data, pos, this._needle, 0, data.length - pos))
        ) {
          ++pos;
        }

        if (pos < data.length) {
          this._lookbehind = data.slice(pos);
        }
      }

      // Everything until pos is guaranteed not to contain needle data.
      if (pos > 0) {
        tokens.push(data.slice(buf_pos, pos < data.length ? pos : data.length));
      }

      return [data.length, ...tokens];
    }

    /**
     * Get character at position, considering lookbehind buffer
     * @param {Uint8Array} data - Current data chunk
     * @param {number} pos - Position (negative for lookbehind)
     * @returns {number} - Character code
     * @private
     */
    _charAt(data, pos) {
      if (pos < 0) {
        return this._lookbehind[this._lookbehind.length + pos];
      }
      return data[pos];
    }

    /**
     * Compare memory with needle
     * @param {Uint8Array} data - Data to compare
     * @param {number} pos - Position in data
     * @param {number} len - Length to compare
     * @returns {boolean} - Whether data matches needle
     * @private
     */
    _memcmp(data, pos, len) {
      return jsmemcmp(this._charAt.bind(this, data), pos, this._needle, 0, len);
    }
  }

  /**
   * A class that searches a readable stream for a pattern
   */
  class ReadableStreamSearch {
    /**
     * @param {Uint8Array|string} needle - The pattern to search for
     * @param {ReadableStream<Uint8Array>} readableStream - Stream to search in
     */
    constructor(needle, readableStream) {
      this._search = new StreamSearch(needle);
      this._readableStream = readableStream;
    }

    /**
     * Get chunks between matches
     * @returns {AsyncIterableIterator<Uint8Array[]>} - Chunks between matches
     */
    async *chunks() {
      let chunks = [];
      for await (const value of this) {
        if (value === MATCH) {
          yield chunks;
          chunks = [];
        } else {
          chunks.push(value);
        }
      }
      yield chunks;
    }

    /**
     * Get all chunks as strings
     * @returns {Promise<string[]>} - Array of all strings
     */
    async allStrings() {
      const segments = [];
      for await (const value of this.strings()) {
        segments.push(value);
      }
      return segments;
    }

    /**
     * Get strings between matches
     * @returns {AsyncIterableIterator<string>} - Strings between matches
     */
    async *strings() {
      for await (const chunk of this.chunks()) {
        yield chunk.map(arrayToString).join("");
      }
    }

    /**
     * Get arrays between matches
     * @returns {AsyncIterableIterator<Uint8Array>} - Arrays between matches
     */
    async *arrays() {
      for await (const chunk of this.chunks()) {
        yield mergeArrays(...chunk);
      }
    }

    /**
     * Async iterator for search results
     * @returns {AsyncIterableIterator<Token>} - Search tokens
     */
    async *[Symbol.asyncIterator]() {
      const reader = this._readableStream.getReader();
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) {
            break;
          }

          yield* this._search.feed(result.value);
        }

        const tail = this._search.end();
        if (tail.length) {
          yield tail;
        }
      } finally {
        reader.releaseLock();
      }
    }
  }

  // Constants
  const dash = stringToArray("--");
  const CRLF = stringToArray("\r\n");

  /**
   * Split a string by semicolons, respecting quoted values
   * @param {string} str - String to split
   * @returns {string[]} - Array of parts
   */
  function splitSemis(str) {
    const result = [];
    let staged = "";
    let quoted = false;
    let escaped = false;

    for (const char of str) {
      if (!escaped) {
        if (char === '"') {
          quoted = !quoted;
        } else if (char === "\\" && quoted) {
          escaped = true;
        } else if (char === ";" && !quoted) {
          result.push(staged);
          staged = "";
          continue;
        }
      } else {
        escaped = false;
      }
      staged += char;
    }

    result.push(staged);
    return result;
  }

  /**
   * Parse a key-value string (e.g. name="value")
   * @param {string} str - String to parse
   * @returns {[string, string]} - Key and value
   */
  function parseKeyValue(str) {
    const equals = str.indexOf("=");
    if (equals < 0) {
      throw new Error(
        "malformed key-value string: missing value in `" + str + "`",
      );
    }

    const key = str.slice(0, equals);
    const rawValue = str.slice(equals + 1);

    let value = "";
    if (rawValue.startsWith('"')) {
      if (!rawValue.endsWith('"')) {
        throw new Error(
          "malformed key-value string: mismatched quotations in `" +
            rawValue +
            "`",
        );
      }

      let escaped = false;
      for (const char of rawValue.slice(1, rawValue.length - 1)) {
        if (char === "\\" && !escaped) {
          escaped = true;
          continue;
        }

        if (escaped) {
          escaped = false;
        }

        value += char;
      }
    } else {
      value = rawValue;
    }

    return [key, value];
  }

  /**
   * Parse a Content-Disposition header
   * @param {string} header - Header value
   * @returns {ContentDisposition} - Parsed content disposition
   */
  function parseContentDisposition(header) {
    const parts = splitSemis(header).map((part) => part.trim());
    if (parts.shift() !== "form-data") {
      throw new Error(
        'malformed content-disposition header: missing "form-data" in `' +
          JSON.stringify(parts) +
          "`",
      );
    }

    const out = {};
    for (const part of parts) {
      const [name, value] = parseKeyValue(part);
      out[name] = value;
    }

    if (!out.name) {
      throw new Error(
        "malformed content-disposition header: missing field name in `" +
          header +
          "`",
      );
    }

    return out;
  }

  /**
   * Parse part headers from lines
   * @param {string[]} lines - Header lines
   * @returns {Omit<Part, 'data'>} - Parsed part info without data
   */
  function parsePartHeaders(lines) {
    const entries = [];
    let disposition = false;

    let line;
    while (typeof (line = lines.shift()) !== "undefined") {
      const colon = line.indexOf(":");
      if (colon === -1) {
        throw new Error("malformed multipart-form header: missing colon");
      }

      const header = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      switch (header) {
        case "content-disposition":
          disposition = true;
          entries.push(...Object.entries(parseContentDisposition(value)));
          break;

        case "content-type":
          entries.push(["contentType", value]);
      }
    }

    if (!disposition) {
      throw new Error(
        "malformed multipart-form header: missing content-disposition",
      );
    }

    return Object.fromEntries(entries);
  }

  /**
   * Read header lines from iterator
   * @param {AsyncIterableIterator<Token>} it - Token iterator
   * @param {Uint8Array} needle - Boundary pattern
   * @returns {Promise<[string[]|undefined, Uint8Array]>} - Header lines and remaining data
   */
  async function readHeaderLines(it, needle) {
    let firstChunk = true;
    let lastTokenWasMatch = false;
    const headerLines = [[]];
    const crlfSearch = new StreamSearch(CRLF);

    for (;;) {
      const result = await it.next();
      if (result.done) {
        throw new Error(
          "malformed multipart-form data: unexpected end of stream",
        );
      }

      if (
        firstChunk &&
        result.value !== MATCH &&
        arraysEqual(result.value.slice(0, 2), dash)
      ) {
        // end of multipart payload, beginning of epilogue
        return [undefined, new Uint8Array()];
      }

      let chunk;
      if (result.value !== MATCH) {
        chunk = result.value;
      } else if (!lastTokenWasMatch) {
        chunk = needle;
      } else {
        throw new Error("malformed multipart-form data: unexpected boundary");
      }

      if (!chunk.length) {
        continue;
      }

      if (firstChunk) {
        firstChunk = false;
      }

      const tokens = crlfSearch.feed(chunk);
      for (const [i, token] of tokens.entries()) {
        const isMatch = token === MATCH;
        if (!isMatch && !token.length) {
          continue;
        }

        if (lastTokenWasMatch && isMatch) {
          tokens.push(crlfSearch.end());

          return [
            headerLines
              .filter((chunks) => chunks.length)
              .map((chunks) => mergeArrays(...chunks))
              .map(arrayToString),
            mergeArrays(
              ...tokens
                .slice(i + 1)
                .map((token) => (token === MATCH ? CRLF : token)),
            ),
          ];
        }

        if ((lastTokenWasMatch = isMatch)) {
          headerLines.push([]);
        } else {
          headerLines[headerLines.length - 1].push(token);
        }
      }
    }
  }

  /**
   * Stream multipart form data
   * @param {ReadableStream<Uint8Array>} body - Stream containing multipart data
   * @param {string} boundary - Boundary string
   * @returns {AsyncIterableIterator<Part<AsyncIterableIterator<Uint8Array>>>} - Parts with streamed data
   */
  async function* streamMultipart(body, boundary) {
    const needle = mergeArrays(dash, stringToArray(boundary));
    const it = new ReadableStreamSearch(needle, body)[Symbol.asyncIterator]();

    // discard prologue
    for (;;) {
      const result = await it.next();
      if (result.done) {
        // EOF
        return;
      }

      if (result.value === MATCH) {
        break;
      }
    }

    const crlfSearch = new StreamSearch(CRLF);

    for (;;) {
      const [headerLines, tail] = await readHeaderLines(it, needle);
      if (!headerLines) {
        return;
      }

      /**
       * Get next token from iterator
       * @returns {Promise<IteratorYieldResult<Token>>} - Token result
       */
      async function nextToken() {
        const result = await it.next();
        if (result.done) {
          throw new Error(
            "malformed multipart-form data: unexpected end of stream",
          );
        }
        return result;
      }

      let trailingCRLF = false;

      /**
       * Feed chunk to CRLF search
       * @param {Uint8Array} chunk - Chunk to process
       * @returns {Uint8Array} - Processed chunk
       */
      function feedChunk(chunk) {
        const chunks = [];
        for (const token of crlfSearch.feed(chunk)) {
          if (trailingCRLF) {
            chunks.push(CRLF);
          }

          if (!(trailingCRLF = token === MATCH)) {
            chunks.push(token);
          }
        }
        return mergeArrays(...chunks);
      }

      let done = false;

      /**
       * Get next data chunk
       * @returns {Promise<IteratorYieldResult<Uint8Array>>} - Chunk result
       */
      async function nextChunk() {
        const result = await nextToken();

        let chunk;
        if (result.value !== MATCH) {
          chunk = result.value;
        } else if (!trailingCRLF) {
          chunk = CRLF;
        } else {
          done = true;
          return { value: crlfSearch.end() };
        }

        return { value: feedChunk(chunk) };
      }

      const bufferedChunks = [{ value: feedChunk(tail) }];

      yield {
        ...parsePartHeaders(headerLines),
        data: {
          [Symbol.asyncIterator]() {
            return this;
          },
          async next() {
            for (;;) {
              const result = bufferedChunks.shift();
              if (!result) {
                break;
              }

              if (result.value.length > 0) {
                return result;
              }
            }

            for (;;) {
              if (done) {
                return { done, value: undefined };
              }

              const result = await nextChunk();
              if (result.value.length > 0) {
                return result;
              }
            }
          },
        },
      };

      while (!done) {
        bufferedChunks.push(await nextChunk());
      }
    }
  }

  /**
   * Iterate over multipart form data, collecting each part's data
   * @param {ReadableStream<Uint8Array>} body - Stream containing multipart data
   * @param {string} boundary - Boundary string
   * @returns {AsyncIterableIterator<Part>} - Parts with collected data
   */
  async function* iterateMultipart(body, boundary) {
    for await (const part of streamMultipart(body, boundary)) {
      const chunks = [];
      for await (const chunk of part.data) {
        chunks.push(chunk);
      }

      yield {
        ...part,
        data: mergeArrays(...chunks),
      };
    }
  }

  /**
   * Parse multipart form data into an array of parts
   * @param {ReadableStream<Uint8Array>} body - Stream containing multipart data
   * @param {string} boundary - Boundary string
   * @returns {Promise<Part[]>} - Array of parts
   */
  async function parseMultipart(body, boundary) {
    const parts = [];
    for await (const part of iterateMultipart(body, boundary)) {
      parts.push(part);
    }
    return parts;
  }

  // Return as a module object - these will be exported or added to global
  return {
    MATCH,
    StreamSearch,
    ReadableStreamSearch,
    streamMultipart,
    iterateMultipart,
    parseMultipart,
    stringToArray,
    arrayToString,
    mergeArrays,
    arraysEqual,
  };
});
