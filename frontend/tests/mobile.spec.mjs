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
const FRONTEND_URL = "http://localhost:5173";
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
function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failed += 1;
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
    check(`${width}px: no tap targets under 44px`, smallTargets.length === 0);

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

    await context.close();
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
