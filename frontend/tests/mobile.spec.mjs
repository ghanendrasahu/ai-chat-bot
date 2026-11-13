// Responsive checks for the Mira chat at phone widths.
//
//   npm run test:mobile
//
// Starts its own mock backend on 127.0.0.1 and the Vite dev server, then
// drives a headless Chrome (channel: "chrome", so no browser download).
// Needs Chrome or Edge installed on the machine.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FRONTEND_URL = "http://127.0.0.1:5173";
const BACKEND_URL = "http://127.0.0.1:3001";

function waitForPort(port, host, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, host, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`port ${host}:${port} did not open in time`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

const procs = [];
function run(command, args, label) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    shell: process.platform === "win32",
  });
  child.on("error", (error) => {
    console.error(`${label} failed to start:`, error);
    process.exit(1);
  });
  procs.push(child);
  return child;
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
run(npmCmd, ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], "vite");
run("node", ["tests/mock-backend.mjs"], "mock backend");

let failed = 0;
function check(label, condition, detail) {
  const suffix = !condition && detail ? ` -> ${JSON.stringify(detail)}` : "";
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${suffix}`);
  if (!condition) failed += 1;
}

/** Controls inside one container that are smaller than the 44px target size. */
function smallTargetsIn(page, selector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [`${sel} missing`];
    return [...root.querySelectorAll("button, a")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
      })
      .map((el) => `${el.tagName}.${(el.className || "").slice(0, 40)}`);
  }, selector);
}

async function countMiraMessages(page) {
  return page.locator(".msg--mira").count();
}

/** Waits until the Stop button is gone, i.e. the turn settled. */
async function waitForReplyDone(page) {
  await page.waitForFunction(
    () => !document.querySelector(".composer__send--stop"),
    null,
    { timeout: 30_000 }
  );
}

/** The last visible Mira bubble text. */
function lastReply(page) {
  return page.locator(".msg--mira").last();
}

try {
  await waitForPort(5173, "127.0.0.1");
  await waitForPort(3001, "127.0.0.1");

  const browser = await chromium.launch({ channel: "chrome" });
  for (const width of [320, 360, 390, 414]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 320 ? 568 : 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(FRONTEND_URL, { waitUntil: "networkidle" });
    await page.waitForSelector(".status", { timeout: 30_000 });

    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    check(
      `${width}px: no horizontal scroll`,
      overflow.scrollW <= overflow.clientW + 1
    );

    const composer = await page.evaluate(() => {
      const input = document.getElementById("composer-input");
      const send = document.querySelector(".composer__send");
      if (!input || !send) return null;
      const ir = input.getBoundingClientRect();
      const sr = send.getBoundingClientRect();
      return { inputVisible: ir.bottom <= window.innerHeight, sendH: sr.height, sendW: sr.width };
    });
    check(`${width}px: input visible above the fold`, Boolean(composer?.inputVisible));
    check(
      `${width}px: send button is at least 44x44`,
      Boolean(composer && composer.sendH >= 44 && composer.sendW >= 44)
    );

    const smallTargets = await page.evaluate(() =>
      [...document.querySelectorAll("button, a")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
        })
        .map((el) => `${el.tagName}.${(el.className || "").slice(0, 30)}`)
    );
    check(`${width}px: no tap targets under 44px`, smallTargets.length === 0, smallTargets);

    // Drawer opens and closes.
    await page.click(".header__menu");
    await page.waitForTimeout(300);
    check(`${width}px: drawer opens from the hamburger`, await page.locator(".drawer").isVisible());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    check(`${width}px: drawer closes on Escape`, !(await page.locator(".drawer").isVisible()));

    // Sending works and renders a reply.
    await page.fill("#composer-input", "hello");
    await page.press("#composer-input", "Enter");
    await page.waitForSelector(".msg--mira .bubble", { timeout: 30_000 });
    check(`${width}px: send renders a reply`, true);

    // ---- model picker ----
    await page.click(".model-chip");
    await page.waitForSelector(".model-menu", { timeout: 10_000 });
    check(`${width}px: model chip opens the picker`, await page.locator(".model-menu").isVisible());

    const menuTargets = await smallTargetsIn(page, ".model-menu");
    check(
      `${width}px: model menu targets are at least 44px`,
      menuTargets.length === 0,
      menuTargets
    );

    const menuOverflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    check(
      `${width}px: no horizontal scroll with the model menu open`,
      menuOverflow.scrollW <= menuOverflow.clientW + 1
    );

    await page.click('.model-item:has-text("llama-3.1-8b-instant")');
    await page.waitForTimeout(250);
    check(
      `${width}px: picking a model updates the chip`,
      (await page.locator(".model-chip__name").innerText()).includes("llama-3.1-8b-instant")
    );

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".status", { timeout: 30_000 });
    check(
      `${width}px: the model choice survives a reload`,
      (await page.locator(".model-chip__name").innerText()).includes("llama-3.1-8b-instant")
    );

    // ---- settings: key + memory ----
    await page.click('.header .icon-btn[aria-label="Settings"]');
    await page.waitForSelector(".dialog", { timeout: 10_000 });
    // Let the open animation finish before measuring, or every target reads
    // 1% smaller than it really is.
    await page.waitForTimeout(350);
    check(`${width}px: the settings dialog opens`, await page.locator(".dialog").isVisible());

    const dialogTargets = await smallTargetsIn(page, ".dialog");
    check(
      `${width}px: settings targets are at least 44px`,
      dialogTargets.length === 0,
      dialogTargets
    );

    // A key lives under its own provider, in this browser only.
    await page.fill(".field__group input", "sk-test-key-123");

    await page.click('.tabs__btn:has-text("Memory")');
    await page.waitForTimeout(200);
    await page.fill(".memory-add input", "I live in India and prefer TypeScript");
    await page.click(".memory-add button");
    await page.waitForSelector(".memory-item", { timeout: 5000 });
    check(`${width}px: a fact can be added to shared memory`, true);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    check(`${width}px: Escape closes the settings dialog`, !(await page.locator(".dialog").isVisible()));

    // Send with the key and the memory, then inspect what actually left.
    const before = await countMiraMessages(page);
    await page.fill("#composer-input", "what do you remember about me?");
    await page.press("#composer-input", "Enter");
    await page.waitForFunction(
      (count) => document.querySelectorAll(".msg--mira").length > count,
      before,
      { timeout: 30_000 }
    );

    const last = await (await fetch(`${BACKEND_URL}/test/last`)).json();
    const headers = last.headers ?? {};
    check(
      `${width}px: provider and model travel as headers`,
      headers["x-provider"] === "groq" && headers["x-model"] === "llama-3.1-8b-instant"
    );
    check(
      `${width}px: the key travels as a header, never in the body`,
      headers["x-provider-key"] === "sk-test-key-123" &&
        !JSON.stringify(last.body ?? {}).includes("sk-test-key-123")
    );
    check(
      `${width}px: the shared memory is sent with the message`,
      Array.isArray(last.body?.memory) &&
        last.body.memory.includes("I live in India and prefer TypeScript")
    );

    // ---- memory survives a reload, and can be forgotten ----
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".status", { timeout: 30_000 });
    await page.click('.header .icon-btn[aria-label="Settings"]');
    await page.click('.tabs__btn:has-text("Memory")');
    await page.waitForTimeout(200);
    check(
      `${width}px: memory survives a reload`,
      (await page.locator('.memory-item:has-text("I live in India")').count()) === 1
    );

    await page.click('.memory-item button[aria-label^="Forget:"]');
    await page.waitForSelector(".memory-empty", { timeout: 5000 });
    check(`${width}px: forgetting a fact removes it`, true);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // ---- streaming ----
    await page.fill("#composer-input", "stream this answer");
    await page.press("#composer-input", "Enter");
    await page.waitForSelector(".stream-caret", { timeout: 10_000 });
    const streamingText = await lastReply(page).innerText();
    check(`${width}px: the reply streams into view`, streamingText.length > 0);
    await waitForReplyDone(page);
    check(
      `${width}px: the streamed reply finishes`,
      (await lastReply(page).innerText()).includes("Large language models")
    );
    const streamRequest = await (await fetch(`${BACKEND_URL}/test/last`)).json();
    check(
      `${width}px: the client uses the SSE route`,
      streamRequest.path === "/chat/stream"
    );

    // ---- stop keeps the partial reply ----
    await page.fill("#composer-input", "slow answer please");
    await page.press("#composer-input", "Enter");
    await page.waitForSelector(".stream-caret", { timeout: 10_000 });
    await page.waitForFunction(
      () => (document.querySelector(".msg--mira:last-of-type")?.innerText ?? "").length > 4,
      null,
      { timeout: 10_000 }
    );
    await page.click(".composer__send--stop");
    await waitForReplyDone(page);
    const stopped = await lastReply(page).innerText();
    check(
      `${width}px: stopping keeps the partial text`,
      stopped.length > 4 && !stopped.includes("Stopped generating.")
    );
    check(
      `${width}px: a stopped reply is marked`,
      (await lastReply(page).locator('.msg__flag:has-text("Stopped")').count()) === 1
    );

    // ---- edit and resend replaces the turn ----
    const usersBefore = await page.locator(".msg--user").count();
    await page.locator(".msg--user").last().locator(".msg__menuBtn").click();
    await page.click('.msg-menu__item:has-text("Edit and resend")');
    await page.fill(".msg-edit__input", "edited: explain tokens");
    await page.click('.msg-edit__actions button:has-text("Save and resend")');
    await page.waitForSelector(".composer__send--stop", { timeout: 10_000 });
    await waitForReplyDone(page);
    check(
      `${width}px: editing replaces the user message`,
      (await page.locator(".msg--user").count()) === usersBefore &&
        (await page.locator(".msg--user").last().innerText()).includes("edited: explain tokens")
    );
    check(
      `${width}px: editing regenerates the reply`,
      (await lastReply(page).innerText()).includes("Large language models")
    );

    // ---- regenerate keeps variants ----
    await lastReply(page).locator(".msg__menuBtn").click();
    await page.click('.msg-menu__item:has-text("Regenerate")');
    await page.waitForSelector(".composer__send--stop", { timeout: 10_000 });
    await waitForReplyDone(page);
    await page.waitForSelector(".variants", { timeout: 10_000 });
    check(
      `${width}px: regenerating adds a reply variant`,
      (await page.locator(".variants__count").innerText()) === "2/2"
    );
    await page.click('.variants button[aria-label="Previous reply version"]');
    check(
      `${width}px: variants can be switched`,
      (await page.locator(".variants__count").innerText()) === "1/2"
    );
    check(
      `${width}px: each variant keeps its model label`,
      (await lastReply(page).locator(".msg__model").count()) === 1
    );

    // ---- pin is always sent as context ----
    await page.locator(".msg--user").last().locator(".msg__menuBtn").click();
    await page.click('.msg-menu__item:has-text("Pin")');
    check(
      `${width}px: a message can be pinned`,
      (await page.locator(".msg--user").last().locator('.msg__flag:has-text("Pinned")').count()) === 1
    );
    await page.fill("#composer-input", "pin check");
    await page.press("#composer-input", "Enter");
    await page.waitForSelector(".composer__send--stop", { timeout: 10_000 });
    await waitForReplyDone(page);
    const pinnedRequest = await (await fetch(`${BACKEND_URL}/test/last`)).json();
    check(
      `${width}px: pinned turns travel in their own field`,
      Array.isArray(pinnedRequest.body?.pinned) &&
        pinnedRequest.body.pinned.some((turn) => turn.content.includes("edited: explain tokens"))
    );

    // ---- memory suggestion chip ----
    await page.fill("#composer-input", "I live in Berlin and work at Acme");
    await page.press("#composer-input", "Enter");
    await page.waitForSelector(".suggest-chip", { timeout: 10_000 });
    check(
      `${width}px: a durable fact offers a memory suggestion`,
      (await page.locator(".suggest-chip").innerText()).includes("Remember this?")
    );
    await page.click('.suggest-chip button:has-text("Remember")');
    await waitForReplyDone(page);

    // ---- edit a remembered fact ----
    await page.click('.header .icon-btn[aria-label="Settings"]');
    await page.waitForTimeout(350);
    await page.click('.tabs__btn:has-text("Memory")');
    await page.waitForTimeout(200);
    check(
      `${width}px: accepting the chip saves the fact`,
      (await page.locator('.memory-item:has-text("Berlin")').count()) === 1
    );
    await page.locator('.memory-item:has-text("Berlin")').locator('button[aria-label^="Edit:"]').click();
    await page.fill(".memory-item__edit input", "I live in Berlin and work at ACME.");
    await page.click('.memory-item__edit button[aria-label="Save fact"]');
    check(
      `${width}px: a remembered fact can be edited`,
      (await page.locator('.memory-item:has-text("ACME")').count()) === 1
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await context.close();

    // ---- IndexedDB migration from the old localStorage store ----
    const migrationContext = await browser.newContext({
      viewport: { width, height: width === 320 ? 568 : 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const seed = {
      activeId: "c-migrated",
      chats: [
        {
          id: "c-migrated",
          title: "Migrated conversation",
          titleAuto: true,
          at: Date.now(),
          messages: [
            {
              id: "m-old-1",
              role: "user",
              text: "hello from the old store",
              at: Date.now() - 2000,
              status: "sent",
            },
            {
              id: "m-old-2",
              role: "mira",
              text: "An old reply that must survive the move.",
              at: Date.now() - 1000,
              status: "sent",
            },
          ],
        },
      ],
    };
    await migrationContext.addInitScript((store) => {
      try {
        localStorage.setItem("mira.chats.v2", JSON.stringify(store));
      } catch {
        // about:blank has no usable storage
      }
    }, seed);
    const migrated = await migrationContext.newPage();
    await migrated.goto(FRONTEND_URL, { waitUntil: "networkidle" });
    await migrated.waitForSelector(".status", { timeout: 30_000 });
    check(
      `${width}px: old chats render after migration`,
      (await migrated.locator(".msg--user").first().innerText()).includes("old store")
    );
    await migrated.click(".header__menu");
    await migrated.waitForTimeout(300);
    check(
      `${width}px: the migrated chat is in the drawer`,
      (await migrated.locator('.drawer__chatTitle:has-text("Migrated conversation")').count()) === 1
    );
    const leftover = await migrated.evaluate(() => localStorage.getItem("mira.chats.v2"));
    check(`${width}px: localStorage is cleared after the move`, leftover === null);
    await migrationContext.close();
  }
  await browser.close();
} finally {
  for (const child of procs) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"]);
    } else {
      child.kill("SIGTERM");
    }
  }
}

console.log(failed === 0 ? "\nALL MOBILE TESTS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
