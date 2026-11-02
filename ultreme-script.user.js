// ==UserScript==
// @name         Flashii Chat - Ultreme Script
// @namespace    https://patchii.net/lester/flashii-chat-userscripts
// @version      5.8
// @description  Better quotes & delete button, quote blocks, upload progress bar, and Go to Forum button with settings.
// @author       lester
// @match        *://chat.flashii.net/*
// @grant        unsafeWindow
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      patchii.net
// @downloadURL  https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script.user.js
// @updateURL    https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script.meta.js
// ==/UserScript==

(() => {
  "use strict";

  const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const STORAGE_PREFIX = "ultreme_";
  const cssID = "ultreme-style";
  const ULTREME_MENU_ID = "ultreme";
  const UI_FONT_FAMILY = "InterVariable, Inter, system-ui, sans-serif";
  const DEFAULT_NAME_COLOR = "currentColor";
  const DEFAULT_AVATAR_URL = "https://flashii.net/assets/avatar/";
  const PATCHII_PAGE_URL =
    "https://patchii.net/lester/flashii-chat-userscripts";
  const PATCHII_USERJS_URL =
    "https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script.user.js";
  const PATCHII_META_URL =
    "https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script.meta.js";

  const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH = 100;
  const UPLOAD_PROGRESS_BAR_TEXT_PADDING = 16;
  const UPLOAD_PREVIEW_DURATION_MS = 1500;

  // Keys also identify the existing ultreme_ localStorage entries.
  const SETTINGS_SECTIONS = [
    {
      id: "quotes", title: "Quotes", fields: [
        { key: "showQuoteButton", label: "Show Quote button", default: true },
        { key: "showGotoButton", label: "Show Go to quoted button", default: true },
        { key: "enableQuoteBlocks", label: "Render quote blocks", default: true },
        {
          key: "interceptNativeQuoteButton", label: "Use rich partial quotes", default: true,
          hint: "Use the toolbar Quote button to quote selected message text with its author.",
        },
      ],
    },
    {
      id: "messages", title: "Messages", fields: [
        {
          key: "messageButtonContent", label: "Message button content", default: "icons",
          control: "select", options: [
            { value: "icons", label: "Icons" },
            { value: "text", label: "Text" },
            { value: "both", label: "Icons and text" },
          ],
        },
        {
          key: "messageButtonVisibility", label: "Message button visibility", default: "hover",
          control: "select", options: [
            { value: "hover", label: "On hover, focus or tap" },
            { value: "always", label: "Always visible" },
          ],
        },
        {
          key: "messageButtonAppearance", label: "Message button style", default: "subtle",
          control: "select", options: [
            { value: "plain", label: "Plain", enabled: values => values.messageButtonContent === "icons" },
            { value: "subtle", label: "Subtle" },
            { value: "outlined", label: "Outline" },
          ],
          hint: "Plain is available with icons only.",
        },
        {
          key: "enableDelete", label: "Enable deletion", default: true,
          hint: "Hold Shift and click your message's timestamp to delete it.",
        },
        {
          key: "showDeleteButton", label: "Show Delete button", default: true,
          enabled: values => values.enableDelete,
        },
        { key: "enableKonkira", label: "Compact join/leave notices", default: true },
      ],
    },
    {
      id: "uploads", title: "Uploads", fields: [
        { key: "enableUploadProgress", label: "Show upload progress", default: true },
        {
          key: "uploadProgressDisplayMode", label: "Display", default: "combined",
          enabled: values => values.enableUploadProgress,
          options: [
            { value: "combined", label: "Combined bar", className: "js-ultreme-uploadProgressDisplayCombined" },
            { value: "perfile", label: "Per-file popups", className: "js-ultreme-uploadProgressDisplayPerFile" },
          ],
        },
        {
          key: "uploadProgressTextMode", label: "Progress text", default: "percent",
          enabled: values => values.enableUploadProgress,
          visible: values => values.uploadProgressDisplayMode === "combined",
          options: [
            { value: "percent", label: "Percentage", className: "js-ultreme-uploadProgressPercent" },
            { value: "size", label: "File size", className: "js-ultreme-uploadProgressSize" },
            { value: "both", label: "Both", className: "js-ultreme-uploadProgressBoth" },
          ],
        },
        {
          key: "showUploadFileSize", label: "Show separate file-size label", default: true,
          enabled: values => values.enableUploadProgress,
          visible: values => values.uploadProgressDisplayMode === "combined" &&
            values.uploadProgressTextMode === "percent",
        },
      ],
    },
    {
      id: "navigation", title: "Navigation", fields: [
        { key: "enableForumButton", label: "Show Forum button", default: true },
        { key: "enableJumpToBottomButton", label: "Show Jump to bottom button", default: true },
      ],
    },
    { id: "about", title: "About", fields: [] },
  ];
  const settingFields = SETTINGS_SECTIONS.flatMap(section => section.fields);
  const loadSetting = (field) => {
    try {
      const value = localStorage.getItem(STORAGE_PREFIX + field.key);
      if (value === null) return field.default;
      if (typeof field.default === "boolean") return value === "1";
      return field.options.some(option => option.value === value) ? value : field.default;
    } catch {
      return field.default;
    }
  };
  const settings = Object.fromEntries(settingFields.map(field =>
    [field.key, loadSetting(field)]));
  const saveSetting = (key, value) => {
    settings[key] = value;
    try {
      localStorage.setItem(STORAGE_PREFIX + key,
        typeof value === "boolean" ? (value ? "1" : "0") : value);
    } catch {}
  };

  let revealedActionMessage = null;
  const dismissTouchActions = () => {
    if (!revealedActionMessage) return;
    const focused = document.activeElement;
    if (focused?.closest?.(".message-button-container")?.parentElement === revealedActionMessage)
      focused.blur();
    revealedActionMessage.classList.remove("ultreme-actions-open");
    revealedActionMessage = null;
  };

  const applyMessageButtonSettings = () => {
    dismissTouchActions();
    if (settings.messageButtonAppearance === "plain" && settings.messageButtonContent !== "icons")
      saveSetting("messageButtonAppearance", "subtle");
    document.body.dataset.ultremeButtonContent = settings.messageButtonContent;
    document.body.dataset.ultremeButtonVisibility = settings.messageButtonVisibility;
    document.body.dataset.ultremeButtonAppearance = settings.messageButtonAppearance;
  };

  const syncThemeColors = () => {
    const palette = document.getElementById(cssID)?.sheet?.cssRules[0]?.style;
    if (!palette) return;
    const bodyStyle = W.getComputedStyle(document.body);
    const background = (element) => {
      if (!element) return null;
      const color = W.getComputedStyle(element).backgroundColor;
      return color === "transparent" || /^rgba\(.+,\s*0\)$/.test(color) || /\/\s*0\)$/.test(color)
        ? null : color;
    };
    const surface = background(getMessagesContainer()) || background(getChatInput()) || background(document.body) || "Canvas";
    const dark = bodyStyle.colorScheme === "dark";
    // Sample an unhovered BBCode button without copying its behaviour.
    const probe = document.createElement("button");
    probe.type = "button";
    probe.className = "markup__button";
    probe.hidden = true;
    (document.querySelector(".input__menus .input__menu") || document.body).appendChild(probe);
    const buttonStyle = W.getComputedStyle(probe);
    const buttonBackground = background(probe);
    const buttonText = buttonStyle.color;
    probe.remove();
    const values = {
      "text": bodyStyle.color,
      "surface": surface,
      "button": buttonBackground || "color-mix(in srgb, var(--ultreme-surface) 85%, var(--ultreme-text))",
      "button-text": buttonText,
      "accent": bodyStyle.accentColor !== "auto" ? bodyStyle.accentColor : "Highlight",
      "bright": dark ? bodyStyle.color : surface,
      "shade": dark ? background(document.body) || surface : bodyStyle.color,
    };
    for (const [key, value] of Object.entries(values))
      palette.setProperty(`--ultreme-native-${key}`, value);
  };

  let selectedText = "";
  let selectedQuoteData = null;
  let pendingQuote = null;
  let previewInterval = null;
  let selectedMessageIndex = -1;

  const processedMessages = new WeakSet();
  const konkiraStates = new Map();
  let mediaModal = null;
  const NativeXHR = W.XMLHttpRequest;
  const uploads = new Map();
  let uploadPreviewTimer = null;
  const measureUploadProgressTextWidth = (() => {
    let canvas = null;
    let ctx = null;
    return (text) => {
      canvas ||= document.createElement("canvas");
      ctx ||= canvas.getContext("2d");
      if (!ctx) return DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH;
      ctx.font = `bold 12px ${UI_FONT_FAMILY}`;
      return Math.ceil(ctx.measureText(String(text || "")).width);
    };
  })();

  const getMessagesContainer = () => document.getElementById("umi-messages");
  const getChatInput = () => document.querySelector("textarea.input__text");
  const getMessageText = (msg) => msg?.querySelector(".message__text, .message-tiny-text");
  const getUserColor = (element) => {
    const color = element?.style.color;
    return color && color !== "inherit" ? rgbToHex(color) : null;
  };
  const getQuoteReference = (text) => {
    const anchor = text.querySelector('a[href^="#"]');
    return { anchor, ...parseQuoteHref(anchor?.getAttribute("href")) };
  };

  const getUploadPopupRoot = () =>
    document.getElementById("upload-progress-popup");

  const getCombinedUploadProgressElements = () => {
    const wrapper = document.getElementById("upload-progress-wrapper");
    const bar = document.getElementById("upload-progress-bar");
    const inner = document.getElementById("upload-progress-inner");
    const text = document.getElementById("upload-progress-text");
    const sizeLabel = document.getElementById("upload-progress-size");
    if (!wrapper || !bar || !inner || !text || !sizeLabel) return null;
    return { wrapper, bar, inner, text, sizeLabel };
  };

  const getCombinedUploadProgressText = (percent, sizeText) => {
    if (settings.uploadProgressTextMode === "size") return sizeText;
    if (settings.uploadProgressTextMode === "both") return `${percent}%   ${sizeText}`;
    return `${percent}%`;
  };

  const getCombinedUploadProgressBarWidth = (barText) =>
    settings.uploadProgressTextMode === "percent"
      ? DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH
      : Math.max(
          DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH,
          measureUploadProgressTextWidth(barText) +
            UPLOAD_PROGRESS_BAR_TEXT_PADDING,
        );

  const getVisibleMessages = () => {
    const container = getMessagesContainer();
    if (!container) return [];
    return [...container.children].filter((msg) =>
      msg.classList.contains("message") &&
      !msg.classList.contains("hidden") &&
      msg.querySelector(".message__user") && getMessageText(msg) &&
      !getConnectionNoticeType(msg),
    );
  };

  const rgbToHex = (rgb) => {
    if (rgb?.startsWith("#")) return rgb;
    const m = rgb?.match(/\d+/g);
    return m?.length >= 3
      ? "#" +
          m
            .slice(0, 3)
            .map((x) => (+x).toString(16).padStart(2, "0"))
            .join("")
      : null;
  };

  const buildQuoteDataFromMessageElement = (msg, overrideText = null) => {
    const userEl = msg?.querySelector(".message__user");
    const textEl = getMessageText(msg);
    if (!msg || !userEl || !textEl) return null;

    const dataCreated = msg.getAttribute("data-created");
    const name = userEl.textContent?.trim() || "Unknown";
    const msgText =
      typeof overrideText === "string"
        ? overrideText.trim()
        : cleanMessage(msg.dataset.body || textEl.textContent?.trim() || "");

    return {
      name,
      color: getUserColor(userEl),
      created: dataCreated,
      id: msg.dataset.id,
      authorId: msg.dataset.author,
      avatarVersion: extractAvatarVersion(msg),
      msg: msgText,
    };
  };

  const scrollToMessageId = (targetId) => {
    if (!targetId) return;
    const target = document.getElementById(`message-${targetId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("highlight-temp");
    setTimeout(() => target.classList.remove("highlight-temp"), 1500);
  };

  // Mami renders connection notices as tiny messages, with these exact bodies.
  const getConnectionNoticeType = (msg) => {
    if (msg.dataset.tiny !== "1") return null;
    const body = (msg.dataset.body || "").trim();
    if (body === "has joined" || body === "has joined the channel") return "join";
    if (body === "has disconnected" || body === "has left the channel") return "leave";
    return null;
  };

  function createProgressBar() {
    if (document.getElementById("upload-progress-wrapper")) return;

    const menu = document.querySelector("form.input .input__menu");
    if (!menu) return;

    const wrapper = document.createElement("div");
    wrapper.id = "upload-progress-wrapper";
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: 10px;
      opacity: 0;
      transition: opacity 0.15s ease;
    `;

    const label = document.createElement("span");
    label.textContent = "Uploading File...";
    label.style.cssText = `
      color: var(--ultreme-text);
      font-size: 13px;
    `;

    const sizeLabel = document.createElement("span");
    sizeLabel.id = "upload-progress-size";
    sizeLabel.style.cssText = `
      color: var(--ultreme-text);
      font-size: 12px;
      min-width: 120px;
      white-space: nowrap;
      display: ${settings.uploadProgressTextMode === "percent" && settings.showUploadFileSize ? "" : "none"};
    `;

    const barContainer = document.createElement("div");
    barContainer.id = "upload-progress-bar";
    barContainer.style.cssText = `
      position: relative;
      width: ${DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH}px;
      height: 20px;
      background-color: var(--ultreme-button);
      border-radius: 2px;
      box-shadow: 0 0 0 1px var(--ultreme-border);
      overflow: hidden;
    `;

    const inner = document.createElement("div");
    inner.id = "upload-progress-inner";
    inner.style.cssText = `
      background-color: var(--ultreme-button-hover);
      position: absolute;
      inset: 0 auto 0 0;
      height: 100%;
      width: 0%;
      transition: width 0.15s ease;
    `;

    const text = document.createElement("div");
    text.id = "upload-progress-text";
    text.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ultreme-button-text);
      font-size: 12px;
      font-weight: bold;
      font-family: inherit;
      white-space: pre;
      pointer-events: none;
    `;

    barContainer.append(inner, text);
    wrapper.append(label, barContainer, sizeLabel);
    menu.appendChild(wrapper);
  }

  function createUploadPopup() {
    if (getUploadPopupRoot()) return;

    const popup = document.createElement("div");
    popup.id = "upload-progress-popup";
    popup.style.opacity = "0";
    document.body.appendChild(popup);
  }

  function fadeInUploadPopup() {
    const popup = getUploadPopupRoot();
    if (!popup) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (popup.isConnected) popup.style.opacity = "1";
      });
    });
  }

  function formatUploadSize(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(mb >= 100 ? 0 : mb >= 10 ? 1 : 2)} MB`;
  }

  function getUploadProgress(loaded, total) {
    return {
      percent: total === 0 ? 0 : Math.round((loaded / total) * 100),
      sizeText: `${formatUploadSize(loaded)}/${formatUploadSize(total)}`,
    };
  }

  function renderCombinedProgress({ percent, sizeText }, visible) {
    const elements = getCombinedUploadProgressElements();
    if (!elements) return;
    const { wrapper, bar, inner, text, sizeLabel } = elements;
    const barText = visible ? getCombinedUploadProgressText(percent, sizeText) : "";
    wrapper.style.opacity = visible ? "1" : "0";
    bar.style.width = `${visible ? getCombinedUploadProgressBarWidth(barText) : DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH}px`;
    inner.style.width = `${visible ? percent : 0}%`;
    text.textContent = barText;
    sizeLabel.textContent = visible ? sizeText : "";
    sizeLabel.style.display = settings.uploadProgressTextMode === "percent" && settings.showUploadFileSize ? "" : "none";
  }

  function renderUploadPopupItem(id, { label, percent, sizeText, done = false }) {
    const item = ensureUploadPopupItem(id);
    item.querySelector(".upload-progress-item__name").textContent = label;
    item.querySelector(".upload-progress-item__meta").textContent = `${percent}%`;
    item.querySelector(".upload-progress-item__fill").style.width = `${percent}%`;
    item.querySelector(".upload-progress-item__size").textContent = sizeText;
    item.classList.toggle("is-done", done);
  }

  function clearUploadPreview({ fade = false } = {}) {
    clearTimeout(uploadPreviewTimer);
    uploadPreviewTimer = null;
    if (fade) removeUploadPopupItem("__preview__");
    else getUploadPopupRoot()?.querySelector('[data-upload-id="__preview__"]')?.remove();
    cleanupUploadPopupIfEmpty();
    if (uploads.size === 0) renderCombinedProgress({ percent: 0, sizeText: "" }, false);
  }

  function getUploadLabel(body, fallbackId) {
    if (!body || typeof body !== "object") return `Upload ${fallbackId}`;

    try {
      if (body instanceof W.File && body.name) return body.name;
      if (typeof body.entries === "function") {
        for (const [, value] of body.entries()) {
          if (value instanceof W.File && value.name)
            return value.name;
        }
      }
    } catch {}

    return `Upload ${fallbackId}`;
  }

  function ensureUploadPopupItem(id) {
    createUploadPopup();

    const popup = getUploadPopupRoot();
    if (!popup) return null;

    let item = popup.querySelector(`[data-upload-id="${id}"]`);
    if (item) return item;

    item = document.createElement("div");
    item.className = "upload-progress-item is-hiding";
    item.dataset.uploadId = id;
    item.innerHTML = `
      <div class="upload-progress-item__header">
        <div class="upload-progress-item__name"></div>
        <div class="upload-progress-item__meta"></div>
      </div>
      <div class="upload-progress-item__bar">
        <div class="upload-progress-item__fill"></div>
      </div>
      <div class="upload-progress-item__size"></div>
    `;

    popup.appendChild(item);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (item.isConnected) item.classList.remove("is-hiding");
      });
    });
    return item;
  }

  function cleanupUploadPopupIfEmpty() {
    const popup = getUploadPopupRoot();
    if (!popup) return;
    if (popup.childElementCount === 0) popup.remove();
  }

  function removeUploadPopupItem(id) {
    const popup = getUploadPopupRoot();
    const item = popup?.querySelector(`[data-upload-id="${id}"]`);
    if (!item) return;
    item.classList.add("is-hiding");
    setTimeout(() => {
      item.remove();
      cleanupUploadPopupIfEmpty();
    }, 150);
  }

  function showUploadProgressPreview() {
    clearUploadPreview();
    if (!settings.enableUploadProgress || uploads.size > 0) return;
    const preview = { label: "example-image.png", percent: 64, sizeText: "12.4 MB/19.6 MB" };
    if (settings.uploadProgressDisplayMode === "combined") {
      createProgressBar();
      renderCombinedProgress(preview, true);
    } else {
      renderUploadPopupItem("__preview__", preview);
      fadeInUploadPopup();
    }
    uploadPreviewTimer = setTimeout(() => clearUploadPreview({ fade: true }), UPLOAD_PREVIEW_DURATION_MS);
  }

  function updatePerFileProgress() {
    createUploadPopup();

    const popup = getUploadPopupRoot();
    if (!popup) return;
    if (uploads.size > 0) fadeInUploadPopup();
    else popup.style.opacity = "0";

    for (const [id, upload] of uploads) {
      renderUploadPopupItem(id, { ...upload, ...getUploadProgress(upload.loaded, upload.total) });
    }

    for (const item of [...popup.querySelectorAll(".upload-progress-item")]) {
      if (!uploads.has(item.dataset.uploadId)) item.remove();
    }

    cleanupUploadPopupIfEmpty();
  }

  function refreshUploadProgressUI() {
    if (!settings.enableUploadProgress) return;
    clearUploadPreview();

    if (settings.uploadProgressDisplayMode === "perfile") {
      document.getElementById("upload-progress-wrapper")?.remove();
      updatePerFileProgress();
      return;
    }

    getUploadPopupRoot()?.remove();
    createProgressBar();
    updateCombinedProgress();
  }

  function updateCombinedProgress() {
    let loaded = 0;
    let total = 0;
    for (const upload of uploads.values()) {
      loaded += upload.loaded;
      total += upload.total;
    }
    renderCombinedProgress(getUploadProgress(loaded, total), uploads.size > 0);
  }

  function installUploadProgressPatchOnce() {
    if (NativeXHR.prototype.__ultremeUploadPatched) return;
    NativeXHR.prototype.__ultremeUploadPatched = true;

    const xhrMeta = new WeakMap();
    const originalOpen = NativeXHR.prototype.open;
    const originalSend = NativeXHR.prototype.send;

    NativeXHR.prototype.open = function (method, url) {
      const result = originalOpen.apply(this, arguments);
      try {
        const path = new URL(url, W.location.href).pathname;
        // EEPROM uses multipart /uploads; Misuzu sends a File to /_chat/attachments.
        const isUpload = String(method).toUpperCase() === "POST" &&
          /\/(?:uploads|_chat\/attachments)\/?$/.test(path);
        xhrMeta.set(this, { isUpload, hooked: false });
      } catch {}
      return result;
    };

    NativeXHR.prototype.send = function () {
      const meta = xhrMeta.get(this);
      const body = arguments[0];
      let cleanup = null;

      if (
        settings.enableUploadProgress && meta?.isUpload && !meta.hooked &&
        (body instanceof W.File || body instanceof W.FormData)
      ) {
        meta.hooked = true;
        const id = W.crypto.randomUUID();
        const listeners = new W.AbortController();

        const label = getUploadLabel(body, id);
        uploads.set(id, {
          loaded: 0,
          total: 0,
          done: false,
          label,
          dismissTimer: null,
        });
        refreshUploadProgressUI();

        this.upload.addEventListener("progress", (e) => {
          const current = uploads.get(id);
          if (current && e.lengthComputable) {
            current.loaded = e.loaded;
            current.total = e.total;
            refreshUploadProgressUI();
          }
        }, { signal: listeners.signal });

        this.addEventListener("loadend", () => {
          listeners.abort();
          const current = uploads.get(id);
          if (current) {
            current.done = true;
            current.dismissTimer = setTimeout(() => {
              uploads.delete(id);
              refreshUploadProgressUI();
            }, 1200);
            refreshUploadProgressUI();
          }
        }, { signal: listeners.signal });
        cleanup = () => {
          listeners.abort();
          uploads.delete(id);
          refreshUploadProgressUI();
        };
      }

      try {
        return originalSend.apply(this, arguments);
      } catch (error) {
        cleanup?.();
        throw error;
      }
    };
  }

  function disableUploadProgressUI() {
    clearUploadPreview();
    document.getElementById("upload-progress-wrapper")?.remove();
    getUploadPopupRoot()?.remove();
    for (const upload of uploads.values()) {
      if (upload.dismissTimer) clearTimeout(upload.dismissTimer);
    }
    uploads.clear();
  }

  installUploadProgressPatchOnce();

  function scrollMessagesToBottom() {
    const messages = getMessagesContainer();
    if (!messages) return;
    messages.scrollTop = messages.scrollHeight;
    document.getElementById("umi-messages-anchor")?.scrollIntoView({ block: "end" });
  }

  const SIDEBAR_ACTIONS = [
    {
      key: "enableForumButton", id: "ultreme-forum-button", className: "custom-button",
      title: "Go to Forum", image: true,
      run: () => W.open("https://flashii.net/forum", "_blank"),
    },
    {
      key: "enableJumpToBottomButton", id: "ultreme-jump-bottom-button",
      title: "Jump to bottom", icon: "arrow-down", afterTitle: "Scroll mode",
      run: scrollMessagesToBottom,
    },
  ];

  function syncSidebarActions() {
    const sidebar = document.querySelector(".sidebar__selector");
    if (!sidebar) return;
    for (const action of SIDEBAR_ACTIONS) {
      const existing = document.getElementById(action.id);
      if (!settings[action.key]) { existing?.remove(); continue; }
      if (existing) continue;
      const button = document.createElement("button");
      button.id = action.id;
      button.type = "button";
      button.className = "sidebar__selector-mode" + (action.className ? " " + action.className : "");
      button.title = action.title;
      const content = document.createElement(action.image ? "img" : "i");
      if (action.image) {
        content.src = document.querySelector('link[rel~="icon"]')?.href || "/favicon.ico";
        content.alt = "Flashii Forum";
        content.style.cssText = "width:32px;height:32px";
        button.style.cssText = "display:flex;align-items:center;justify-content:center;cursor:pointer";
      } else content.className = `fas fa-${action.icon} sidebar-gutter-font-icon`;
      button.appendChild(content);
      button.onclick = action.run;
      if (action.afterTitle) {
        const ref = [...sidebar.querySelectorAll(".sidebar__selector-mode")].find(item => item.title === action.afterTitle);
        if (ref) ref.after(button);
        else sidebar.appendChild(button);
      } else sidebar.insertBefore(button, sidebar.querySelector(".sidebar__selector-mode"));
    }
  }

  function smartSlice(text, limit = 100, edge = 50, spill = 10) {
    const isWhiteSpace = (char) => /\s/.test(char || "");

    const n = text.length;
    if (n <= limit) return text;
    if (n <= limit + spill) {
      if (!isWhiteSpace(text[limit]) && !isWhiteSpace(text[limit - 1]))
        return text;
    }

    let startEnd = Math.min(edge, n);
    if (!isWhiteSpace(text[startEnd]) && !isWhiteSpace(text[startEnd - 1])) {
      const before = text.lastIndexOf(" ", startEnd);
      const after = text.indexOf(" ", startEnd);
      if (
        before !== -1 &&
        (after === -1 || startEnd - before <= after - startEnd)
      )
        startEnd = before;
      else if (after !== -1) startEnd = after;
    }
    if (startEnd <= 0) startEnd = Math.min(edge, n);
    const start = text.slice(0, startEnd).trimEnd();

    let endStart = Math.max(n - edge, 0);
    if (!isWhiteSpace(text[endStart]) && !isWhiteSpace(text[endStart - 1])) {
      const after = text.indexOf(" ", endStart);
      const before = text.lastIndexOf(" ", endStart);
      if (after !== -1) endStart = after + 1;
      else if (before !== -1) endStart = before + 1;
      else endStart = Math.max(n - edge, 0);
    }
    const end = text.slice(endStart).trimStart();

    return `${start} ... ${end}`;
  }

  function cleanMessage(msg) {
    let msgText = msg || "";
    const endQuoteIdx = msgText.lastIndexOf("[/quote]");
    if (endQuoteIdx !== -1) msgText = msgText.slice(endQuoteIdx + 8).trim();
    return msgText
      .replace(/\[Embed\]|\[Remove\]/g, "")
      .replace(
        /\[color=var\(--theme-colour-message-time-colour\)\][^\w\[\]]{1,3}\[\/color\]/g,
        "",
      )
      .trim();
  }

  function getElementTextWithBreaks(el) {
    const parts = [];
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.nodeValue || "");
        return;
      }
      if (node.nodeName === "BR") {
        parts.push(" ");
        return;
      }
      for (const child of node.childNodes) walk(child);
    };
    walk(el);
    return parts.join("").replace(/\s+/g, " ").trim();
  }

  const getAvatarUrl = (authorId, avatarVersion = null) => {
    if (!authorId) return DEFAULT_AVATAR_URL;
    if (avatarVersion)
      return `${DEFAULT_AVATAR_URL}${authorId}?ver=${avatarVersion}`;
    return `${DEFAULT_AVATAR_URL}${authorId}`;
  };

  const parseQuoteHref = (href) => {
    const m = String(href || "").match(
      /^#(\d+)(?::([^:#\s]+))?(?::([^#\s]+))?$/,
    );
    if (!m) return { messageId: null, authorId: null, avatarVersion: null };
    return {
      messageId: m[1],
      authorId: m[2] || null,
      avatarVersion: m[3] || null,
    };
  };

  const extractAvatarVersion = (msg) => {
    const src = msg.querySelector(".message__avatar img")?.src;
    return src ? new URL(src, W.location.href).searchParams.get("ver") : null;
  };

  const MEDIA_TYPES = {
    video: { tag: "video", label: "View Video", extensions: ["mp4", "webm", "ogg"] },
    image: { tag: "img", label: "View Image", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"] },
    audio: { tag: "audio", label: "View Audio", extensions: ["mp3", "wav", "flac", "aac", "m4a", "opus", "oga"] },
  };

  const getMediaKind = (url) => {
    const cleanUrl = String(url || "").split("#")[0];
    const extMatch = cleanUrl.split("?")[0].match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : "";
    return Object.keys(MEDIA_TYPES).find(kind => MEDIA_TYPES[kind].extensions.includes(ext)) || null;
  };

  const getMediaLabel = (kind) => {
    return MEDIA_TYPES[kind]?.label || "View Media";
  };

  const createMediaElement = (url, kind, { modal = false } = {}) => {
    const media = document.createElement(MEDIA_TYPES[kind].tag);
    media.src = url;
    if (kind === "image") {
      media.alt = modal ? "Media preview" : "Embedded media";
      if (!modal) media.loading = "lazy";
    } else {
      media.controls = true;
      if (modal) {
        media.autoplay = true;
        media.loop = kind === "video";
      } else media.preload = "metadata";
    }
    return media;
  };

  const createQuoteEmbedToggle = (url, mediaKind) => {
    const wrapper = document.createElement("span");
    wrapper.className = "message__quote-embed-wrap";

    const toggle = document.createElement("a");
    toggle.href = "#";
    toggle.textContent = "Embed";
    toggle.className = "message__quote-embed-toggle";

    const embed = document.createElement("div");
    embed.className = "message__quote-embed";
    embed.style.display = "none";

    toggle.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const isOpen = embed.style.display !== "none";
      if (isOpen) {
        embed.style.display = "none";
        toggle.textContent = "Embed";
        return;
      }

      if (!embed.childElementCount) embed.appendChild(createMediaElement(url, mediaKind));
      embed.style.display = "";
      toggle.textContent = "Remove";
    });

    wrapper.append(
      document.createTextNode("["),
      toggle,
      document.createTextNode("]"),
      embed,
    );
    return wrapper;
  };

  const escapeHtml = (text) =>
    String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const buildPreviewMediaLink = (url, explicitKind = null) => {
    const mediaUrl = String(url || "").trim();
    const label = getMediaLabel(explicitKind || getMediaKind(mediaUrl));
    return `(<a href="${escapeHtml(mediaUrl)}" class="ultreme-preview-media">${label}</a>)`;
  };

  const formatQuotePreviewHtml = (msg) => {
    const placeholders = [];
    const stash = (html) => {
      const idx = placeholders.push(html) - 1;
      return `\uE000${idx}\uE001`;
    };

    let text = cleanMessage(msg);

    text = text.replace(/\[(img|video|audio)\]([\s\S]*?)\[\/\1\]/gi, (_, tag, url) =>
      stash(buildPreviewMediaLink(url, tag.toLowerCase() === "img" ? "image" : tag.toLowerCase())),
    );
    text = text.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_, code) =>
      stash(`<code>${escapeHtml(code)}</code>`),
    );
    text = text.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_, spoiler) =>
      stash(
        `<span class="ultreme-preview-spoiler">${escapeHtml(spoiler)}</span>`,
      ),
    );
    text = text.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, "$1");

    text = escapeHtml(text);

    text = text.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, "$2");
    text = text.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, "$1");

    text = text.replace(/\[b\]/gi, "<b>");
    text = text.replace(/\[\/b\]/gi, "</b>");
    text = text.replace(/\[i\]/gi, "<i>");
    text = text.replace(/\[\/i\]/gi, "</i>");
    text = text.replace(/\[u\]/gi, "<u>");
    text = text.replace(/\[\/u\]/gi, "</u>");
    text = text.replace(/\[s\]/gi, "<s>");
    text = text.replace(/\[\/s\]/gi, "</s>");
    text = text.replace(/\[color=([^\]]+)\]/gi, (_, color) => {
      const value = String(color || "").trim();
      if (
        /^#(?:[0-9a-f]{3,8})$/i.test(value) ||
        /^var\(--[a-z0-9-]+\)$/i.test(value)
      ) {
        return `<span style="color:${value};">`;
      }
      return "<span>";
    });
    text = text.replace(/\[\/color\]/gi, "</span>");

    text = text.replace(/\[(?:\/)?[a-z]+(?:=[^\]]+)?\]/gi, "");

    text = text.replace(
      /\uE000(\d+)\uE001/g,
      (_, idx) => placeholders[Number(idx)] || "",
    );

    return text;
  };

  const closeMediaModal = () => {
    if (!mediaModal) return;
    mediaModal.style.display = "none";
    const content = mediaModal.querySelector(".umi-media-modal-content");
    const link = mediaModal.querySelector(".umi-media-modal-download");
    content?.replaceChildren();
    if (link) {
      link.removeAttribute("href");
      link.removeAttribute("download");
    }
  };

  function ensureMediaModal() {
    if (mediaModal) return;
    mediaModal = document.createElement("div");
    mediaModal.id = "umi-media-modal";
    mediaModal.innerHTML = `
      <div class="umi-media-modal-backdrop">
        <div class="umi-media-modal-shell">
          <div class="umi-media-modal-toolbar">
            <div class="umi-media-modal-title">Ultreme Script Media Viewer</div>
            <div class="umi-media-modal-actions">
              <a class="umi-media-modal-download" target="_blank" rel="noopener noreferrer">Download</a>
              <button type="button" class="umi-media-modal-close" aria-label="Close preview">X</button>
            </div>
          </div>
          <div class="umi-media-modal-content"></div>
        </div>
      </div>
    `;
    mediaModal.addEventListener("click", (event) => {
      if (event.target?.classList?.contains("umi-media-modal-close")) {
        closeMediaModal();
        return;
      }

      if (event.target?.closest?.(".umi-media-modal-toolbar")) return;
      if (
        event.target?.closest?.(
          ".umi-media-modal-content img, .umi-media-modal-content video, .umi-media-modal-content audio",
        )
      )
        return;

      closeMediaModal();
    });
    document.body.appendChild(mediaModal);
  }

  function openMediaModal(url) {
    ensureMediaModal();
    const content = mediaModal.querySelector(".umi-media-modal-content");
    const downloadLink = mediaModal.querySelector(".umi-media-modal-download");
    if (!content) return;

    content.replaceChildren();
    if (downloadLink) {
      downloadLink.href = url;
      downloadLink.setAttribute("download", "");
    }

    const mediaKind = getMediaKind(url);

    if (!mediaKind) {
      W.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    content.appendChild(createMediaElement(url, mediaKind, { modal: true }));
    mediaModal.style.display = "flex";
  }

  const getInstalledVersion = () => {
    try {
      if (typeof GM_info !== "undefined" && GM_info?.script?.version)
        return String(GM_info.script.version);
    } catch {}
    try {
      if (typeof GM !== "undefined" && GM?.info?.script?.version)
        return String(GM.info.script.version);
    } catch {}
    return null;
  };

  const parseSemverish = (v) =>
    String(v || "")
      .trim()
      .split(/[^\d]+/)
      .filter(Boolean)
      .map((x) => parseInt(x, 10) || 0);

  const isVersionNewer = (remote, local) => {
    const a = parseSemverish(remote);
    const b = parseSemverish(local);
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      if (av > bv) return true;
      if (av < bv) return false;
    }
    return false;
  };

  const gmGetText = (url) =>
    new Promise((resolve, reject) => {
      const bust = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;

      const request = typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
        ? GM.xmlHttpRequest.bind(GM)
        : typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null;
      if (request) {
        request({
          method: "GET",
          url: bust,
          onload: (r) => resolve(r.responseText || ""),
          onerror: () => reject(new Error("Update request failed")),
        });
        return;
      }

      fetch(bust, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .then(resolve)
        .catch(reject);
    });

  const fetchRemoteVersion = async () => {
    const text = await gmGetText(PATCHII_META_URL);
    const m = text.match(/^\s*\/\/\s*@version\s+([^\s]+)\s*$/m);
    return m ? m[1].trim() : null;
  };

  const insertBanner = (el) => {
    const form = document.querySelector("form.input");
    const main = form?.querySelector(".input__main");
    if (!form || !main) return;

    const quotePreview = document.getElementById("quote-preview");
    if (quotePreview && quotePreview.parentElement === form)
      form.insertBefore(el, quotePreview);
    else form.insertBefore(el, main);
  };

  const showAutoUpdatePrompt = (remoteVer) => {
    const existing = document.getElementById("ultreme-update-prompt");
    if (existing) existing.remove();

    const prompt = document.createElement("div");
    prompt.id = "ultreme-update-prompt";

    const span = document.createElement("span");
    span.textContent = `Ultreme Script — Update to Version ${remoteVer} available.`;

    const actions = document.createElement("div");
    actions.className = "ultreme-update-actions";

    const view = document.createElement("a");
    view.href = PATCHII_PAGE_URL;
    view.target = "_blank";
    view.rel = "noopener noreferrer";
    view.textContent = "View on Patchii";

    const upd = document.createElement("a");
    upd.href = PATCHII_USERJS_URL;
    upd.target = "_blank";
    upd.rel = "noopener noreferrer";
    upd.textContent = "Update now";

    actions.append(view, upd);

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.id = "ultreme-update-dismiss";
    dismiss.textContent = "×";
    dismiss.title = "Dismiss";
    dismiss.onclick = () => prompt.remove();
    prompt.append(span, actions, dismiss);
    insertBanner(prompt);
  };

  const runAutoUpdateCheck = async () => {
    const updateInfo = await checkForUpdates();
    if (!updateInfo) return;

    if (updateInfo.isNewer) showAutoUpdatePrompt(updateInfo.remoteVer);
  };

  const runManualUpdateCheck = async (ui) => {
    ui.setStatus("Checking for updates...");
    ui.setUpdateAvailable(false);

    const updateInfo = await checkForUpdates();
    if (!updateInfo) {
      ui.setStatus("Update check failed. Please try again.");
      ui.setUpdateAvailable(false);
      return;
    }

    if (!updateInfo.localVer) {
      ui.setStatus("Unable to read installed version.");
      ui.setUpdateAvailable(false);
      return;
    }

    if (!updateInfo.remoteVer) {
      ui.setStatus("Unable to determine remote version.");
      ui.setUpdateAvailable(false);
      return;
    }

    if (updateInfo.isNewer) {
      ui.setStatus(`Update available: ${updateInfo.remoteVer}`);
      ui.setUpdateAvailable(true);
      return;
    }

    ui.setStatus(`You're on the latest!`);
    ui.setUpdateAvailable(false);
  };

  const checkForUpdates = async () => {
    const localVer = getInstalledVersion();
    if (!localVer) return { localVer: null, remoteVer: null, isNewer: false };

    try {
      const remoteVer = await fetchRemoteVersion();
      return {
        localVer,
        remoteVer,
        isNewer: remoteVer ? isVersionNewer(remoteVer, localVer) : false,
      };
    } catch {
      return null;
    }
  };

  let initialized = false;
  const initialize = () => {
    if (initialized || !W.Umi?.User?.getCurrentUser?.()?.id ||
        !getMessagesContainer() || !getChatInput()) return;
    initialized = true;

    const isOwnMessage = (msg) =>
      msg.dataset.author === W.Umi?.User?.getCurrentUser?.()?.id;
    const deleteMessage = (msg) => {
      if (settings.enableDelete && isOwnMessage(msg))
        W.Umi.Server.sendMessage(`/delete ${msg.dataset.id}`);
    };

    runAutoUpdateCheck();
    setInterval(runAutoUpdateCheck, UPDATE_CHECK_INTERVAL_MS);

    document.body.dataset.ultremeQuoteBlocks = settings.enableQuoteBlocks ? "1" : "0";

    const getRelativeTime = (dateString) => {
      if (!dateString) return "";
      const createdDate = new Date(dateString);
      const now = new Date();
      const diffMs = now - createdDate;

      const seconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (seconds < 60) return `${seconds}s ago`;
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
      return `${days}d ${hours % 24}h ${minutes % 60}m ago`;
    };

    const applyKonkira = (msg, userId, type) => {
      const u_state = konkiraStates.get(userId);
      if (u_state?.el.isConnected && u_state.el.dataset.created > msg.dataset.created) return;
      if (u_state?.el.isConnected && u_state.el.dataset.created <= msg.dataset.created) {
        u_state.el.remove();
        const n_cnt = u_state.cnt + 1;
        msg.classList.add("konkira-summary");
        msg.setAttribute("konkira-count", n_cnt);
        const t_el = getMessageText(msg);
        if (t_el) {
          if (n_cnt === 2 && u_state.start_t === "join" && type === "leave") {
            t_el.innerHTML = `&nbsp;lurked`;
          } else if (
            n_cnt === 2 &&
            u_state.start_t === "leave" &&
            type === "join"
          ) {
            t_el.innerHTML = `&nbsp;rejoined`;
          } else {
            t_el.innerHTML = `&nbsp;is jittery<span class="connection-badge">x${n_cnt}</span>`;
          }
        }
        konkiraStates.set(userId, {
          cnt: n_cnt,
          el: msg,
          start_t: u_state.start_t,
        });
      } else {
        konkiraStates.set(userId, {
          cnt: 1,
          el: msg,
          start_t: type,
        });
      }
    };

    const injectCSS = () => {
      if (document.getElementById(cssID)) return;
      const style = document.createElement("style");
      style.id = cssID;
      style.textContent = `
        body {
          --ultreme-text: var(--theme-colour-main-colour, var(--ultreme-native-text, CanvasText));
          --ultreme-surface: var(--theme-colour-input-background, var(--ultreme-native-surface, Canvas));
          --ultreme-button: var(--theme-colour-input-menu-button, var(--ultreme-native-button, ButtonFace));
          --ultreme-button-text: var(--theme-colour-main-colour, var(--ultreme-native-button-text, ButtonText));
          --ultreme-button-hover: var(--theme-colour-input-menu-button-hover, color-mix(in srgb, var(--ultreme-button) 85%, var(--ultreme-button-text)));
          --ultreme-button-active: var(--theme-colour-input-menu-button-active, color-mix(in srgb, var(--ultreme-button) 75%, var(--ultreme-button-text)));
          --ultreme-accent: var(--theme-colour-main-accent, var(--ultreme-native-accent, Highlight));
          --ultreme-border: var(--theme-colour-settings-input-border, color-mix(in srgb, var(--ultreme-surface) 75%, var(--ultreme-text)));
          --ultreme-muted: var(--theme-colour-message-time-colour, color-mix(in srgb, var(--ultreme-text) 65%, var(--ultreme-surface)));
          --ultreme-bright: var(--ultreme-native-bright, Canvas);
          --ultreme-shade: var(--ultreme-native-shade, CanvasText);
          --ultreme-shadow: color-mix(in srgb, var(--ultreme-shade) 45%, transparent);
          --ultreme-raised: color-mix(in srgb, var(--ultreme-surface) 92%, var(--ultreme-text));
        }
        #umi-menus-ultreme,
        #quote-preview,
        #ultreme-update-prompt,
        #upload-progress-wrapper,
        #upload-progress-popup,
        #umi-media-modal,
        .message-button-container,
        .message__quote {
          font-family: ${UI_FONT_FAMILY};
          color: var(--ultreme-text);
        }
        #umi-menus-ultreme input,
        #umi-menus-ultreme select,
        #umi-menus-ultreme button,
        #quote-preview button,
        #ultreme-update-prompt button,
        .message-button-container button {
          font-family: inherit;
        }
        /* Keep the quote wire format readable with Mami's new theme styles. */
        .message__text {
          --theme-colour-message-time-colour: var(--ultreme-muted);
        }
        .message.ultreme-has-actions {
          flex-wrap: wrap;
        }
        .message.ultreme-has-actions .message__container {
          flex: 1 1 min(12em, calc(100% - 3.5em));
          min-width: min(12em, calc(100% - 3.5em));
        }
        .message .message-button-container {
          display: flex;
          flex: 0 1 auto;
          flex-wrap: wrap;
          justify-content: flex-end;
          align-self: center;
          max-width: 100%;
          margin-left: auto;
          gap: 0.25em;
        }
        .message .message-button-container button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.846154em;
          min-height: 1.846154em;
          opacity: 0;
          border: 1px solid transparent;
          border-radius: 2px;
          padding: 0;
          font-size: max(13px, 0.8125em);
          line-height: 1.2;
          gap: 0.35em;
          cursor: pointer;
          transition: opacity 0.15s ease, background 0.1s, border-color 0.1s;
        }
        /* Native markup__button theme rules override these legacy fallbacks. */
        .message-button-container button {
          background: var(--ultreme-button);
          color: var(--ultreme-button-text);
        }
        .message-button-container button:hover {
          background: var(--ultreme-button-hover);
        }
        .message-button-container button:active {
          background: var(--ultreme-button-active);
        }
        .message-button-label {
          display: none;
          white-space: nowrap;
        }
        body[data-ultreme-button-content="text"] .message-button-container i {
          display: none;
        }
        body[data-ultreme-button-content="text"] .message-button-label,
        body[data-ultreme-button-content="both"] .message-button-label {
          display: inline;
        }
        body[data-ultreme-button-content="text"] .message-button-container button,
        body[data-ultreme-button-content="both"] .message-button-container button {
          padding: 0.2em 0.5em;
        }
        /* Fit actions within Mami's compact message line height. */
        body.compact .message .message-button-container button {
          min-height: 1.3125em;
          padding-block: 0;
          font-size: inherit;
          line-height: 1;
        }
        body[data-ultreme-button-appearance="outlined"] .message-button-container button {
          /* Brighten the native fill using the theme's lighter colour. */
          background-clip: border-box;
          border-color: color-mix(in srgb, var(--ultreme-bright) 35%, transparent);
        }
        body[data-ultreme-button-content="icons"][data-ultreme-button-appearance="plain"] .message .message-button-container button {
          background: transparent;
          border-color: transparent;
          color: inherit;
        }
        .message-button-container button:focus-visible {
          outline: 2px solid var(--ultreme-accent);
          outline-offset: 2px;
        }
        .message:hover .message-button-container button,
        .message:focus-within .message-button-container button,
        body[data-ultreme-button-visibility="always"] .message-button-container button {
          opacity: 1;
        }
        @media (hover: none) {
          .message .message-button-container button { opacity: 1; }
          body[data-ultreme-button-visibility="hover"] .message .message-button-container {
            opacity: 0;
            pointer-events: none;
          }
          body[data-ultreme-button-visibility="hover"] .message.ultreme-actions-open .message-button-container,
          body[data-ultreme-button-visibility="hover"] .message .message-button-container:focus-within {
            opacity: 1;
            pointer-events: auto;
          }
        }
        #quote-preview,
        #ultreme-update-prompt {
          background: var(--ultreme-surface);
          border: 1px solid var(--ultreme-border);
          padding: 6px 10px;
          font-size: 13px;
          margin: 4px -1px;
          display: flex;
          max-width: 100%;
        }
        #quote-preview { align-items: center; }
        #quote-preview span {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: normal;
        }
        #quote-preview code {
          font-family: Consolas, "Courier New", monospace;
          font-size: 12px;
          padding: 1px 4px;
          border-radius: 2px;
          background: var(--ultreme-button);
        }
        #quote-preview .ultreme-preview-media,
        .message__quote-text a.message__quote-media,
        .message__quote-text .message__quote-embed-toggle {
          color: var(--ultreme-accent);
          text-decoration: none;
          cursor: pointer;
        }
        #quote-preview .ultreme-preview-spoiler {
          padding: 0 4px;
          border-radius: 2px;
          background: var(--ultreme-button);
          color: var(--ultreme-text);
          filter: brightness(0.8);
        }
        #cancel-quote,
        #ultreme-update-dismiss {
          flex: 0 0 auto;
          background: none;
          border: none;
          color: var(--ultreme-text);
          cursor: pointer;
          font-weight: bold;
          padding: 0 6px;
          font-size: 13px;
        }
        #cancel-quote {
          margin-left: 6px;
          align-self: center;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.6em;
          height: 1.6em;
          padding: 0;
          border-radius: 0;
          line-height: 1;
        }
        #cancel-quote:hover,
        #cancel-quote:focus-visible {
          background: var(--ultreme-button-hover);
          color: var(--ultreme-button-text);
        }
        #cancel-quote:active {
          background: var(--ultreme-button-active);
          color: var(--ultreme-button-text);
        }
        #cancel-quote:focus-visible {
          outline: 1px solid var(--ultreme-accent);
          outline-offset: 1px;
        }
        #ultreme-update-prompt {
          align-items: center;
          gap: 10px;
        }
        #ultreme-update-prompt > span {
          flex: 1 1 auto;
          min-width: 0;
        }
        .ultreme-update-actions {
          display: flex;
          gap: 8px;
          flex: 0 0 auto;
          white-space: nowrap;
        }
        .ultreme-update-actions a {
          border: none;
          border-radius: 2px;
          padding: 1px 6px;
          font-size: 13px;
          cursor: pointer;
          background: var(--ultreme-button);
          color: var(--ultreme-button-text);
          text-decoration: none;
        }
        .ultreme-update-actions a:hover {
          background: var(--ultreme-button-hover);
        }
        .ultreme-update-actions a:active {
          background: var(--ultreme-button-active);
        }

        .highlight-temp {
          animation: blinkOutline 1s ease-in-out;
          outline: 2px solid transparent;
          border-radius: 4px;
          outline-offset: 1px;
        }
        @keyframes blinkOutline {
          0%   { outline-color: transparent; }
          50%  { outline-color: var(--ultreme-accent); }
          100% { outline-color: transparent; }
        }
        .message__time,
        .message__text i {
          cursor: pointer;
        }
        .message__time:hover,
        .message__text i:hover {
          text-decoration: underline;
        }
        .message.selected-quote::after {
          content: "";
          pointer-events: none;
          position: absolute;
          inset: 0;
          opacity: 0.1;
          background-color: color-mix(in srgb, var(--ultreme-accent) 50%, var(--ultreme-shade));
        }
        .message__container.has-inline-quote {
          display: flex;
          align-items: flex-start;
        }
        .message__container.has-inline-quote .message__meta {
          flex: 0 0 auto;
        }
        .message__container.has-inline-quote .message__body {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          min-width: 0;
          max-width: 100%;
        }
        .message.message--first .message__container.has-inline-quote {
          flex-direction: column;
        }
        .message.message--first .message__container.has-inline-quote .message__meta {
          margin-right: 0;
          margin-bottom: 2px;
        }
        .message:not(.message--first) .message__container.has-inline-quote {
          flex-direction: row;
        }
        .message__quote {
          /* Blend the theme's text colour over the actual message background. */
          --ultreme-quote-tint: var(--theme-colour-main-colour, currentColor);
          margin-top: 2px;
          margin-bottom: 2px;
          padding: 4px 8px;
          font-size: 12px;
          border-radius: 3px;
          border: 2px solid color-mix(in srgb, var(--ultreme-quote-tint) 25%, transparent);
          background: color-mix(in srgb, var(--ultreme-quote-tint) 8%, transparent);
          cursor: pointer;
          opacity: 0.97;
          display: flex;
          align-items: flex-start;
          align-self: flex-start;
          width: fit-content;
          gap: 6px;
          max-width: 100%;
          box-sizing: border-box;
        }
        .message__quote:hover {
          border-color: var(--ultreme-accent);
        }
        .message__quote-avatar {
          width: 20px;
          height: 20px;
          border-radius: 0;
          flex: 0 0 auto;
          object-fit: cover;
        }
        .message__quote-body {
          flex: 1 1 auto;
          min-width: 0;
        }
        .message__quote-header {
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .message__quote-text {
          white-space: normal;
          word-break: break-word;
        }
        .message__quote-embed {
          margin-top: 6px;
        }
        .message__quote-embed img,
        .message__quote-embed video {
          max-width: min(100%, 420px);
          max-height: 240px;
          display: block;
          border-radius: 3px;
        }
        .message__quote-embed audio {
          width: min(100%, 420px);
          display: block;
        }
        .message__quote + .message__text {
          display: block;
          margin-top: 2px;
        }
        .message__quote-reference {
          display: none;
        }
        body.compact #umi-messages .message__container.has-inline-quote {
          display: grid !important;
          grid-template-columns: max-content max-content minmax(0, 1fr);
          align-items: baseline;
          column-gap: 0.4em;
          min-width: 0;
        }
        body.compact #umi-messages .message__container.has-inline-quote .message__meta {
          display: inline-flex !important;
          align-items: baseline;
          grid-column: 1;
          grid-row: 1;
          margin-right: 0;
          margin-bottom: 0 !important;
        }
        body.compact #umi-messages .message__container.has-inline-quote .message__time {
          order: 1;
          margin-right: 3px;
          line-height: 1;
        }
        body.compact #umi-messages .message__container.has-inline-quote .message__user {
          order: 2;
        }
        body.compact #umi-messages .message__container.has-inline-quote .message__body {
          display: contents !important;
        }
        body.compact #umi-messages .message__quote {
          display: none !important;
        }
        body.compact[data-ultreme-quote-blocks="1"] #umi-messages .message__quote-reference {
          display: inline-flex !important;
          align-items: center;
          align-self: center;
          grid-column: 2;
          grid-row: 1;
          justify-self: start;
          gap: 0.3em;
          min-width: 0;
          max-width: 100%;
          color: var(--ultreme-muted);
          font-size: 0.9em;
          line-height: 1;
          text-decoration: none;
        }
        .message__quote-reference i {
          flex: 0 0 auto;
        }
        .message__quote-reference-author {
          flex: 0 0 auto;
          max-width: calc(100% - 1.5em);
          overflow-wrap: anywhere;
          font-weight: 500;
        }
        .message__quote-reference-text {
          flex: 1 1 auto;
          min-width: 0;
          max-width: min(25vw, 28ch);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: normal;
        }
        body.compact[data-ultreme-quote-blocks="1"] #umi-messages .message__quote-reference:hover {
          color: var(--ultreme-text);
          text-decoration: underline;
        }
        .message__quote-reference:focus-visible {
          outline: 1px solid var(--ultreme-accent);
          outline-offset: -1px;
        }
        body.compact #umi-messages .message__quote + .message__text {
          display: block !important;
          grid-column: 3;
          grid-row: 1;
          min-width: 0;
          margin-top: 0;
          white-space: pre-wrap;
        }
        @media (max-width: 600px) {
          body.compact #umi-messages .message__container.has-inline-quote {
            grid-template-columns: max-content minmax(0, 1fr);
          }
          body.compact #umi-messages .message__container.has-inline-quote .message__meta {
            grid-row: 2;
          }
          body.compact[data-ultreme-quote-blocks="1"] #umi-messages .message__quote-reference {
            grid-column: 1 / -1;
          }
          body.compact #umi-messages .message__quote + .message__text {
            grid-column: 2;
            grid-row: 2;
          }
        }
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__container.has-inline-quote {
          display: flex !important;
          flex-direction: row !important;
          align-items: baseline;
          min-width: 0;
        }
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__container.has-inline-quote .message__meta {
          display: inline-flex !important;
          align-items: baseline;
          flex: 0 0 auto;
          margin-right: 4px;
          margin-bottom: 0 !important;
        }
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__container.has-inline-quote .message__body {
          display: inline !important;
        }
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__quote + .message__text {
          display: inline !important;
          white-space: pre-wrap;
        }
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__text i.ultreme-inline-quote,
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__text i.ultreme-inline-quote span,
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__text q.ultreme-inline-quote {
          display: inline !important;
        }
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__text q.ultreme-inline-quote {
          max-width: none;
          margin: 0 0 0 2px;
          white-space: inherit;
          overflow: visible;
          text-overflow: clip;
          vertical-align: baseline;
        }
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__text q.ultreme-inline-quote::after {
          content: close-quote " ";
        }
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__text a.ultreme-inline-quote,
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__text q.ultreme-inline-quote br,
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__text > br.ultreme-inline-quote,
        body.compact[data-ultreme-quote-blocks="0"] #umi-messages .message__text > span.ultreme-inline-quote {
          display: none !important;
        }
        #umi-media-modal {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 9999;
          align-items: center;
          justify-content: center;
        }
        #umi-media-modal .umi-media-modal-backdrop {
          position: absolute;
          inset: 0;
          background: color-mix(in srgb, var(--ultreme-shade) 75%, transparent);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        #umi-media-modal .umi-media-modal-shell {
          position: relative;
          width: min(96vw, 1600px);
          height: min(96vh, 1000px);
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: flex-start;
        }
        #umi-media-modal .umi-media-modal-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          box-sizing: border-box;
          padding: 10px 12px;
          margin-bottom: 8px;
          border-radius: 4px;
          background: color-mix(in srgb, var(--ultreme-surface) 92%, transparent);
          box-shadow: 0 0 16px var(--ultreme-shadow);
          backdrop-filter: blur(2px);
        }
        #umi-media-modal .umi-media-modal-title {
          color: var(--ultreme-text);
          font-size: 13px;
          font-family: inherit;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #umi-media-modal .umi-media-modal-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          min-width: 0;
        }
        #umi-media-modal .umi-media-modal-download,
        #umi-media-modal .umi-media-modal-close {
          border: none;
          border-radius: 2px;
          padding: 3px 8px;
          font-size: 13px;
          cursor: pointer;
          background: var(--ultreme-button);
          color: var(--ultreme-button-text);
          text-decoration: none;
          font-family: inherit;
        }
        #umi-media-modal .umi-media-modal-download:hover,
        #umi-media-modal .umi-media-modal-close:hover {
          background: var(--ultreme-button-hover);
        }
        #umi-media-modal .umi-media-modal-download:active,
        #umi-media-modal .umi-media-modal-close:active {
          background: var(--ultreme-button-active);
        }
        #umi-media-modal .umi-media-modal-content {
          width: 100%;
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          box-sizing: border-box;
          overflow: hidden;
        }
        #umi-media-modal audio { width: min(100%, 640px); }
        #umi-media-modal img,
        #umi-media-modal video {
          max-width: 100%;
          max-height: 100%;
          display: block;
          box-shadow: 0 0 16px color-mix(in srgb, var(--ultreme-shade) 80%, transparent);
          object-fit: contain;
        }
        body[data-ultreme-quote-blocks="1"] .ultreme-inline-quote {
          display: none !important;
        }
        body[data-ultreme-quote-blocks="0"] .message__quote {
          display: none !important;
        }
        .setting__hint {
          margin-bottom: 4px;
          font-size: 12px;
          color: var(--ultreme-muted);
        }
        .ultreme-setting-disabled {
          opacity: 0.55;
          pointer-events: none;
        }
        .ultreme-setting-subtitle {
          margin: 8px 0 2px;
          font-size: 11px;
          font-weight: bold;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--ultreme-muted);
        }
        .ultreme-setting-field {
          border: none;
          padding: 0;
          margin: 6px 0;
          min-width: 0;
        }
        #upload-progress-popup {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 9998;
          width: min(340px, calc(100vw - 32px));
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: none;
          transition: opacity 0.15s ease;
        }
        .upload-progress-item {
          background: var(--ultreme-raised);
          border: 1px solid var(--ultreme-border);
          box-shadow: 0 8px 22px color-mix(in srgb, var(--ultreme-shade) 30%, transparent);
          border-radius: 4px;
          padding: 10px;
          pointer-events: auto;
          backdrop-filter: blur(6px);
          font-family: inherit;
          opacity: 1;
          transition: opacity 0.15s ease;
        }
        .upload-progress-item.is-hiding {
          opacity: 0;
        }
        .upload-progress-item__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }
        .upload-progress-item__name {
          min-width: 0;
          flex: 1 1 auto;
          font-size: 13px;
          font-weight: bold;
          color: var(--ultreme-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .upload-progress-item__meta,
        .upload-progress-item__size {
          font-size: 12px;
          color: var(--ultreme-muted);
          white-space: nowrap;
        }
        .upload-progress-item__bar {
          position: relative;
          width: 100%;
          height: 10px;
          overflow: hidden;
          border-radius: 999px;
          background: var(--ultreme-button);
          box-shadow: 0 0 0 1px var(--ultreme-border);
          margin-bottom: 8px;
        }
        .upload-progress-item__fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(
            90deg,
            var(--ultreme-accent),
            var(--ultreme-button-hover)
          );
          transition: width 0.15s ease;
        }
        .upload-progress-item.is-done .upload-progress-item__fill {
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--ultreme-accent) 70%, var(--ultreme-bright)),
            var(--ultreme-accent)
          );
        }
        .message.konkira-summary .connection-badge {
          display: inline-block;
          background: var(--ultreme-button);
          color: var(--ultreme-button-text);
          border-radius: 4px;
          padding: 1px 5px;
          margin-left: 6px;
          font-weight: bold;
          font-size: 0.85em;
        }
      `;
      document.head.appendChild(style);
    };

    const showQuotePreview = ({ name, msg, color, created }) => {
      clearInterval(previewInterval);

      let preview = document.getElementById("quote-preview");
      if (!preview) {
        preview = document.createElement("div");
        preview.id = "quote-preview";

        const span = document.createElement("span");
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.id = "cancel-quote";
        cancel.title = "Cancel quote";
        cancel.setAttribute("aria-label", "Cancel quote");
        const cancelIcon = document.createElement("i");
        cancelIcon.className = "fas fa-trash-alt";
        cancelIcon.setAttribute("aria-hidden", "true");
        cancel.appendChild(cancelIcon);
        cancel.onclick = () => {
          clearPendingQuote();
        };

        preview.append(span, cancel);
        insertBanner(preview);
      }

      const span = preview.querySelector("span");

      const displayHtml = formatQuotePreviewHtml(msg);
      const showColor = color || DEFAULT_NAME_COLOR;
      const nameHtml = `<b style="color:${escapeHtml(showColor)};">${escapeHtml(name)}</b>`;
      const updateTime = () => {
        const time = getRelativeTime(created);
        span.innerHTML = `Quoting ${nameHtml} @ ${time} — ${displayHtml}`;
      };

      updateTime();
      previewInterval = setInterval(updateTime, 1000);
    };

    const clearPendingQuote = () => {
      pendingQuote = null;
      document.getElementById("quote-preview")?.remove();
      clearInterval(previewInterval);
      previewInterval = null;
      clearSelectedMessage();
    };

    const applyQuote = (messageData) => {
      pendingQuote = messageData;
      selectedText = "";
      selectedQuoteData = null;
      showQuotePreview(pendingQuote);
      getChatInput()?.focus();
    };

    const clearSelectedMessage = () => {
      document.querySelectorAll(".message.selected-quote")
        .forEach((m) => m.classList.remove("selected-quote"));
      selectedMessageIndex = -1;
    };

    const selectQuoteSource = (msg, data) => {
      clearSelectedMessage();
      msg.classList.add("selected-quote");
      applyQuote(data);
    };

    const selectMessage = (index, messages) => {
      if (index >= 0 && index < messages.length) {
        const msg = messages[index];
        const messageData = buildQuoteDataFromMessageElement(msg);
        if (messageData) selectQuoteSource(msg, messageData);
        else clearSelectedMessage();
        selectedMessageIndex = index;
        return;
      }

      clearPendingQuote();
    };

    document.addEventListener("mouseup", () => {
      const sel = W.getSelection?.();
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      const container = range?.commonAncestorContainer;
      const element = container?.closest ? container : container?.parentElement;
      if (!element?.closest("#umi-messages")) {
        selectedText = "";
        selectedQuoteData = null;
        return;
      }

      selectedText = sel.toString().trim();
      const sourceMessage = element.closest(".message");
      selectedQuoteData =
        selectedText && sourceMessage
          ? buildQuoteDataFromMessageElement(sourceMessage, selectedText)
          : null;
    });

    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || !(t instanceof Element)) return;

      const previewMediaLink = t.closest(".ultreme-preview-media, .message__quote-media");
      if (previewMediaLink instanceof HTMLAnchorElement) {
        e.preventDefault();
        openMediaModal(previewMediaLink.href);
        return;
      }

      if (
        !settings.interceptNativeQuoteButton &&
        t.matches(".input__menus button.markup__button") &&
        t.textContent.trim().toLowerCase() === "quote"
      ) {
        setTimeout(() => {
          const input = getChatInput();
          if (input && selectedText) {
            const quoted = `[quote]${selectedText}[/quote]`;
            const start = input.selectionStart;
            const end = input.selectionEnd;
            // The native button wraps the textarea selection before this handler.
            const before = input.value.slice(0, start);
            const after = input.value.slice(end);
            input.value = before.endsWith("[quote]") && after.startsWith("[/quote]")
              ? before + selectedText + after
              : input.value + quoted;
            input.focus();
            selectedText = "";
            selectedQuoteData = null;
          }
        }, 50);
      }
    });

    document.addEventListener(
      "click",
      (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (!settings.interceptNativeQuoteButton || !selectedQuoteData) return;
        if (
          !t.matches(".input__menus button.markup__button") ||
          t.textContent.trim().toLowerCase() !== "quote"
        )
          return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        applyQuote(selectedQuoteData);
      },
      true,
    );

    const messageActions = [
      {
        className: "delete-button", icon: "trash-alt", text: "Delete", title: "Delete this message",
        available: ({ msg }) => isOwnMessage(msg),
        visible: () => settings.enableDelete && settings.showDeleteButton,
        run: ({ msg }) => deleteMessage(msg),
      },
      {
        className: "quote-button", icon: "quote-right", text: "Quote", title: "Quote this message",
        visible: () => settings.showQuoteButton,
        run: ({ msg, data }) => selectQuoteSource(msg,
          selectedQuoteData?.msg && selectedQuoteData.id === data.id ? { ...selectedQuoteData } : data),
      },
      {
        className: "goto-button", icon: "arrow-up", text: "Go to quoted", title: "Scroll to quoted message",
        available: ({ quote }) => !!quote.messageId,
        visible: () => settings.showGotoButton,
        run: ({ quote }) => scrollToMessageId(quote.messageId),
      },
    ];
    const syncMessageActionVisibility = () => {
      for (const action of messageActions)
        document.querySelectorAll(`.${action.className}`).forEach(button => {
          button.style.display = action.visible() ? "" : "none";
        });
    };

    const appendMessageButton = (
      container,
      { className, icon, text, title, visible = true, onClick },
    ) => {
      const button = document.createElement("button");
      button.className = `${className} markup__button`;
      button.type = "button";
      button.title = title;
      button.setAttribute("aria-label", title);
      const glyph = document.createElement("i");
      glyph.className = `fas fa-${icon}`;
      glyph.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "message-button-label";
      label.textContent = text;
      button.append(glyph, label);
      button.onclick = onClick;
      button.style.display = visible ? "" : "none";
      container.appendChild(button);
    };

    const enhanceScriptQuote = (msg, textEl, reference) => {
      const { anchor, messageId: targetId, authorId: quotedAuthorIdFromHref,
        avatarVersion: quotedAvatarVersion } = reference;
      const qEl = textEl.querySelector("q");
      const metaI = textEl.querySelector("i");
      if (!anchor || !qEl || !metaI) return;

      const aText = anchor.textContent || "";
      if (aText.length !== 1 || aText.charCodeAt(0) !== 0x200c) return;

      if (!targetId) return;

      metaI.classList.add("ultreme-inline-quote");
      anchor.classList.add("ultreme-inline-quote");
      qEl.classList.add("ultreme-inline-quote");
      // Only hide the fallback separator after the quote, not breaks in either message.
      let separator = qEl.nextSibling;
      while (separator) {
        if (separator.nodeType === Node.TEXT_NODE && !separator.textContent.trim()) {
          const whitespace = document.createElement("span");
          whitespace.className = "ultreme-inline-quote";
          separator.before(whitespace);
          whitespace.appendChild(separator);
          separator = whitespace.nextSibling;
          continue;
        }
        if (separator.nodeName === "BR") {
          separator.classList.add("ultreme-inline-quote");
          separator = separator.nextSibling;
          continue;
        }
        if (separator.nodeName === "SPAN" && /^[└┗][─━-]*\s*$/.test(separator.textContent))
          separator.classList.add("ultreme-inline-quote");
        break;
      }
      qEl.querySelectorAll("br").forEach((quoteBr) => {
        quoteBr.classList.add("ultreme-inline-quote");
        quoteBr.before(document.createTextNode(" "));
      });

      const targetMsg = document.getElementById(`message-${targetId}`);

      const quoteContainer = document.createElement("div");
      quoteContainer.className = "message__quote";

      const avatarImg = document.createElement("img");
      avatarImg.className = "message__quote-avatar";
      avatarImg.alt = "";
      avatarImg.src = DEFAULT_AVATAR_URL;

      let quotedName = "Unknown";
      let quotedColor = null;
      let quotedCreated = null;
      let relTime = "";

      {
        const headerText = metaI.textContent || "";
        const atIdx = headerText.indexOf("@ ");
        const dashIdx = headerText.lastIndexOf("—");
        if (atIdx !== -1) {
          const namePart = headerText.slice(0, atIdx).trim();
          if (namePart) quotedName = namePart;
        }
        if (atIdx !== -1 && dashIdx !== -1 && dashIdx > atIdx + 2) {
          relTime = headerText.slice(atIdx + 2, dashIdx).trim();
        }
      }

      if (targetMsg) {
        const targetUserEl = targetMsg.querySelector(".message__user");
        const targetName = targetUserEl?.textContent?.trim();
        if (targetName) quotedName = targetName;
        quotedColor = getUserColor(targetUserEl);
        quotedCreated = targetMsg.getAttribute("data-created");
      } else {
        const nameB = metaI.querySelector("b");
        const colourSource =
          metaI.querySelector('span[style*="color"]') ||
          nameB?.parentElement ||
          nameB;
        quotedColor = getUserColor(colourSource);
      }

      const quotedAuthorId =
        targetMsg?.dataset?.author || quotedAuthorIdFromHref;
      const quotedAvatarVersionLive = targetMsg
        ? extractAvatarVersion(targetMsg)
        : null;
      if (quotedAuthorId) {
        avatarImg.src = getAvatarUrl(
          quotedAuthorId,
          quotedAvatarVersionLive || quotedAvatarVersion,
        );
      }

      if (!relTime && quotedCreated) relTime = getRelativeTime(quotedCreated);

      const body = document.createElement("div");
      body.className = "message__quote-body";

      const header = document.createElement("div");
      header.className = "message__quote-header";
      const showColor = quotedColor || DEFAULT_NAME_COLOR;
      header.innerHTML = `<b style="color:${escapeHtml(showColor)};">${escapeHtml(quotedName)}</b>${
        relTime
          ? ` <span style="color:var(--ultreme-muted);">@ ${escapeHtml(relTime)}</span>`
          : ""
      }`;

      const textDiv = document.createElement("div");
      textDiv.className = "message__quote-text";

      const rawQuoted = getElementTextWithBreaks(qEl);
      const withoutEmbed = rawQuoted.replace(/\[Embed\]/gi, "").trim();

      // This reference is presentation only; outgoing quotes keep their BBCode fallback.
      const compactReference = document.createElement("a");
      compactReference.className = "message__quote-reference";
      compactReference.href = `#${targetId}`;
      compactReference.title = `${quotedName}${relTime ? ` @ ${relTime}` : ""}: ${withoutEmbed}`;
      compactReference.setAttribute("aria-label", `Quoted ${quotedName}: ${withoutEmbed}. Go to original message.`);
      const replyIcon = document.createElement("i");
      replyIcon.className = "fas fa-reply";
      replyIcon.setAttribute("aria-hidden", "true");
      const referenceAuthor = document.createElement("span");
      referenceAuthor.className = "message__quote-reference-author";
      referenceAuthor.textContent = `${quotedName}:`;
      const referenceText = document.createElement("span");
      referenceText.className = "message__quote-reference-text";
      referenceText.textContent = `“${withoutEmbed.replace(/\s+/g, " ")}”`;
      compactReference.append(replyIcon, referenceAuthor, referenceText);
      compactReference.addEventListener("click", (event) => {
        event.preventDefault();
        scrollToMessageId(targetId);
      });

      let lastIndex = 0;
      for (const match of withoutEmbed.matchAll(/(https?:)?\/\/\S+/g)) {
        const urlStart = match.index;

        const before = withoutEmbed.slice(lastIndex, urlStart);
        if (before) textDiv.appendChild(document.createTextNode(before));

        let url = match[0];
        if (!/^https?:\/\//i.test(url)) url = "https:" + url;

        const mediaKind = getMediaKind(url);
        if (mediaKind) {
          textDiv.appendChild(document.createTextNode("("));
          const link = document.createElement("a");
          link.href = url;
          link.textContent = getMediaLabel(mediaKind);
          link.className = "message__quote-media";
          textDiv.appendChild(link);
          textDiv.appendChild(document.createTextNode(") "));
          textDiv.appendChild(createQuoteEmbedToggle(url, mediaKind));
        } else {
          const link = document.createElement("a");
          link.href = url;
          link.textContent = match[0];
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          textDiv.appendChild(link);
        }

        lastIndex = urlStart + match[0].length;
      }

      const tail = withoutEmbed.slice(lastIndex);
      if (tail) textDiv.appendChild(document.createTextNode(tail));

      body.appendChild(header);
      body.appendChild(textDiv);

      quoteContainer.appendChild(avatarImg);
      quoteContainer.appendChild(body);

      const container = msg.querySelector(".message__container");
      const meta = msg.querySelector(".message__meta");

      if (container) {
        container.classList.add("has-inline-quote");

        let bodyWrapper = container.querySelector(".message__body");
        if (!bodyWrapper) {
          bodyWrapper = document.createElement("div");
          bodyWrapper.className = "message__body";

          if (textEl.parentNode === container) {
            container.insertBefore(bodyWrapper, textEl);
            bodyWrapper.appendChild(textEl);
          } else {
            container.appendChild(bodyWrapper);
          }
        }

        if (textEl.parentNode === bodyWrapper)
          bodyWrapper.insertBefore(quoteContainer, textEl);
        else bodyWrapper.insertBefore(quoteContainer, bodyWrapper.firstChild);
        quoteContainer.before(compactReference);
      } else if (meta?.parentNode) {
        meta.parentNode.insertBefore(quoteContainer, meta.nextSibling);
        quoteContainer.before(compactReference);
      }

      quoteContainer.addEventListener("click", (ev) => {
        if (
          ev.target?.closest?.(
            ".message__quote-media, .message__quote-embed-toggle, .message__quote-embed",
          )
        )
          return;
        scrollToMessageId(targetId);
      });
    };

    const setupUserscriptSettingsTab = () => {
      const menusApi = W.Umi?.UI?.Menus;
      if (!menusApi || typeof menusApi.Add !== "function") return;
      if (document.getElementById(`umi-menus-${ULTREME_MENU_ID}`)) return;

      try {
        menusApi.Add(ULTREME_MENU_ID, "Ultreme Script");
      } catch { return; }

      const panel = document.getElementById(`umi-menus-${ULTREME_MENU_ID}`);
      const iconHost = document.getElementById(
        `umi-menu-icons-${ULTREME_MENU_ID}`,
      );
      if (!panel || !iconHost) return;

      if (!iconHost.querySelector(".fa-code")) {
        const i = document.createElement("i");
        i.className = "fas fa-code sidebar-gutter-font-icon";
        iconHost.appendChild(i);
      }

      panel.classList.add(
        "sidebar__menu--settings",
        "sidebar__menu--userscript",
      );

      const createCategory = (titleText) => {
        const wrapper = document.createElement("div");

        const header = document.createElement("div");
        header.className = "setting__category-title";
        header.textContent = titleText;

        const body = document.createElement("div");
        body.className = "setting__category";

        wrapper.append(header, body);
        panel.appendChild(wrapper);

        let open = true;
        let animation = null;
        header.addEventListener("click", () => {
          const startHeight = body.getBoundingClientRect().height;
          animation?.cancel();
          open = !open;
          body.style.overflow = "hidden";
          body.style.height = open ? "auto" : "0px";
          const endHeight = body.getBoundingClientRect().height;
          animation = body.animate([
            { height: `${startHeight}px` }, { height: `${endHeight}px` },
          ], { duration: 260, easing: "cubic-bezier(0.33, 1, 0.68, 1)" });
          animation.onfinish = () => {
            body.style.height = open ? "auto" : "0px";
            body.style.overflow = "";
            animation = null;
          };
        });

        return body;
      };

      const createButtonRow = (body, text, onClick) => {
        const wrap = document.createElement("div");
        wrap.className = "setting__container setting__container--button";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "setting__input";
        btn.textContent = text;
        btn.addEventListener("click", onClick);
        wrap.appendChild(btn);
        body.appendChild(wrap);
        return wrap;
      };

      const settingEffects = {
        "messageButtonContent": applyMessageButtonSettings,
        "messageButtonVisibility": applyMessageButtonSettings,
        "messageButtonAppearance": applyMessageButtonSettings,
        "showQuoteButton": syncMessageActionVisibility,
        "showGotoButton": syncMessageActionVisibility,
        "enableQuoteBlocks": () => {
          document.body.dataset.ultremeQuoteBlocks = settings.enableQuoteBlocks ? "1" : "0";
        },
        "enableDelete": syncMessageActionVisibility,
        "showDeleteButton": syncMessageActionVisibility,
        "enableKonkira": () => {
          if (!settings.enableKonkira) konkiraStates.clear();
        },
        "enableForumButton": syncSidebarActions,
        "enableJumpToBottomButton": syncSidebarActions,
      };

      const controls = [];
      const syncControls = () => {
        for (const { field, row, inputs } of controls) {
          const visible = field.visible?.(settings) ?? true;
          const enabled = visible && (field.enabled?.(settings) ?? true);
          row.hidden = !visible;
          row.classList.toggle("ultreme-setting-disabled", !enabled);
          for (const input of inputs) {
            input.disabled = !enabled;
            if (field.control === "select") {
              input.value = settings[field.key];
              field.options.forEach((option, index) => {
                input.options[index].disabled = !(option.enabled?.(settings) ?? true);
              });
            }
            else input.checked = field.options
              ? input.value === settings[field.key]
              : settings[field.key];
          }
        }
      };

      const sections = new Map();
      for (const section of SETTINGS_SECTIONS) {
        const body = createCategory(section.title);
        body.dataset.settingsSection = section.id;
        sections.set(section.id, body);
        for (const field of section.fields) {
          const isSelect = field.control === "select";
          const isRadio = !!field.options && !isSelect;
          const row = document.createElement(isRadio ? "fieldset" : "div");
          row.className = isRadio ? "ultreme-setting-field" :
            `setting__container setting__container--${isSelect ? "select" : "checkbox"}`;
          row.dataset.setting = field.key;
          body.appendChild(row);
          if (isRadio) {
            const legend = document.createElement("legend");
            legend.className = "ultreme-setting-subtitle";
            legend.textContent = field.label;
            row.appendChild(legend);
          }
          const inputs = [];
          for (const option of (isSelect ? null : field.options) || [{ label: field.label }]) {
            const label = document.createElement("label");
            label.className = "setting__label";
            const input = document.createElement(isSelect ? "select" : "input");
            if (!isSelect) input.type = isRadio ? "radio" : "checkbox";
            input.className = "setting__input " +
              (option.className || ("js-ultreme-" + field.key));
            if (field.options) {
              input.name = STORAGE_PREFIX + field.key;
              if (isRadio) input.value = option.value;
              else for (const choice of field.options) {
                const item = document.createElement("option");
                item.value = choice.value;
                item.textContent = choice.label;
                input.appendChild(item);
              }
            }
            const text = document.createElement("span");
            text.textContent = option.label;
            if (isSelect) label.append(text, input);
            else label.append(input, text);
            if (isRadio) {
              const choice = document.createElement("div");
              choice.className = "setting__container setting__container--checkbox";
              choice.appendChild(label);
              row.appendChild(choice);
            } else row.appendChild(label);
            inputs.push(input);
            input.addEventListener("change", () => {
              if (input.disabled || (isRadio && !input.checked)) return;
              saveSetting(field.key, field.options ? input.value : input.checked);
              if (section.id === "uploads") {
                if (settings.enableUploadProgress) {
                  refreshUploadProgressUI();
                  showUploadProgressPreview();
                } else disableUploadProgressUI();
              } else settingEffects[field.key]?.();
              syncControls();
            });
          }
          if (field.hint) {
            const hint = document.createElement("div");
            hint.className = "setting__hint";
            hint.textContent = field.hint;
            row.appendChild(hint);
          }
          controls.push({ field, row, inputs });
        }
      }
      syncControls();
      const aboutBody = sections.get("about");
      aboutBody.classList.add("ultreme-about");

      const ver = getInstalledVersion() || "unknown";

      const addLine = (text) => {
        const d = document.createElement("div");
        d.className = "mami-copyright";
        d.textContent = text;
        aboutBody.appendChild(d);
        return d;
      };

      addLine("Flashii Ultreme Script");
      addLine(`Version ${ver}`);
      addLine("thank you to all users of flashii <3");

      createButtonRow(aboutBody, "View Project on Patchii", () =>
        W.open(PATCHII_PAGE_URL, "_blank", "noopener,noreferrer"),
      );

      createButtonRow(aboutBody, "Check for updates", () => {
        runManualUpdateCheck(ui);
      });

      const updateStatusEl = addLine("");
      updateStatusEl.id = "ultreme-about-update-status";

      const updateNowRow = createButtonRow(aboutBody, "Update now", () =>
        W.open(PATCHII_USERJS_URL, "_blank", "noopener,noreferrer"),
      );
      updateNowRow.style.display = "none";

      const ui = {
        setStatus: (text) => {
          updateStatusEl.textContent = text || "";
        },
        setUpdateAvailable: (on) => {
          updateNowRow.style.display = on ? "" : "none";
        },
      };
    };

    const processMessage = (msg) => {
      if (processedMessages.has(msg)) return;

      const messageData = buildQuoteDataFromMessageElement(msg);
      if (!messageData) return;
      processedMessages.add(msg);

      const author = msg.dataset.author;

      const textEl = getMessageText(msg);
      if (!textEl) return;

      const sysType = getConnectionNoticeType(msg);
      const connectionKey = `${msg.dataset.channel || ""}:${author}`;

      if (sysType && author) {
        if (settings.enableKonkira) applyKonkira(msg, connectionKey, sysType);
        return;
      } else if (settings.enableKonkira && author) {
        konkiraStates.delete(connectionKey);
      }

      const timeEl = msg.querySelector(".message__time");

      if (timeEl) {
        timeEl.onclick = (e) => {
          if (settings.enableDelete && e.shiftKey && isOwnMessage(msg)) {
            deleteMessage(msg);
            return;
          }
          selectQuoteSource(msg, messageData);
        };
      }

      const context = { msg, data: messageData, quote: getQuoteReference(textEl) };
      if (context.quote.messageId) {
        const meta = textEl.querySelector("i");
        if (meta) meta.onclick = () => scrollToMessageId(context.quote.messageId);
      }
      const btnContainer = document.createElement("div");
      btnContainer.className = "message-button-container";
      btnContainer.setAttribute("role", "group");
      btnContainer.setAttribute("aria-label", "Message actions");
      msg.classList.add("ultreme-has-actions");
      msg.style.position = "relative";
      msg.appendChild(btnContainer);
      for (const action of messageActions) {
        if (action.available && !action.available(context)) continue;
        appendMessageButton(btnContainer, { ...action,
          visible: action.visible(), onClick: () => action.run(context) });
      }

      enhanceScriptQuote(msg, textEl, context.quote);
    };

    injectCSS();
    syncThemeColors();
    // Mami changes body theme classes after loading the selected stylesheet.
    new MutationObserver(syncThemeColors).observe(document.body, {
      attributes: true, attributeFilter: ["class", "style"],
    });
    W.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeColors);
    applyMessageButtonSettings();
    setupUserscriptSettingsTab();
    const touchActions = W.matchMedia("(hover: none)");
    touchActions.addEventListener("change", dismissTouchActions);
    document.addEventListener("scroll", dismissTouchActions, { capture: true, passive: true });
    document.addEventListener("click", (event) => {
      if (!touchActions.matches || settings.messageButtonVisibility !== "hover") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const msg = target.closest("#umi-messages > .message.ultreme-has-actions");
      if (!msg) {
        dismissTouchActions();
        return;
      }
      if (target.closest("a, button, input, textarea, select, label, summary, audio, video, [contenteditable], [role=button], .message__quote, .message__time, .message__user")) {
        dismissTouchActions();
        return;
      }
      if (W.getSelection?.()?.isCollapsed === false) return;
      const wasOpen = revealedActionMessage === msg;
      dismissTouchActions();
      if (!wasOpen) {
        revealedActionMessage = msg;
        msg.classList.add("ultreme-actions-open");
      }
    });
    // Mami emits this after parsing and inserting each message, including backlog.
    W.addEventListener("umi:ui:message_add", (event) => {
      const msg = event.detail?.element;
      if (msg?.parentElement === getMessagesContainer()) processMessage(msg);
    });
    for (const msg of [...getMessagesContainer().children]) {
      if (msg.classList.contains("message")) processMessage(msg);
    }
    syncSidebarActions();

    const form = document.querySelector("form.input");
    const input = getChatInput();

    if (form && input) {
      form.addEventListener(
        "submit",
        () => {
          if (!pendingQuote) return;

          const { name, color, id, authorId, avatarVersion, msg, created } =
            pendingQuote;
          const hidden = "\u200C";
          const cleanMsg = cleanMessage(msg);
          const time = getRelativeTime(created);
          const storedText = smartSlice(cleanMsg, 100, 50, 10);

          const nameColor = color || DEFAULT_NAME_COLOR;
          const quoteHref = authorId
            ? `#${id}:${authorId}${avatarVersion ? `:${avatarVersion}` : ""}`
            : `#${id}`;

          const quoteBlock =
            `[i][color=${nameColor}][b]${name}[/b][/color] ` +
            `[color=var(--theme-colour-message-time-colour)]@ ${time} —[/color][/i]` +
            `[url=${quoteHref}]${hidden}[/url][quote]${storedText}[/quote]`;

          const userText = (input.value || "").replace(/^[ \t]+/, "");
          const full = `${quoteBlock}${userText ? `\n[color=var(--theme-colour-message-time-colour)]└─ [/color]${userText}` : ""}`;

          input.value = full;
          clearPendingQuote();
        },
        true,
      );
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && pendingQuote) {
        e.preventDefault();
        clearPendingQuote();
        return;
      }

      if (!(e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown")))
        return;

      e.preventDefault();
      const messages = getVisibleMessages();
      if (messages.length === 0) return;

      if (e.key === "ArrowUp") {
        if (selectedMessageIndex === -1) selectMessage(messages.length - 1, messages);
        else if (selectedMessageIndex > 0)
          selectMessage(selectedMessageIndex - 1, messages);
      } else {
        if (selectedMessageIndex === -1) return;
        if (selectedMessageIndex < messages.length - 1)
          selectMessage(selectedMessageIndex + 1, messages);
        else selectMessage(-1, messages);
      }
    });
  };

  W.addEventListener("umi:connect", initialize);
  initialize();
})();
