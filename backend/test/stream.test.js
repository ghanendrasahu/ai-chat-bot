import assert from "node:assert/strict";
import test from "node:test";

const DEFAULTS = {
  OPENAI_API_KEY: "",
  GROQ_API_KEY: "",
  OPENROUTER_API_KEY: "",
  AI_MODEL: "",
  CHAT_ACCESS_TOKEN: "",
  CHAT_RATE_LIMIT: "1000",
  CHAT_DAILY_LIMIT: "5000",
  CHAT_GLOBAL_LIMIT: "100000",
  CHAT_GLOBAL_DAILY_LIMIT: "100000",
  CHAT_AUX_LIMIT: "1000",
  CHAT_AUX_DAILY_LIMIT: "5000",
  CHAT_STREAM_TIMEOUT_MS: "5000",
  CHAT_MAX_TOKENS: "",
  AI_AUX_MODEL: "",
};

/** Start a cache-busted app instance with a fake OpenAI client. */
async function withMockApp(env, create, run) {
  Object.assign(process.env, DEFAULTS, env);
  const module = await import(`../index.js?case=${Math.random()}`);
  module.setClientFactory(() => ({ chat: { completions: { create } } }));
  const server = module.default.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base, module);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(base, path, body, headers = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function answer(text) {
  return { choices: [{ message: { content: text } }] };
}

function tokenStream(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield { choices: [{ delta: { content: chunk } }] };
      }
    },
  };
}

/** Read an SSE body as parsed events. */
async function readEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const event = /^event: (.+)$/m.exec(raw)?.[1];
      const data = /^data: (.+)$/m.exec(raw)?.[1];
      if (event) events.push({ event, data: data ? JSON.parse(data) : null });
    }
  }
  return events;
}

// ---- context helpers ----

test("the token helper is a single, swappable estimate", async () => {
  const { estimateTokens } = await import("../index.js");
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
  assert.equal(estimateTokens("x".repeat(4000)), 1000);
});

test("context keeps the newest turns and never drops pinned ones", async () => {
  const { selectContext } = await import("../index.js");
  const history = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `${i}:` + "x".repeat(400),
  }));
  const pinned = [{ role: "user", content: "my name is Ada" }];
  const context = selectContext(history, {
    pinned,
    summary: "Earlier: they talked about databases.",
    maxTokens: 600,
  });

  assert.equal(context.pinned.length, 1);
  assert.equal(context.pinned[0].content, "my name is Ada");
  assert.ok(context.kept.length > 0);
  assert.ok(context.kept.length < history.length);
  assert.ok(context.overflow.length > 0);
  // The newest turn is always the last one kept.
  assert.equal(context.kept.at(-1).content, history.at(-1).content);
  // Overflow is the older turns, in order.
  assert.equal(context.overflow[0].content, history[0].content);
  // Pinned never appears in the overflow.
  assert.ok(!context.overflow.some((turn) => turn.content.includes("Ada")));
});

test("an oversized turn falls back to plain trimming instead of crashing", async () => {
  const { selectContext } = await import("../index.js");
  const context = selectContext(
    [{ role: "user", content: "x".repeat(100_000) }],
    { maxTokens: 100 }
  );
  assert.deepEqual(context.kept, []);
  assert.equal(context.overflow.length, 1);
});

test("titles are stripped of quotes, Markdown and trailing punctuation", async () => {
  const { sanitizeTitle } = await import("../index.js");
  assert.equal(sanitizeTitle('"**My Great Chat!**"'), "My Great Chat");
  assert.equal(sanitizeTitle("Title: Debugging the deploy pipeline today"), "Debugging the deploy pipeline");
  assert.equal(sanitizeTitle("```\nnode streams\n```"), "node streams");
  assert.equal(sanitizeTitle("   "), "");
  assert.ok(sanitizeTitle("one two three four five six").split(" ").length <= 4);
});

// ---- /title ----

test("the title endpoint asks for a short title and sanitises the answer", async () => {
  let seen = null;
  await withMockApp(
    { GROQ_API_KEY: "gsk-test" },
    async (params) => {
      seen = params;
      return answer('  "My Great Chat!"  ');
    },
    async (base) => {
      const response = await post(base, "/title", { message: "How do I deploy this?" });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.title, "My Great Chat");
      assert.ok(body.title.split(" ").length <= 4);
      assert.equal(seen.max_tokens, 24);
      assert.match(seen.messages[0].content, /four words/i);
    }
  );
});

test("the title endpoint validates its input and explains a missing key", async () => {
  await withMockApp({}, async () => answer("nope"), async (base) => {
    const missing = await post(base, "/title", {});
    assert.equal(missing.status, 400);

    const noKey = await post(base, "/title", { message: "hello" }, { "X-Provider": "groq" });
    assert.equal(noKey.status, 503);
    assert.equal((await noKey.json()).code, "no_key");
  });
});

test("the title endpoint never forwards a provider failure", async () => {
  await withMockApp(
    { GROQ_API_KEY: "gsk-test" },
    async () => {
      throw Object.assign(new Error("sk-live-key was rejected"), { status: 401 });
    },
    async (base) => {
      const response = await post(base, "/title", { message: "hello" });
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.code, "invalid_key");
      assert.ok(!JSON.stringify(body).includes("sk-live-key"));
    }
  );
});

// ---- streaming ----

test("the stream route sends typed SSE events and flushes the first token", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await withMockApp(
    { GROQ_API_KEY: "gsk-test" },
    async (params) => {
      if (!params.stream) return answer("unused");
      return {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: "Hel" } }] };
          await gate;
          yield { choices: [{ delta: { content: "lo" } }] };
        },
      };
    },
    async (base) => {
      const response = await post(base, "/chat/stream", {
        message: "hi",
        history: [{ role: "user", content: "earlier" }],
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
      assert.equal(response.headers.get("cache-control"), "no-cache, no-transform");
      assert.equal(response.headers.get("x-accel-buffering"), "no");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // The first read must resolve before the fake stream is released,
      // proving the server flushes tokens instead of buffering the reply.
      const first = await reader.read();
      const firstText = decoder.decode(first.value, { stream: true });
      assert.match(firstText, /event: token/);
      assert.match(firstText, /Hel/);
      release();

      let rest = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        rest += decoder.decode(value, { stream: true });
      }
      const all = firstText + rest;
      assert.match(all, /event: done/);
      assert.match(all, /"reply":"Hello"/);
      assert.match(all, /"provider":"groq"/);
    }
  );
});

test("a client abort closes the upstream stream", async () => {
  let closed = false;
  let release;
  let upstreamAborted = false;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });

  await withMockApp(
    { GROQ_API_KEY: "gsk-test" },
    async (params, options) => {
      options?.signal?.addEventListener("abort", () => {
        upstreamAborted = true;
        release();
      });
      return {
        async *[Symbol.asyncIterator]() {
          try {
            yield { choices: [{ delta: { content: "Hi" } }] };
            await waiting;
            yield { choices: [{ delta: { content: " there" } }] };
          } finally {
            closed = true;
            release();
          }
        },
      };
    },
    async (base) => {
      const controller = new AbortController();
      const response = await fetch(`${base}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hi" }),
        signal: controller.signal,
      });
      const reader = response.body.getReader();
      await reader.read();
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.ok(closed || upstreamAborted, "the upstream stream was not cleaned up");
    }
  );
});

test("a mid-stream failure becomes a safe error event", async () => {
  await withMockApp(
    { GROQ_API_KEY: "gsk-test" },
    async (params) => {
      if (!params.stream) return answer("unused");
      return {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: "Hi" } }] };
          throw Object.assign(new Error("provider secret sk-live-123 exploded"), {
            status: 500,
          });
        },
      };
    },
    async (base) => {
      const response = await post(base, "/chat/stream", { message: "hi" });
      const events = await readEvents(response);
      assert.equal(events[0].event, "token");
      assert.equal(events[0].data.t, "Hi");
      const failure = events.find((event) => event.event === "error");
      assert.ok(failure);
      assert.match(failure.data.error, /unavailable/i);
      assert.ok(!JSON.stringify(events).includes("sk-live-123"));
      assert.ok(!JSON.stringify(events).includes("provider secret"));
    }
  );
});

test("a failure before the first token stays a readable JSON error", async () => {
  await withMockApp(
    { GROQ_API_KEY: "gsk-test" },
    async () => {
      throw Object.assign(new Error("bad key"), { status: 401 });
    },
    async (base) => {
      const response = await post(base, "/chat/stream", { message: "hi" });
      assert.equal(response.status, 400);
      assert.match(response.headers.get("content-type") ?? "", /application\/json/);
      const body = await response.json();
      assert.equal(body.code, "invalid_key");
    }
  );
});

test("the stream route keeps validation, rate limiting and the key gate", async () => {
  await withMockApp(
    {
      GROQ_API_KEY: "",
      CHAT_RATE_LIMIT: "10",
      CHAT_DAILY_LIMIT: "100",
    },
    async () => answer("no key should not be called"),
    async (base) => {
      const missing = await post(base, "/chat/stream", {});
      assert.equal(missing.status, 400);
      assert.match((await missing.json()).error, /required/i);

      const noKey = await post(base, "/chat/stream", { message: "hi" });
      assert.equal(noKey.status, 503);
      assert.equal((await noKey.json()).code, "no_key");
    }
  );

  await withMockApp(
    {
      GROQ_API_KEY: "gsk-test",
      CHAT_RATE_LIMIT: "1",
      CHAT_DAILY_LIMIT: "100",
    },
    async (params) => (params.stream ? tokenStream(["ok"]) : answer("ok")),
    async (base) => {
      const first = await post(base, "/chat/stream", { message: "one" });
      await readEvents(first);
      const limited = await post(base, "/chat/stream", { message: "two" });
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get("retry-after"), "60");
      assert.match(limited.headers.get("content-type") ?? "", /application\/json/);
    }
  );
});

test("a stream that never ends is stopped by the server timeout", async () => {
  await withMockApp(
    { GROQ_API_KEY: "gsk-test", CHAT_STREAM_TIMEOUT_MS: "60" },
    async (params) => {
      if (!params.stream) return answer("unused");
      return {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: "Hi" } }] };
          await new Promise(() => {});
        },
      };
    },
    async (base) => {
      const response = await post(base, "/chat/stream", { message: "hi" });
      const events = await readEvents(response);
      assert.equal(events[0].event, "token");
      const failure = events.find((event) => event.event === "error");
      assert.ok(failure);
      assert.equal(failure.data.code, "timeout");
    }
  );
});

// ---- rolling summaries ----

function longHistory() {
  return Array.from({ length: 40 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `${i} ` + "detail ".repeat(120),
  }));
}

test("an over-budget thread summarizes in the background and caches it for the next turn", async () => {
  let summaryCalls = 0;
  const answerMessages = [];

  await withMockApp(
    { GROQ_API_KEY: "gsk-test" },
    async (params) => {
      const system = params.messages?.[0]?.content ?? "";
      if (system.includes("Summarize this part")) {
        summaryCalls += 1;
        return answer("They discussed the deploy pipeline and chose Node streams.");
      }
      answerMessages.push(params.messages);
      return answer("Here is the answer.");
    },
    async (base) => {
      const first = await post(base, "/chat", {
        message: "what next?",
        history: longHistory(),
      });
      assert.equal(first.status, 200);
      const body = await first.json();
      assert.equal(body.reply, "Here is the answer.");
      assert.equal(summaryCalls, 1);
      assert.match(body.summary, /deploy pipeline/);
      assert.ok(body.summaryCount > 0);

      // The turn that triggered the summary is not made to wait for it: the
      // reply uses the context it already had, and the new summary is cached.
      assert.ok(
        !answerMessages[0].some(
          (message) => message.role === "system" && /Summary of earlier turns/.test(message.content)
        )
      );

      const second = await post(base, "/chat", {
        message: "and now?",
        history: longHistory(),
        summary: body.summary,
        summaryCount: body.summaryCount,
      });
      assert.equal(second.status, 200);
      assert.equal(summaryCalls, 1, "a cached summary should not be rebuilt");

      const summaryNote = answerMessages[1].find(
        (message) => message.role === "system" && /Summary of earlier turns/.test(message.content)
      );
      assert.ok(summaryNote, "the cached summary was not added to the next turn");
      assert.match(summaryNote.content, /deploy pipeline/);
    }
  );
});

test("chat calls cap the reply length so cost and latency stay bounded", async () => {
  const seen = [];
  await withMockApp(
    { GROQ_API_KEY: "gsk-test" },
    async (params) => {
      seen.push(params);
      return answer("ok");
    },
    async (base) => {
      const plain = await post(base, "/chat", { message: "hi" });
      assert.equal(plain.status, 200);
      await plain.json();
      assert.equal(seen.at(-1).max_tokens, 1024);

      const streamed = await post(base, "/chat/stream", { message: "hi" });
      assert.equal(streamed.status, 200);
      await streamed.text();
      assert.equal(seen.at(-1).max_tokens, 1024);
    }
  );
});

test("title and summary use the provider default, not the visitor's large model", async () => {
  const models = [];
  await withMockApp(
    { GROQ_API_KEY: "gsk-test" },
    async (params) => {
      const system = params.messages?.[0]?.content ?? "";
      models.push({ model: params.model, system });
      if (system.includes("Summarize this part")) return answer("summary");
      if (system.includes("Write a short title")) return answer("A title");
      return answer("ok");
    },
    async (base) => {
      const title = await post(
        base,
        "/title",
        { message: "hello" },
        { "X-Model": "openai/gpt-oss-120b" }
      );
      assert.equal(title.status, 200);
      await title.json();

      const summary = await post(
        base,
        "/summary",
        { messages: [{ role: "user", content: "hello" }] },
        { "X-Model": "openai/gpt-oss-120b" }
      );
      assert.equal(summary.status, 200);
      await summary.json();

      assert.equal(models.length, 2);
      assert.ok(models.every((entry) => entry.model === "openai/gpt-oss-20b"));
    }
  );
});

test("a quiet stream emits heartbeat comments", async () => {
  await withMockApp(
    { GROQ_API_KEY: "gsk-test", CHAT_STREAM_HEARTBEAT_MS: "20" },
    async (params) => {
      if (!params.stream) return answer("unused");
      return tokenStreamWithDelay(["Hi", " there"], 80);
    },
    async (base) => {
      const response = await post(base, "/chat/stream", { message: "hi" });
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.match(text, /^: ping$/m);
      assert.match(text, /event: done/);
      assert.match(text, /"reply":"Hi there"/);
    }
  );
});

/** A stream that pauses before its second chunk, long enough for a heartbeat. */
function tokenStreamWithDelay(chunks, delayMs) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { content: chunks[0] } }] };
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      for (const chunk of chunks.slice(1)) {
        yield { choices: [{ delta: { content: chunk } }] };
      }
    },
  };
}

test("requests carry an id and log timing without prompts, replies or keys", async () => {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    await withMockApp(
      { GROQ_API_KEY: "gsk-test" },
      async () => answer("secret-reply"),
      async (base) => {
        const response = await post(base, "/chat", { message: "secret-question" });
        assert.equal(response.status, 200);
        const id = response.headers.get("x-request-id");
        assert.match(id ?? "", /^[0-9a-f-]{36}$/);
        await response.json();

        const echoed = await post(
          base,
          "/chat",
          { message: "hi" },
          { "X-Request-Id": "client-id-123" }
        );
        assert.equal(echoed.headers.get("x-request-id"), "client-id-123");
        await echoed.json();
        // Let the server's finish listener run before restoring console.log.
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    );
  } finally {
    console.log = original;
  }

  const entries = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry?.event === "api_request");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].status, 200);
  assert.equal(entries[0].provider, "groq");
  assert.equal(entries[0].model, "openai/gpt-oss-20b");
  assert.equal(typeof entries[0].ms, "number");
  assert.equal(entries[0].outcome, "complete");
  const all = lines.join("\n");
  assert.ok(!all.includes("secret-question"));
  assert.ok(!all.includes("secret-reply"));
  assert.ok(!all.includes("gsk-test"));
});

test("a summary failure falls back to plain trimming and still answers", async () => {
  let answerMessages = null;

  await withMockApp(
    { GROQ_API_KEY: "gsk-test" },
    async (params) => {
      const system = params.messages?.[0]?.content ?? "";
      if (system.includes("Summarize this part")) {
        throw Object.assign(new Error("summary provider down"), { status: 500 });
      }
      answerMessages = params.messages;
      return answer("Still answering.");
    },
    async (base) => {
      const response = await post(base, "/chat", {
        message: "what next?",
        history: longHistory(),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.reply, "Still answering.");
      assert.equal(body.summary, "");
      assert.ok(Array.isArray(answerMessages));
      assert.ok(
        !answerMessages.some(
          (message) => message.role === "system" && /Summary of earlier turns/.test(message.content)
        )
      );
      // The newest turn still made it through the plain trim.
      assert.ok(answerMessages.length > 2);
    }
  );
});

test("per-chat instructions are layered on top of the global prompt", async () => {
  let seen = null;
  await withMockApp(
    { GROQ_API_KEY: "gsk-test" },
    async (params) => {
      seen = params;
      return answer("ok");
    },
    async (base) => {
      const response = await post(base, "/chat", {
        message: "hi",
        instructions: "Answer in bullet points.",
        chatInstructions: "This conversation is about SQL only.",
        persona: "technical",
      });
      assert.equal(response.status, 200);
      const system = seen.messages[0].content;
      assert.match(system, /Answer in bullet points\./);
      assert.match(system, /SQL only/);
      assert.match(system, /technical assistant/);
    }
  );
});
