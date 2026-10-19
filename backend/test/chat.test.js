import assert from "node:assert/strict";
import test from "node:test";

/** Start a fresh app instance (cache-busted import) with the given env. */
async function withApp(env, run) {
  Object.assign(
    process.env,
    {
      OPENAI_API_KEY: "",
      GROQ_API_KEY: "",
      CHAT_ACCESS_TOKEN: "",
      CHAT_RATE_LIMIT: "1000",
      CHAT_DAILY_LIMIT: "5000",
    },
    env
  );
  const module = await import(`../index.js?case=${Math.random()}`);
  const server = module.default.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(base, body, headers = {}) {
  return fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("health probe is public", async () => {
  await withApp({ OPENAI_API_KEY: "", GROQ_API_KEY: "" }, async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });
});

test("security headers are set", async () => {
  await withApp({ OPENAI_API_KEY: "", GROQ_API_KEY: "" }, async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(
      response.headers.get("referrer-policy"),
      "strict-origin-when-cross-origin"
    );
    assert.equal(
      response.headers.get("permissions-policy"),
      "camera=(), microphone=(), geolocation=()"
    );
    assert.match(response.headers.get("strict-transport-security"), /max-age=/);
    assert.equal(response.headers.get("x-powered-by"), null);
  });
});

test("rejects a missing message", async () => {
  await withApp({ OPENAI_API_KEY: "", GROQ_API_KEY: "" }, async (base) => {
    const response = await post(base, {});
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /required/i);
  });
});

test("rejects an oversized message", async () => {
  await withApp({ OPENAI_API_KEY: "", GROQ_API_KEY: "" }, async (base) => {
    const response = await post(base, { message: "x".repeat(2001) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /too long/i);
  });
});

test("requires the access token when configured", async () => {
  await withApp(
    { OPENAI_API_KEY: "", GROQ_API_KEY: "", CHAT_ACCESS_TOKEN: "s3cret-token" },
    async (base) => {
      const denied = await post(base, { message: "hello" });
      assert.equal(denied.status, 401);

      const allowed = await post(base, { message: "hello" }, { "X-Access-Token": "s3cret-token" });
      // No provider key is configured for this instance.
      assert.equal(allowed.status, 503);
    }
  );
});

test("rate limits a burst from one client", async () => {
  await withApp(
    {
      OPENAI_API_KEY: "",
      GROQ_API_KEY: "",
      CHAT_RATE_LIMIT: "2",
      CHAT_DAILY_LIMIT: "100",
    },
    async (base) => {
      assert.equal((await post(base, { message: "one" })).status, 503);
      assert.equal((await post(base, { message: "two" })).status, 503);
      assert.equal((await post(base, { message: "three" })).status, 429);
    }
  );
});
