const { chromium } = require("playwright");
const OUT = "C:/Users/Siddhant/AppData/Local/Temp/claude/c--Users-Siddhant-MADBOT/44812a45-66d4-42fa-a3c6-e4d1d4195034/scratchpad";
const email = `crawl${Math.floor(Math.random() * 1e9)}@example.com`;
const errors = [];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1520, height: 1080 } });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });

  await page.goto("http://localhost:3000/login?mode=signup", { waitUntil: "networkidle" });
  await page.fill("#lg-name", "SID MALLAH");
  await page.fill("#lg-email", email);
  await page.fill("#lg-pass", "TestPass123!");
  await page.click('button[type="submit"]:has-text("Create account")');
  await page.waitForURL("**/dashboard**", { timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.fill('input[placeholder="yourcompany.com"]', "sofaalay.in");
  await page.click('button:has-text("Read my site")');
  await page.waitForTimeout(9000);
  await page.click('button:has-text("That\'s us — carry on")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("I\'m ready")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Start marketing")', { force: true });
  await page.waitForTimeout(4500);

  console.log("--- starting real crawl of sofaalay.in ---");
  await page.click("nav >> text=Agent runs", { force: true });
  await page.waitForTimeout(1000);
  await page.click('button:has-text("Crawl sofaalay.in")');

  // Poll until the job reaches a terminal state.
  let done = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(4000);
    const txt = await page.locator("body").innerText();
    if (/Completed/.test(txt) || /Failed/.test(txt)) { done = true; break; }
  }
  console.log("reached terminal state:", done);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/k-runs.png`, fullPage: true });

  const body = await page.locator("body").innerText();
  const summary = body.match(/Crawled [^\n]*/);
  console.log("SUMMARY:", summary ? summary[0] : "(none)");
  const resultTags = body.match(/(pagesCrawled|discovered|totalWords|orphanPages|brokenLinks|elapsedMs): [^\n]*/g);
  if (resultTags) console.log("RESULT:", resultTags.join(" | "));
  const err = body.match(/(Work succeeded but saving failed|Missing or insufficient)[^\n]*/);
  if (err) console.log("ERROR ON SCREEN:", err[0].slice(0, 200));

  // Growth tab should now reflect the crawl.
  await page.click("nav >> text=Growth", { force: true });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/k-growth.png`, fullPage: true });

  await page.click("nav >> text=Activity log", { force: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/k-activity.png`, fullPage: true });

  console.log("ERRORS:", errors.length ? errors.join("\n").slice(0, 600) : "none");
  console.log("account:", email);
  await browser.close();
})();
