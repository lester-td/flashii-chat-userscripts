const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { before, after, test } = require("node:test");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "ultreme-script.user.js"), "utf8").replace(/\r\n/g, "\n");
let browser;
before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
  });
});
after(async () => { await browser?.close(); });

// Offline contract fixture derived from the supplied mami-master.zip:
// chatform/{form,input,markup}.jsx, ui/messages.jsx and index.js's Menus compat API.
// No account, server connection, upload, or update request is made.
async function fixture({ connected = true, settings = {}, backlog = [], remoteVersion = null, touch = false } = {}) {
  const page = await browser.newPage({ hasTouch: touch });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.request().url() === "https://chat.flashii.net/fixture"
    ? route.fulfill({ contentType: "text/html", body: `<!doctype html>
      <style id="chat-style">.hidden { display: none; }</style>
      <div class="sidebar__selector"><button class="sidebar__selector-mode" title="Scroll mode"></button></div>
      <div id="umi-messages" class="messages"><div id="umi-messages-anchor"></div></div>
      <form class="input"><div class="input__menus"><div class="input__menu">
        <button type="button" class="markup__button">Quote</button>
      </div></div><div class="input__main"><textarea class="input__text"></textarea>
        <button type="submit">Send</button></div></form>` })
    : route.abort());
  await page.goto("https://chat.flashii.net/fixture");
  await page.evaluate(({ connected, settings, remoteVersion }) => {
    for (const [key, value] of Object.entries(settings))
      localStorage.setItem(`ultreme_${key}`, typeof value === "boolean" ? (value ? "1" : "0") : value);
    window.sent = [];
    if (remoteVersion) {
      window.remoteVersion = remoteVersion;
      window.GM_info = { script: { version: "5.7.0" } };
      window.GM_xmlhttpRequest = options => queueMicrotask(() => options.onload({
        responseText: `// @version ${window.remoteVersion}`,
      }));
    }
    window.currentUser = connected ? { id: "1" } : null;
    window.Umi = {
      User: { getCurrentUser: () => window.currentUser },
      Server: { sendMessage: text => window.sent.push(text) },
      UI: { Menus: { Add(id) {
        const panel = document.createElement("div");
        panel.id = `umi-menus-${id}`;
        const icon = document.createElement("button");
        icon.id = `umi-menu-icons-${id}`;
        document.querySelector(".sidebar__selector").append(icon);
        document.body.append(panel);
      } } },
    };
    document.querySelector("form").onsubmit = event => {
      event.preventDefault();
      const input = document.querySelector("textarea");
      window.Umi.Server.sendMessage(input.value);
      input.value = "";
    };
    document.querySelector(".markup__button").onclick = () => {
      const input = document.querySelector("textarea");
      const start = input.selectionStart, end = input.selectionEnd;
      input.value = input.value.slice(0, start) + "[quote]" + input.value.slice(start, end) + "[/quote]" + input.value.slice(end);
      input.selectionStart = start + 7;
      input.selectionEnd = end + 7;
      input.focus();
    };
    window.addMessage = ({ id, author = "1", name = "Lester", body = "Hello", html,
      channel = "lobby", hidden = false, tiny = false, created = "2026-11-01T00:00:00Z", before }) => {
      const msg = document.createElement("div");
      msg.id = `message-${id}`;
      msg.className = `message${tiny ? " message-tiny" : ""}${hidden ? " hidden" : ""}`;
      Object.assign(msg.dataset, { id, author, channel, body, created });
      if (tiny) msg.dataset.tiny = "1";
      msg.innerHTML = `<div class="message__avatar"><img src="https://flashii.net/assets/avatar/${author}?res=80&ver=12345"></div>
        <div class="message__container"><div class="message__meta"><div class="message__user" style="color:rgb(10, 20, 30)"></div>
        <div class="message__time">00:00:00</div></div></div>`;
      msg.querySelector(".message__user").textContent = name;
      const text = document.createElement("div");
      text.className = tiny ? "message-tiny-text" : "message__text";
      if (html) text.innerHTML = html;
      else text.textContent = body;
      if (!html && window.Umi.Parsing) window.Umi.Parsing.Parse(text);
      msg.querySelector(tiny ? ".message__meta" : ".message__container").append(text);
      document.getElementById(before ? `message-${before}` : "umi-messages-anchor").before(msg);
      window.dispatchEvent(new CustomEvent("umi:ui:message_add", { detail: { element: msg } }));
    };
    class FakeXHR extends EventTarget {
      upload = new EventTarget();
      open(method, url) { this.url = url; }
      send(body) { if (this.fail) throw new Error("send failed"); this.body = body; }
    }
    window.XMLHttpRequest = FakeXHR;
    window.startUpload = (id, url = "/uploads", raw = false) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      const file = new File(["test"], `${id}.png`, { type: "image/png" });
      const body = raw ? file : new FormData();
      if (!raw) body.append("file", file);
      xhr.send(body);
      window[id] = xhr;
    };
    window.progress = (id, loaded, total = 100) => window[id].upload.dispatchEvent(
      new ProgressEvent("progress", { lengthComputable: true, loaded, total }));
    window.finish = id => window[id].dispatchEvent(new Event("loadend"));
  }, { connected, settings, remoteVersion });
  if (process.env.MAMI_CLIENT_PATH) {
    const src = path.join(process.env.MAMI_CLIENT_PATH, "src");
    // Exercise the supplied parser directly; only its settings import is stubbed.
    const parser = fs.readFileSync(path.join(src, "parsing.js"), "utf8")
      .replace(/^import .*settings\/settings\.js';/m, "const settingValue = () => false;");
    await page.addScriptTag({ content: parser });
    for (const file of ["styles/root.css", "styles/message.css", "styles/input.css", "sidebar/pan-settings.css", "themes/dark.css", "themes/light.css", "themes/blue.css", "themes/purple.css", "themes/archaic.css"])
      await page.addStyleTag({ content: fs.readFileSync(path.join(src, file), "utf8") });
    const fonts = fs.readFileSync(path.join(src, "fonts.css"), "utf8");
    // Font feature rules are tested offline; package font imports are not fetched.
    await page.addStyleTag({ content: fonts.slice(fonts.indexOf(".font-theme,")) });
    await page.evaluate(() => document.body.classList.add("theme-dark", "font-theme"));
  }
  for (const msg of backlog) await page.evaluate(msg => window.addMessage(msg), msg);
  await page.addScriptTag({ content: script });
  return { page, errors, close: async () => { await page.close(); assert.deepEqual(errors, []); } };
}

test("metadata and userscript headers match", () => {
  const meta = fs.readFileSync(path.join(root, "ultreme-script.meta.js"), "utf8").replace(/\r\n/g, "\n").trim();
  assert.equal(script.slice(0, script.indexOf("// ==/UserScript==") + 18).trim(), meta);
});

test("initializes before or after connect, and repeated connects install only one keyboard handler", async () => {
  for (const connected of [false, true]) {
    const f = await fixture({ connected, backlog: [{ id: "10" }, { id: "20" }, { id: "30" }] });
    try {
      await f.page.evaluate(() => {
        window.currentUser = { id: "1" };
        for (let i = 0; i < 3; i++) window.dispatchEvent(new Event("umi:connect"));
      });
      assert.equal(await f.page.locator("#umi-menus-ultreme").count(), 1);
      assert.equal(await f.page.locator("#ultreme-style").count(), 1);
      assert.equal(await f.page.locator(".quote-button").count(), 3);
      await f.page.keyboard.press("Control+ArrowUp");
      assert.equal(await f.page.locator(".selected-quote").getAttribute("data-id"), "30");
    } finally { await f.close(); }
  }
});

test("processes messages inserted into history, and keyboard quoting skips hidden channels and notices", async () => {
  const f = await fixture({ backlog: [{ id: "20" }] });
  try {
    await f.page.evaluate(() => {
      window.addMessage({ id: "10", before: "20" });
      window.addMessage({ id: "30", hidden: true });
      window.addMessage({ id: "40", author: "2", tiny: true, body: "has joined" });
    });
    assert.equal(await f.page.locator("#message-10 .quote-button").count(), 1);
    await f.page.keyboard.press("Control+ArrowUp");
    assert.equal(await f.page.locator(".selected-quote").getAttribute("data-id"), "20");
    await f.page.keyboard.press("Control+ArrowUp");
    assert.equal(await f.page.locator(".selected-quote").getAttribute("data-id"), "10");
    await f.page.keyboard.press("Escape");
    assert.equal(await f.page.locator("#quote-preview").count(), 0);
  } finally { await f.close(); }
});

test("quotes retain avatar versions and literal names, submit once, and delete respects settings and ownership", async () => {
  const name = '<img src=x onerror="window.injected=1">';
  const f = await fixture({ backlog: [{ id: "10", name, body: "[b]Hello[/b]" }, { id: "20", author: "2" }] });
  try {
    await f.page.locator("#message-10 .quote-button").click();
    assert.ok((await f.page.locator("#quote-preview").innerText()).includes(name));
    assert.equal(await f.page.locator("#quote-preview img").count(), 0);
    await f.page.locator("textarea").fill("reply");
    await f.page.locator('button[type="submit"]').click();
    const sent = await f.page.evaluate(() => window.sent);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /\[url=#10:1:12345\]/);
    assert.ok(sent[0].includes("[quote][b]Hello[/b][/quote]"));
    assert.ok(sent[0].endsWith("reply"));
    assert.equal(await f.page.locator("#quote-preview").count(), 0);
    assert.equal(await f.page.locator("#message-20 .delete-button").count(), 0);
    await f.page.locator("#message-10 .delete-button").click();
    await f.page.locator("#message-10 .message__time").click({ modifiers: ["Shift"] });
    assert.deepEqual(await f.page.evaluate(() => window.sent.slice(1)), ["/delete 10", "/delete 10"]);
    await f.page.locator(".js-ultreme-enableDelete").uncheck();
    await f.page.evaluate(() => document.querySelector("#message-10 .delete-button").click());
    assert.equal(await f.page.evaluate(() => window.sent.length), 3);
  } finally { await f.close(); }
});

test("rich and plain partial quoting preserve the selected text and the draft", async () => {
  for (const rich of [true, false]) {
    const f = await fixture({ settings: { interceptNativeQuoteButton: rich }, backlog: [{ id: "10", body: "Hello selected text" }] });
    try {
      await f.page.evaluate(() => {
        const input = document.querySelector("textarea");
        input.value = "draft tail";
        input.setSelectionRange(6, 6);
        const text = document.querySelector("#message-10 .message__text").firstChild;
        const range = document.createRange();
        range.setStart(text, 6); range.setEnd(text, 14);
        window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
        document.dispatchEvent(new MouseEvent("mouseup"));
        document.querySelector(".markup__button").click();
      });
      if (rich) {
        assert.ok((await f.page.locator("#quote-preview").innerText()).includes("selected"));
        assert.equal(await f.page.locator("textarea").inputValue(), "draft tail");
      } else {
        await f.page.waitForTimeout(70);
        assert.equal(await f.page.locator("textarea").inputValue(), "draft [quote]selected[/quote]tail");
      }
    } finally { await f.close(); }
  }
});

test("canceling a quote and dismissing an update never submit the draft; manual updates still work", async () => {
  const f = await fixture({ remoteVersion: "5.8.0", backlog: [{ id: "10" }] });
  try {
    assert.ok((await f.page.locator("#ultreme-update-prompt").innerText()).includes("5.8.0"));
    await f.page.locator("textarea").fill("unsent draft");
    await f.page.locator("#ultreme-update-dismiss").click();
    await f.page.locator(".quote-button").click();
    await f.page.locator("#cancel-quote").click();
    assert.equal(await f.page.locator("#quote-preview").count(), 0);
    assert.equal(await f.page.locator("textarea").inputValue(), "unsent draft");
    assert.deepEqual(await f.page.evaluate(() => window.sent), []);
    await f.page.getByRole("button", { name: "Check for updates", exact: true }).click();
    assert.equal(await f.page.locator("#ultreme-about-update-status").innerText(), "Update available: 5.8.0");
    await f.page.evaluate(() => window.remoteVersion = "5.6.0");
    await f.page.getByRole("button", { name: "Check for updates", exact: true }).click();
    assert.equal(await f.page.locator("#ultreme-about-update-status").innerText(), "You're on the latest!");
  } finally { await f.close(); }
});

test("join/leave compaction preserves ordinary text and separates channels", async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => {
      window.addMessage({ id: "10", author: "2", tiny: true, body: "has joined" });
      window.addMessage({ id: "20", author: "2", tiny: true, body: "has disconnected" });
      window.addMessage({ id: "30", author: "2", tiny: true, body: "has joined", channel: "other" });
      window.addMessage({ id: "40", author: "3", body: "Someone has joined us" });
    });
    assert.equal(await f.page.locator("#message-10").count(), 0);
    assert.equal((await f.page.locator("#message-20 .message-tiny-text").innerText()).trim(), "lurked");
    assert.equal(await f.page.locator("#message-30").count(), 1);
    assert.equal(await f.page.locator("#message-40 .quote-button").count(), 1);
  } finally { await f.close(); }
});

test("quote blocks, jumping, media, compact mode and light themes work with the current markup", async () => {
  const f = await fixture({ backlog: [{ id: "10", author: "2", name: "<b>Alice</b>" }] });
  try {
    await f.page.evaluate(() => window.addMessage({
      id: "20",
      html: '<i><b>Alice</b> @ 1m ago —</i><a href="#10:2:12345">\u200c</a><q>https://example.com/picture.png</q><br>reply',
    }));
    assert.equal(await f.page.locator("#message-20 .message__quote-header b").innerText(), "<b>Alice</b>");
    assert.equal(await f.page.locator("#message-20 .message__quote-avatar").getAttribute("src"), "https://flashii.net/assets/avatar/2?ver=12345");
    await f.page.locator("#message-20 .goto-button").click();
    assert.ok(await f.page.locator("#message-10").evaluate(el => el.classList.contains("highlight-temp")));
    await f.page.locator(".message__quote-media").click();
    assert.equal(await f.page.locator(".umi-media-modal-content img").getAttribute("src"), "https://example.com/picture.png");
    await f.page.locator(".umi-media-modal-close").click();
    assert.equal(await f.page.locator(".umi-media-modal-content img").count(), 0);
    for (const [extension, tag] of [["mp4", "video"], ["mp3", "audio"]]) {
      await f.page.evaluate(extension => {
        const preview = document.createElement("a");
        preview.className = "ultreme-preview-media";
        preview.href = `https://example.com/media.${extension}`;
        document.body.append(preview); preview.click(); preview.remove();
      }, extension);
      await f.page.locator(`.umi-media-modal-content ${tag}`).click();
      assert.equal(await f.page.locator("#umi-media-modal").evaluate(el => el.style.display), "flex");
      await f.page.locator(".umi-media-modal-close").click();
    }
    await f.page.evaluate(() => document.body.classList.add("compact"));
    assert.equal(await f.page.locator("#message-20 .message__container").evaluate(el => getComputedStyle(el).display), "grid");
    assert.equal(await f.page.locator(".message__quote-avatar").evaluate(el => getComputedStyle(el).display), "none");
    await f.page.locator(".js-ultreme-enableQuoteBlocks").uncheck();
    assert.equal(await f.page.locator(".message__quote").evaluate(el => getComputedStyle(el).display), "none");
    await f.page.locator(".js-ultreme-enableQuoteBlocks").check();
    for (const scheme of ["dark", "light"]) {
      await f.page.evaluate(scheme => {
        document.body.style.colorScheme = scheme;
        document.body.classList.remove("theme-dark", "theme-light");
        document.body.classList.add(`theme-${scheme}`);
      }, scheme);
      const background = await f.page.locator(".message__quote").evaluate(el => getComputedStyle(el).backgroundColor);
      assert.equal(background, scheme === "light" ? "rgb(238, 238, 238)" : "rgb(17, 17, 17)");
    }
  } finally { await f.close(); }
});

test("outgoing quotes round-trip through the supplied Mami BBCode parser", { skip: !process.env.MAMI_CLIENT_PATH }, async () => {
  const f = await fixture({ backlog: [{ id: "12345678901234567", body: "[b]Hello[/b] https://example.com/picture.png" }] });
  try {
    await f.page.locator(".quote-button").click();
    await f.page.locator("textarea").fill("reply");
    await f.page.locator('button[type="submit"]').click();
    await f.page.evaluate(() => window.addMessage({ id: "20", author: "2", body: window.sent[0] }));
    assert.equal(await f.page.locator("#message-20 .message__quote").count(), 1);
    assert.ok((await f.page.locator("#message-20 .message__quote-text").innerText()).includes("Hello"));
    assert.equal(await f.page.locator("#message-20 .message__quote-media").count(), 1);
    await f.page.locator("#message-20 .quote-button").click();
    assert.ok((await f.page.locator("#quote-preview").innerText()).includes("reply"));
    assert.ok(!(await f.page.locator("#quote-preview").innerText()).includes("Hello"));
  } finally { await f.close(); }
});

test("EEPROM and Misuzu uploads report progress without clearing a newer upload", async () => {
  const f = await fixture();
  try {
    await f.page.clock.install();
    await f.page.evaluate(() => { window.startUpload("old"); window.progress("old", 100); window.finish("old"); });
    await f.page.clock.runFor(900);
    await f.page.evaluate(() => { window.startUpload("newer", "https://flashii.net/_chat/attachments", true); window.progress("newer", 25); });
    await f.page.clock.runFor(400);
    assert.equal(await f.page.locator("#upload-progress-text").innerText(), "25%");
    assert.equal(await f.page.locator("#upload-progress-wrapper").evaluate(el => el.style.opacity), "1");
    await f.page.locator(".js-ultreme-uploadProgressDisplayPerFile").check();
    assert.equal(await f.page.locator(".upload-progress-item__name").innerText(), "newer.png");
    await f.page.evaluate(() => window.finish("newer"));
    await f.page.locator(".js-ultreme-uploadProgressDisplayCombined").check();
    await f.page.clock.runFor(1300);
    assert.equal(await f.page.locator("#upload-progress-wrapper").evaluate(el => el.style.opacity), "0");
  } finally { await f.close(); }
});

test("disabling progress ignores later events; synchronous send failures clean up and propagate", async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => { window.startUpload("old"); window.progress("old", 10); });
    await f.page.locator(".js-ultreme-enableUploadProgress").uncheck();
    await f.page.evaluate(() => { window.progress("old", 50); window.finish("old"); });
    assert.equal(await f.page.locator("#upload-progress-wrapper").count(), 0);
    await f.page.locator(".js-ultreme-enableUploadProgress").check();
    const error = await f.page.evaluate(() => {
      const xhr = new XMLHttpRequest(); xhr.open("POST", "/_chat/attachments"); xhr.fail = true;
      try { xhr.send(new File(["test"], "test.png")); } catch (error) { return error.message; }
    });
    assert.equal(error, "send failed");
    assert.equal(await f.page.locator("#upload-progress-wrapper").evaluate(el => el.style.opacity), "0");
  } finally { await f.close(); }
});

test("settings retain existing preferences while dependent controls are disabled or hidden", async () => {
  const stored = {
    enableDelete: false, showDeleteButton: true,
    enableUploadProgress: false, uploadProgressDisplayMode: "perfile",
    uploadProgressTextMode: "both", showUploadFileSize: true,
    showQuoteButton: false, showGotoButton: false, enableQuoteBlocks: false,
    interceptNativeQuoteButton: false, enableKonkira: false,
    enableForumButton: false, enableJumpToBottomButton: false,
  };
  const f = await fixture({ settings: stored, backlog: [{ id: "10" }] });
  const pref = key => f.page.locator(`.js-ultreme-${key}`);
  const field = key => f.page.locator(`[data-setting="${key}"]`);
  try {
    assert.deepEqual(await f.page.locator(".setting__category-title").allTextContents(),
      ["Quotes", "Messages", "Uploads", "Navigation", "About"]);
    assert.equal(await pref("showDeleteButton").isDisabled(), true);
    assert.equal(await pref("showDeleteButton").isChecked(), true);
    assert.equal(await pref("uploadProgressDisplayCombined").isDisabled(), true);
    assert.equal(await field("uploadProgressTextMode").isVisible(), false);
    assert.equal(await field("showUploadFileSize").isVisible(), false);
    assert.equal(await pref("showUploadFileSize").isChecked(), true);
    assert.equal(await f.page.locator(".quote-button").isVisible(), false);
    assert.equal(await f.page.locator(".delete-button").isVisible(), false);
    assert.equal(await f.page.locator(".custom-button").count(), 0);
    const encoded = Object.fromEntries(Object.entries(stored).map(([key, value]) =>
      [`ultreme_${key}`, typeof value === "boolean" ? (value ? "1" : "0") : value]));
    assert.deepEqual(await f.page.evaluate(() => ({ ...localStorage })), encoded);

    await pref("enableDelete").check();
    assert.equal(await pref("showDeleteButton").isDisabled(), false);
    assert.equal(await f.page.locator(".delete-button").isVisible(), true);
    await pref("showDeleteButton").uncheck();
    await pref("enableDelete").uncheck();
    await pref("enableDelete").check();
    assert.equal(await pref("showDeleteButton").isChecked(), false);
    assert.equal(await f.page.locator(".delete-button").isVisible(), false);

    await pref("enableUploadProgress").check();
    assert.equal(await pref("uploadProgressDisplayPerFile").isChecked(), true);
    await pref("uploadProgressDisplayCombined").check();
    assert.equal(await field("uploadProgressTextMode").isVisible(), true);
    assert.equal(await pref("uploadProgressBoth").isChecked(), true);
    assert.equal(await field("showUploadFileSize").isVisible(), false);
    await pref("uploadProgressPercent").check();
    assert.equal(await field("showUploadFileSize").isVisible(), true);
    assert.equal(await pref("showUploadFileSize").isChecked(), true);
    await pref("enableUploadProgress").uncheck();
    assert.equal(await pref("uploadProgressPercent").isDisabled(), true);
    assert.equal(await pref("showUploadFileSize").isDisabled(), true);
    assert.equal(await pref("showUploadFileSize").isChecked(), true);
    await pref("enableUploadProgress").check();
    assert.equal(await pref("showUploadFileSize").isChecked(), true);
    assert.equal(await pref("showUploadFileSize").isDisabled(), false);

    // Reload the saved values into a fresh page to check storage compatibility.
    const saved = await f.page.evaluate(() => Object.fromEntries(Object.entries(localStorage)
      .map(([key, value]) => [key.slice("ultreme_".length), value])));
    const reloaded = await fixture({ settings: saved });
    try {
      assert.equal(await reloaded.page.locator(".js-ultreme-showDeleteButton").isChecked(), false);
      assert.equal(await reloaded.page.locator(".js-ultreme-uploadProgressPercent").isChecked(), true);
      assert.equal(await reloaded.page.locator(".js-ultreme-showUploadFileSize").isChecked(), true);
    } finally { await reloaded.close(); }
  } finally { await f.close(); }
});

test("upload controls update active progress and keep automatic previews", async () => {
  const f = await fixture();
  const pref = key => f.page.locator(`.js-ultreme-${key}`);
  try {
    await f.page.clock.install();
    await pref("uploadProgressBoth").check();
    assert.equal(await f.page.locator("#upload-progress-text").innerText(), "64%   12.4 MB/19.6 MB");
    await f.page.clock.runFor(1600);
    assert.equal(await f.page.locator("#upload-progress-wrapper").evaluate(el => el.style.opacity), "0");
    await f.page.evaluate(() => { window.startUpload("active"); window.progress("active", 25); });
    assert.ok((await f.page.locator("#upload-progress-text").innerText()).startsWith("25%"));
    assert.equal(await f.page.locator("#upload-progress-size").isVisible(), false);
    await pref("uploadProgressPercent").check();
    assert.equal(await f.page.locator("#upload-progress-text").innerText(), "25%");
    assert.equal(await f.page.locator("#upload-progress-size").isVisible(), true);
    await pref("showUploadFileSize").uncheck();
    assert.equal(await f.page.locator("#upload-progress-size").isVisible(), false);
    await pref("uploadProgressDisplayPerFile").check();
    assert.equal(await f.page.locator(".upload-progress-item__name").innerText(), "active.png");
    assert.equal(await f.page.locator(".upload-progress-item__meta").innerText(), "25%");
    await f.page.evaluate(() => window.finish("active"));
    await f.page.clock.runFor(1400);
    await pref("uploadProgressDisplayCombined").check();
    assert.equal(await f.page.locator("#upload-progress-text").innerText(), "64%");
    assert.equal(await pref("showUploadFileSize").isChecked(), false);
  } finally { await f.close(); }
});

test("headers inherit the actual client's ligature features in both font modes", { skip: !process.env.MAMI_CLIENT_PATH }, async () => {
  const f = await fixture();
  try {
    for (const mode of ["theme", "ligless", "theme"]) {
      const actual = await f.page.evaluate(mode => {
        document.body.classList.remove("font-theme", "font-ligless");
        document.body.classList.add(`font-${mode}`);
        const body = getComputedStyle(document.body);
        return [...document.querySelectorAll("#umi-menus-ultreme .setting__category-title")].map(header => {
          const style = getComputedStyle(header);
          return {
            matchesClient: style.fontFeatureSettings === body.fontFeatureSettings &&
              style.fontVariantLigatures === body.fontVariantLigatures,
            features: style.fontFeatureSettings,
            ligatures: style.fontVariantLigatures,
          };
        });
      }, mode);
      for (const header of actual) {
        assert.equal(header.matchesClient, true);
        if (mode === "theme") assert.match(header.features, /"dlig"/);
        else {
          assert.equal(header.ligatures, "none");
          assert.doesNotMatch(header.features, /"dlig"/);
        }
      }
    }
  } finally { await f.close(); }
});

test("message button content, visibility and appearance update existing and new actions and persist", async () => {
  const f = await fixture({ backlog: [{ id: "10" }] });
  const pref = key => f.page.locator(`.js-ultreme-${key}`);
  try {
    await f.page.clock.install();
    await f.page.addStyleTag({ content: ".message-button-container button { transition: none !important; }" });
    await f.page.evaluate(() => window.addMessage({ id: "20", html: '<i>Lester @ 1m ago —</i><a href="#10:1">\u200c</a><q>quoted</q>' }));
    for (const mode of ["icons", "text", "both"]) {
      await pref("messageButtonContent").selectOption(mode);
      const visible = await f.page.locator("#message-20 .quote-button").evaluate(button => ({
        icon: getComputedStyle(button.querySelector("i")).display !== "none",
        label: getComputedStyle(button.querySelector(".message-button-label")).display !== "none",
        name: button.getAttribute("aria-label"),
      }));
      assert.deepEqual(visible, { icon: mode !== "text", label: mode !== "icons", name: "Quote this message" });
      await f.page.locator("#message-20 .quote-button").click();
      assert.equal(await f.page.locator("#quote-preview").count(), 1);
      await f.page.keyboard.press("Escape");
      await f.page.locator("#message-20 .goto-button").click();
      assert.ok(await f.page.locator("#message-10").evaluate(el => el.classList.contains("highlight-temp")));
      await f.page.locator("#message-20 .delete-button").click();
    }
    assert.deepEqual(await f.page.evaluate(() => window.sent), ["/delete 20", "/delete 20", "/delete 20"]);
    await f.page.mouse.move(0, 0);
    await f.page.locator("textarea").focus();
    await f.page.clock.runFor(200);
    assert.equal(await f.page.locator("#message-20 .quote-button").evaluate(el => getComputedStyle(el).opacity), "0");
    await f.page.locator("#message-20 .quote-button").focus();
    await f.page.clock.runFor(200);
    assert.equal(await f.page.locator("#message-20 .quote-button").evaluate(el => getComputedStyle(el).opacity), "1");
    await pref("messageButtonVisibility").selectOption("always");
    await f.page.clock.runFor(200);
    assert.equal(await f.page.locator("#message-20 .quote-button").evaluate(el => getComputedStyle(el).opacity), "1");
    await pref("messageButtonAppearance").selectOption("outlined");
    assert.notEqual(await f.page.locator("#message-20 .quote-button").evaluate(el => getComputedStyle(el).borderTopColor), "rgba(0, 0, 0, 0)");
    await pref("messageButtonAppearance").selectOption("filled");
    assert.equal(await f.page.locator("#message-20 .quote-button").evaluate(el => getComputedStyle(el).borderTopWidth), "0px");
    await pref("showQuoteButton").uncheck();
    assert.equal(await f.page.locator("#message-20 .quote-button").isVisible(), false);
    await f.page.evaluate(() => window.addMessage({ id: "30" }));
    assert.equal(await f.page.locator("#message-30 .quote-button").isVisible(), false);
    const saved = await f.page.evaluate(() => Object.fromEntries(["messageButtonContent", "messageButtonVisibility", "messageButtonAppearance"]
      .map(key => [key, localStorage.getItem(`ultreme_${key}`)])));
    const reloaded = await fixture({ settings: saved, backlog: [{ id: "10" }] });
    try {
      assert.deepEqual(await reloaded.page.evaluate(() => ({
        content: document.body.dataset.ultremeButtonContent,
        visibility: document.body.dataset.ultremeButtonVisibility,
        appearance: document.body.dataset.ultremeButtonAppearance,
      })), { content: "both", visibility: "always", appearance: "filled" });
      assert.equal(await reloaded.page.locator(".quote-button .message-button-label").isVisible(), true);
    } finally { await reloaded.close(); }
  } finally { await f.close(); }
});

test("buttons wrap without covering message text when revealed on touch screens", { skip: !process.env.MAMI_CLIENT_PATH }, async () => {
  const f = await fixture({ touch: true, settings: { messageButtonContent: "both" } });
  try {
    await f.page.setViewportSize({ width: 360, height: 800 });
    await f.page.evaluate(() => {
      window.addMessage({ id: "10", html: '<i>Lester @ 1m ago —</i><a href="#1:1">\u200c</a><q>quoted</q><br>A long message with several words that needs to wrap on a narrow screen.' });
      document.getElementById("message-10").classList.add("message--first");
    });
    await f.page.locator("#message-10 .message__text").tap();
    const geometry = await f.page.locator("#message-10").evaluate(msg => {
      const text = msg.querySelector(".message__container").getBoundingClientRect();
      const avatar = msg.querySelector(".message__avatar").getBoundingClientRect();
      const buttons = [...msg.querySelectorAll(".message-button-container button")];
      return {
        overflow: msg.scrollWidth - msg.clientWidth,
        overlaps: buttons.some(button => {
          const rect = button.getBoundingClientRect();
          return rect.left < text.right - 1 && rect.right > text.left + 1 &&
            rect.top < text.bottom - 1 && rect.bottom > text.top + 1;
        }),
        visible: getComputedStyle(msg.querySelector(".message-button-container")).opacity === "1",
        avatarBesideText: avatar.right <= text.left + 1 && text.top < avatar.bottom,
      };
    });
    assert.ok(geometry.overflow <= 1);
    assert.equal(geometry.overlaps, false);
    assert.equal(geometry.visible, true);
    assert.equal(geometry.avatarBesideText, true);
  } finally { await f.close(); }
});

test("quote blocks fit their content and remain inside narrow message rows", { skip: !process.env.MAMI_CLIENT_PATH }, async () => {
  const f = await fixture({ settings: { messageButtonContent: "both", messageButtonVisibility: "always" } });
  try {
    await f.page.evaluate(() => {
      for (const id of ["10", "20"]) {
        window.addMessage({ id, html: '<i>Lester @ 1m ago —</i><a href="#1:1">\u200c</a><q>Hi</q><br>This reply is much longer than its quoted message and should use the available row width.' });
      }
      document.getElementById("message-10").classList.add("message--first");
    });
    for (const compact of [false, true]) {
      await f.page.evaluate(compact => document.body.classList.toggle("compact", compact), compact);
      for (const id of ["10", "20"]) {
        const widths = await f.page.locator(`#message-${id}`).evaluate(msg => ({
          quote: msg.querySelector(".message__quote").getBoundingClientRect().width,
          row: msg.querySelector(".message__container").getBoundingClientRect().width,
        }));
        assert.ok(widths.quote < widths.row / 2, `Short quote should fit its content: ${JSON.stringify(widths)}`);
      }
    }
    await f.page.setViewportSize({ width: 360, height: 800 });
    await f.page.evaluate(() => window.addMessage({
      id: "30", html: '<i>A very long author name that should fit @ 1m ago —</i><a href="#1:1">\u200c</a><q>' + "longquotedword".repeat(30) + '</q><br>Reply',
    }));
    for (const compact of [false, true]) {
      await f.page.evaluate(compact => document.body.classList.toggle("compact", compact), compact);
      const bounds = await f.page.locator("#message-30").evaluate(msg => {
        const quote = msg.querySelector(".message__quote");
        const rect = quote.getBoundingClientRect();
        const parent = msg.querySelector(".message__container").getBoundingClientRect();
        return { left: rect.left - parent.left, right: parent.right - rect.right, overflow: quote.scrollWidth - quote.clientWidth };
      });
      assert.ok(bounds.left >= -1 && bounds.right >= -1, JSON.stringify(bounds));
      assert.ok(bounds.overflow <= 1, JSON.stringify(bounds));
    }
  } finally { await f.close(); }
});

test("touch taps reveal one message's existing actions and dismiss them outside, on scroll or after use", async () => {
  const f = await fixture({ touch: true, backlog: [{ id: "10", body: "First message" }, { id: "20", body: "Second message" }] });
  const opacity = id => f.page.locator(`#message-${id} .message-button-container`).evaluate(el => getComputedStyle(el).opacity);
  const tap = id => f.page.locator(`#message-${id} .message__text`).tap();
  try {
    assert.equal(await opacity("10"), "0");
    assert.equal(await f.page.locator("#message-10 .message-button-container").evaluate(el => getComputedStyle(el).pointerEvents), "none");
    await tap("10");
    assert.equal(await opacity("10"), "1");
    await tap("20");
    assert.equal(await opacity("10"), "0");
    assert.equal(await opacity("20"), "1");
    await tap("20");
    assert.equal(await opacity("20"), "0");
    await tap("10");
    await f.page.locator("textarea").tap();
    assert.equal(await opacity("10"), "0");
    await tap("10");
    await f.page.evaluate(() => document.getElementById("umi-messages").dispatchEvent(new Event("scroll")));
    assert.equal(await opacity("10"), "0");
    await tap("10");
    await f.page.locator("#message-10 .quote-button").tap();
    assert.equal(await f.page.locator("#quote-preview").count(), 1);
    assert.equal(await opacity("10"), "0");
    await f.page.keyboard.press("Escape");
    await tap("10");
    await f.page.locator("#message-10 .delete-button").tap();
    assert.deepEqual(await f.page.evaluate(() => window.sent), ["/delete 10"]);
    assert.equal(await opacity("10"), "0");
    await f.page.locator(".js-ultreme-messageButtonVisibility").selectOption("always");
    assert.equal(await opacity("10"), "1");
    assert.equal(await opacity("20"), "1");
    await f.page.locator(".js-ultreme-messageButtonVisibility").selectOption("hover");
    assert.equal(await opacity("10"), "0");
    assert.equal(await opacity("20"), "0");
  } finally { await f.close(); }
});

test("touch reveal leaves links, media, native timestamp quoting and selection alone", async () => {
  const f = await fixture({ touch: true });
  try {
    await f.page.evaluate(() => window.addMessage({
      id: "10", html: 'Selectable message text <a href="#link-target">a link</a> <audio controls></audio>',
    }));
    const state = () => f.page.locator("#message-10 .message-button-container").evaluate(el => getComputedStyle(el).opacity);
    await f.page.locator('#message-10 a[href="#link-target"]').tap();
    assert.equal(await f.page.evaluate(() => location.hash), "#link-target");
    assert.equal(await state(), "0");
    await f.page.evaluate(() => document.querySelector("#message-10 audio").click());
    assert.equal(await state(), "0");
    await f.page.evaluate(() => {
      const text = document.querySelector("#message-10 .message__text").firstChild;
      const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 10);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      document.querySelector("#message-10 .message__text").click();
    });
    assert.equal(await state(), "0");
    await f.page.evaluate(() => getSelection().removeAllRanges());
    await f.page.locator("#message-10 .message__time").tap();
    assert.equal(await f.page.locator("#quote-preview").count(), 1);
    assert.equal(await state(), "0");
  } finally { await f.close(); }
});

test("removed size settings and old saved values leave native sizing and avatar spacing intact", { skip: !process.env.MAMI_CLIENT_PATH }, async () => {
  const f = await fixture({ settings: { messageFontSize: "32", inputFontSize: "28" }, backlog: [{ id: "10" }] });
  try {
    await f.page.evaluate(() => document.getElementById("message-10").classList.add("message--first"));
    assert.equal(await f.page.locator('[data-setting="messageFontSize"], [data-setting="inputFontSize"], #ultreme-font-sizes').count(), 0);
    assert.ok(!(await f.page.locator("#umi-menus-ultreme").innerText()).includes("touch screens"));
    const sizes = await f.page.locator("#message-10").evaluate(msg => {
      const avatar = msg.querySelector(".message__avatar").getBoundingClientRect();
      const container = msg.querySelector(".message__container").getBoundingClientRect();
      return {
        text: getComputedStyle(msg.querySelector(".message__text")).fontSize,
        input: getComputedStyle(document.querySelector("textarea")).fontSize,
        avatar: avatar.width,
        gap: container.left - avatar.right,
      };
    });
    assert.deepEqual(sizes, { text: "16px", input: "16px", avatar: 40, gap: 8 });
  } finally { await f.close(); }
});

test("outlined and borderless filled actions follow every native theme when switched live", { skip: !process.env.MAMI_CLIENT_PATH }, async () => {
  const f = await fixture({ backlog: [{ id: "10" }], settings: { messageButtonVisibility: "always" } });
  const appearance = f.page.locator(".js-ultreme-messageButtonAppearance");
  const button = f.page.locator("#message-10 .quote-button");
  try {
    for (const theme of ["dark", "light", "blue", "purple", "archaic"]) {
      await f.page.evaluate(theme => {
        document.body.classList.remove("theme-dark", "theme-light", "theme-blue", "theme-purple", "theme-archaic");
        document.body.classList.add(`theme-${theme}`);
      }, theme);
      const accent = await f.page.evaluate(() => getComputedStyle(document.body).accentColor);
      await appearance.selectOption("outlined");
      assert.equal(await button.evaluate(el => getComputedStyle(el).borderTopColor), accent, theme);
      await appearance.selectOption("filled");
      await button.focus();
      const filled = await button.evaluate(el => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, border: style.borderTopWidth, outline: style.outlineStyle };
      });
      assert.deepEqual(filled, { background: accent, border: "0px", outline: "none" }, theme);
      await button.hover();
      assert.equal(await button.evaluate(el => getComputedStyle(el).backgroundColor), accent, theme);
    }
  } finally { await f.close(); }
});
