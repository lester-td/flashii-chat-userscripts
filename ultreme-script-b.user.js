// ==UserScript==
// @name         Flashii Chat - Ultreme Script B
// @namespace    https://patchii.net/lester/flashii-chat-userscripts
// @version      6.2.1
// @description  Quality of life features for Flashii chat.
// @author       lester
// @match        *://chat.flashii.net/*
// @inject-into  page
// @run-at       document-idle
// @grant        none
// @downloadURL  https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script-b.user.js
// @updateURL    https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script-b.meta.js
// ==/UserScript==

(() => {
  "use strict";

  const W = window;
  const SCRIPT_VERSION = "6.2";
  const STORAGE_PREFIX = "ultreme_";
  const cssID = "ultreme-style";
  const ULTREME_MENU_ID = "ultreme";
  const DEFAULT_NAME_COLOR = "currentColor";
  const DEFAULT_AVATAR_URL = "https://flashii.net/assets/avatar/";
  const PATCHII_PAGE_URL =
    "https://patchii.net/lester/flashii-chat-userscripts";
  const PATCHII_USERJS_URL =
    "https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script-b.user.js";

  // Define settings, defaults, dependencies, and hint text
  const SETTINGS_SECTIONS = [
    {
      id: "quotes", title: "Quotes", fields: [
        { key: "showQuoteButton", label: "Show Quote button", default: true },
        { key: "showGotoButton", label: "Show Go to quoted button", default: true },
        { key: "enableQuoteBlocks", label: "Render quote blocks", default: true },
        {
          key: "showQuoteAvatars", label: "Show profile pictures in quote blocks", default: true,
          enabled: values => values.enableQuoteBlocks,
        },
        {
          key: "interceptNativeQuoteButton", label: "Use rich partial quotes", default: true,
          hint: "Use the toolbar Quote button to quote selected message text with its author.",
        },
      ],
    },
    {
      id: "messages", title: "Messages", fields: [
        {
          key: "messageListZoom", label: "Message list zoom (%)", default: 100,
          control: "number", min: 50, max: 200, step: 5,
        },
        {
          key: "minimalMode", label: "Minimal mode", default: false,
          hint: "Hover or tap the square to reveal controls. They hide after you stop using them. Quotes and upload cards stay visible.",
        },
        {
          key: "minimalOverlay", label: "Use overlays in minimal mode", default: true,
          enabled: values => values.minimalMode,
          hint: "Reveal controls over the chat without resizing messages or the text field. Turn off to resize the chat when controls appear.",
        },
        {
          key: "minimalHideDelay", label: "Hide controls after (seconds)", default: 1.5,
          control: "number", min: 0.25, max: 2147483.5, step: 0.25,
          enabled: values => values.minimalMode,
        },
        { key: "hideFormattingToolbar", label: "Hide formatting toolbar", default: false },
        {
          key: "enableMessageHistory", label: "Sent message history", default: true,
          hint: "**↑** on the first line recalls older messages.\n**↓** on the last line moves forward and restores your draft.\nHistory lasts until reload.",
        },
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
      id: "navigation", title: "Navigation", fields: [
        { key: "enableForumButton", label: "Show Forum button", default: true },
        { key: "enableJumpToBottomButton", label: "Show Jump to bottom button", default: true },
      ],
    },
    { id: "about", title: "About", fields: [] },
  ];

  // Persist settings with their existing localStorage keys
  const settingFields = SETTINGS_SECTIONS.flatMap(section => section.fields);
  const normalizeNumberSetting = (field, value, fallback = field.default) => {
    if (String(value).trim() === "" || !Number.isFinite(Number(value))) return fallback;
    const clamped = Math.max(field.min, Math.min(field.max, Number(value)));
    return Math.round(clamped / field.step) * field.step;
  };
  const loadSetting = (field) => {
    try {
      const value = localStorage.getItem(STORAGE_PREFIX + field.key);
      if (value === null) return field.default;
      if (typeof field.default === "boolean") return value === "1";
      if (field.control === "number") return normalizeNumberSetting(field, value);
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

  const setBodyFlag = (name, enabled) => {
    document.body.dataset[name] = enabled ? "1" : "0";
  };

  // Track the message action toolbar opened by touch
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

  const applyFormattingToolbarSetting = () => {
    setBodyFlag("ultremeHideFormattingToolbar", settings.hideFormattingToolbar);
  };

  // Define the chat elements that reveal minimal-mode controls
  const MINIMAL_CONTROLS = [
    ".chat-side", ".sidebar", ".sidebar__selector", '[id^="umi-menus-"]',
    "form.input > :not(.input__main)", "form.input .input__main > :not(textarea)",
    ".message-button-container", ".emopick", ".msgbox-container", ".attachview", "#umi-media-modal",
  ].join(", ");
  let minimalHideTimer = null;
  let minimalPointerInControls = false;
  let minimalPointerDown = false;
  let minimalRevealTarget = false;
  let minimalAnimationVersion = 0;
  let minimalAnimations = [];
  let minimalOverlayControls = null;
  let minimalControlHomes = [];
  // Move native controls together while preserving their handlers and original positions.
  const syncMinimalOverlay = () => {
    for (const { element, home } of minimalControlHomes) home.replaceWith(element);
    minimalControlHomes = [];
    minimalOverlayControls?.remove();
    minimalOverlayControls = null;
    setBodyFlag("ultremeMinimalOverlay", settings.minimalMode && settings.minimalOverlay);
    if (!settings.minimalMode || !settings.minimalOverlay) return;
    const input = getChatInput();
    const main = input?.closest(".input__main");
    const form = input?.form;
    if (!main || !form) return;
    const overlay = document.createElement("div");
    overlay.id = "ultreme-minimal-controls";
    const toolbar = document.createElement("div");
    toolbar.className = "input__menu ultreme-minimal-toolbar";
    const actions = document.createElement("div");
    actions.className = "input__main ultreme-minimal-input-actions";
    const move = (element, host) => {
      const home = document.createComment("Minimal control position");
      element.before(home);
      minimalControlHomes.push({ element, home });
      host.appendChild(element);
    };
    const markup = form.querySelector(".markup__buttons");
    if (markup) move(markup, toolbar);
    for (const element of [...main.children])
      if (element.matches("button:not(#ultreme-minimal-reveal)")) move(element, actions);
    overlay.append(toolbar, actions);
    form.appendChild(overlay);
    minimalOverlayControls = overlay;
  };
  const cancelMinimalAnimation = () => {
    ++minimalAnimationVersion;
    for (const animation of minimalAnimations) animation.cancel();
    minimalAnimations = [];
  };

  // Animate the sidebar and composer controls between minimal states
  const transitionMinimalControls = show => {
    if (minimalRevealTarget === show) return;
    minimalRevealTarget = show;
    const input = getChatInput();
    const main = input?.closest(".input__main");
    const form = input?.form;
    const side = document.querySelector(".chat-side") || document.querySelector(".sidebar");
    const overlay = settings.minimalOverlay;
    const roots = [];
    if (side) roots.push({ element: side, axis: "width" });
    if (overlay && minimalOverlayControls)
      for (const element of minimalOverlayControls.children) roots.push({ element, axis: "height" });
    if (!overlay && form) {
      for (const element of form.children) {
        if (element === main || element.id === "quote-preview") continue;
        if (element.querySelector(".toolbar-attachment")) {
          const buttons = element.querySelector(".markup__buttons");
          if (buttons) roots.push({ element: buttons,
            axis: W.getComputedStyle(element).flexDirection === "column" ? "height" : "width" });
        } else roots.push({ element, axis: "height" });
      }
    }
    for (const element of overlay ? [] : main?.children || [])
      if (element !== input && element.id !== "ultreme-minimal-reveal" && !element.hidden)
        roots.push({ element, axis: "width" });
    const before = roots.map(({ element, axis }) => element.getBoundingClientRect()[axis]);
    const beforeStyles = roots.map(({ element }) => element.getClientRects().length
      ? { transform: W.getComputedStyle(element).transform, opacity: W.getComputedStyle(element).opacity }
      : null);
    const chatMain = document.querySelector(".chat-main");
    const beforeMargin = chatMain && W.getComputedStyle(chatMain).marginRight;
    cancelMinimalAnimation();
    const version = minimalAnimationVersion;
    document.body.dataset.ultremeMinimalRevealed = "1";
    document.body.dataset.ultremeMinimalClosing = show ? "0" : "1";
    if (overlay && side) form?.style.setProperty("--ultreme-minimal-sidebar-width", `${side.getBoundingClientRect().width}px`);
    if (W.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.body.dataset.ultremeMinimalRevealed = show ? "1" : "0";
      document.body.dataset.ultremeMinimalClosing = "0";
      return;
    }
    const options = { duration: 500, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" };
    const animate = (element, frames) => {
      const animation = element.animate(frames, options);
      animation.id = "ultreme-minimal-transition";
      minimalAnimations.push(animation);
    };
    roots.forEach(({ element, axis }, index) => {
      if (!element.getClientRects().length) return;
      if (overlay) {
        const hidden = { transform: element === side ? "translateX(12px)" : "translateY(8px)", opacity: 0 };
        animate(element, [beforeStyles[index] || hidden,
          show ? { transform: "none", opacity: 1 } : hidden]);
        return;
      }
      const size = element.getBoundingClientRect()[axis];
      if (!size && !before[index]) return;
      const minimum = axis === "width" ? "minWidth" : "minHeight";
      const maximum = axis === "width" ? "maxWidth" : "maxHeight";
      const frame = (length, opacity) => ({ [axis]: `${length}px`, [maximum]: `${length}px`,
        [minimum]: "0px", flexBasis: `${length}px`, overflow: "clip", opacity });
      animate(element, [frame(before[index], size ? Math.min(1, before[index] / size) : 1), frame(show ? size : 0, show ? 1 : 0)]);
      if (element === side && element.matches(".chat-side") && element.firstElementChild)
        animate(element.firstElementChild, [{ minWidth: `${size}px` }, { minWidth: `${size}px` }]);
    });
    if (!overlay && chatMain) {
      const margin = show ? W.getComputedStyle(chatMain).marginRight : "0px";
      if (beforeMargin !== margin) animate(chatMain, [{ marginRight: beforeMargin }, { marginRight: margin }]);
    }
    Promise.allSettled(minimalAnimations.map(animation => animation.finished)).then(() => {
      if (version !== minimalAnimationVersion) return;
      document.body.dataset.ultremeMinimalRevealed = show ? "1" : "0";
      document.body.dataset.ultremeMinimalClosing = "0";
      cancelMinimalAnimation();
    });
  };
  const isMinimalControl = target => {
    if (!(target instanceof Element)) return false;
    if (target.closest("#quote-preview, .message-button-container")) return false;
    if (target.closest(".toolbar-attachments")) return false;
    const menu = target.closest("form.input > .input__menu");
    if (menu?.querySelector(".toolbar-attachment") && !target.closest(".markup__buttons")) return false;
    return !!target.closest(MINIMAL_CONTROLS);
  };

  // Hide minimal controls after the inactivity delay unless interaction continues
  const scheduleMinimalHide = () => {
    clearTimeout(minimalHideTimer);
    if (!settings.minimalMode || minimalPointerInControls || minimalPointerDown || isMinimalControl(document.activeElement) ||
        document.body.dataset.ultremeMinimalRevealed !== "1") return;
    minimalHideTimer = setTimeout(() => {
      const openDialog = [...document.querySelectorAll(".emopick, .msgbox-container, .attachview, #umi-media-modal")]
        .some(element => element.getClientRects().length && W.getComputedStyle(element).visibility !== "hidden");
      if (openDialog) { scheduleMinimalHide(); return; }
      transitionMinimalControls(false);
      dismissTouchActions();
    }, settings.minimalHideDelay * 1000);
  };
  const revealMinimalControls = () => {
    if (!settings.minimalMode) return;
    clearTimeout(minimalHideTimer);
    transitionMinimalControls(true);
    scheduleMinimalHide();
  };
  const applyMinimalModeSetting = () => {
    clearTimeout(minimalHideTimer);
    cancelMinimalAnimation();
    minimalRevealTarget = false;
    minimalPointerInControls = minimalPointerDown = false;
    if (settings.minimalMode && isMinimalControl(document.activeElement)) getChatInput()?.focus({ preventScroll: true });
    setBodyFlag("ultremeMinimal", settings.minimalMode);
    syncMinimalOverlay();
    document.body.dataset.ultremeMinimalRevealed = "0";
    document.body.dataset.ultremeMinimalClosing = "0";
    dismissTouchActions();
  };
  const applyMinimalOverlaySetting = () => {
    const revealed = minimalRevealTarget;
    cancelMinimalAnimation();
    syncMinimalOverlay();
    document.body.dataset.ultremeMinimalRevealed = revealed ? "1" : "0";
    document.body.dataset.ultremeMinimalClosing = "0";
    scheduleMinimalHide();
  };

  // Bind pointer, focus, resize, and touch events for minimal mode
  const setupMinimalMode = () => {
    const input = getChatInput();
    const main = input?.closest(".input__main");
    if (!main) return;
    const reveal = document.createElement("button");
    reveal.id = "ultreme-minimal-reveal";
    reveal.type = "button";
    reveal.title = "Show chat controls temporarily";
    reveal.setAttribute("aria-label", reveal.title);
    main.appendChild(reveal);
    reveal.addEventListener("click", () => {
      revealMinimalControls();
      if (W.matchMedia("(hover: none)").matches) {
        minimalPointerInControls = false;
        scheduleMinimalHide();
      }
    });
    const positionReveal = () => {
      const field = input.getBoundingClientRect();
      const host = main.getBoundingClientRect();
      reveal.style.right = `${Math.max(0, host.right - field.right) + 4}px`;
      reveal.style.bottom = `${Math.max(0, host.bottom - field.bottom) + 4}px`;
      input.form?.style.setProperty("--ultreme-minimal-input-height", `${field.height}px`);
    };
    const resize = new ResizeObserver(positionReveal);
    resize.observe(input);
    resize.observe(main);
    const side = document.querySelector(".chat-side");
    if (side && input.form) {
      const resizeSidebar = new ResizeObserver(() => {
        input.form.style.setProperty("--ultreme-minimal-sidebar-width", `${side.getBoundingClientRect().width}px`);
      });
      resizeSidebar.observe(side);
    }
    const attachments = input.form?.querySelector(".toolbar-attachments-inner");
    if (attachments) new MutationObserver(() => {
      for (const animation of minimalAnimations) {
        const element = animation.effect?.target;
        if (element?.matches("form.input > .input__menu") && element.querySelector(".toolbar-attachment"))
          animation.cancel();
      }
    }).observe(attachments, { childList: true });
    document.addEventListener("pointerover", event => {
      if (!settings.minimalMode || event.pointerType === "touch") return;
      const wasInControls = minimalPointerInControls;
      minimalPointerInControls = isMinimalControl(event.target);
      if (minimalPointerInControls) revealMinimalControls();
      else if (wasInControls) scheduleMinimalHide();
    });
    document.addEventListener("pointerout", event => {
      if (!settings.minimalMode || event.pointerType === "touch") return;
      const wasInControls = minimalPointerInControls;
      minimalPointerInControls = isMinimalControl(event.relatedTarget);
      if (wasInControls && !minimalPointerInControls) scheduleMinimalHide();
    });
    document.addEventListener("pointerdown", event => {
      if (!settings.minimalMode || !isMinimalControl(event.target)) return;
      minimalPointerDown = true;
      revealMinimalControls();
    }, true);
    const release = () => {
      if (!minimalPointerDown) return;
      minimalPointerDown = false;
      scheduleMinimalHide();
    };
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    document.addEventListener("focusin", event => {
      if (isMinimalControl(event.target)) revealMinimalControls();
      else scheduleMinimalHide();
    });
    document.addEventListener("focusout", () => queueMicrotask(scheduleMinimalHide));
    document.addEventListener("keydown", event => {
      if (isMinimalControl(event.target)) revealMinimalControls();
    });
    W.addEventListener("blur", () => {
      minimalPointerInControls = minimalPointerDown = false;
      scheduleMinimalHide();
    });
    applyMinimalModeSetting();
    positionReveal();
  };

  // Mami theme colours for script UI
  const syncThemeColors = () => {
    const palette = document.getElementById(cssID)?.sheet?.cssRules[0]?.style;
    if (!palette) return;
    const bodyStyle = W.getComputedStyle(document.body);
    const chatInput = getChatInput();
    const background = (element) => {
      if (!element) return null;
      const color = W.getComputedStyle(element).backgroundColor;
      return color === "transparent" || /^rgba\(.+,\s*0\)$/.test(color) || /\/\s*0\)$/.test(color)
        ? null : color;
    };
    const surface = background(getMessagesContainer()) || background(chatInput) || background(document.body) || "Canvas";
    const inputStyle = chatInput ? W.getComputedStyle(chatInput) : bodyStyle;
    const toolbar = document.querySelector("form.input .input__menu:not(#quote-preview)");
    const inputProbe = document.createElement("textarea");
    inputProbe.className = chatInput?.className || "input__text";
    inputProbe.style.cssText = chatInput?.style.cssText || "";
    inputProbe.hidden = true;
    (chatInput?.parentElement || document.body).appendChild(inputProbe);
    const inputBackground = background(inputProbe) || surface;
    inputProbe.remove();
    const dark = bodyStyle.colorScheme === "dark";
    const probe = document.createElement("button");
    probe.type = "button";
    probe.className = "markup__button";
    probe.hidden = true;
    (toolbar || document.body).appendChild(probe);
    const buttonStyle = W.getComputedStyle(probe);
    const buttonBackground = background(probe);
    const buttonText = buttonStyle.color;
    probe.remove();
    const controlHost = document.createElement("div");
    controlHost.className = "setting__container setting__container--text";
    controlHost.hidden = true;
    const controlProbe = document.createElement("input");
    controlProbe.type = "text";
    controlProbe.className = "setting__input";
    controlHost.appendChild(controlProbe);
    document.body.appendChild(controlHost);
    const controlBorder = W.getComputedStyle(controlProbe).borderTopColor;
    controlHost.remove();
    const linkProbe = document.createElement("a");
    linkProbe.href = "https://example.invalid/";
    linkProbe.hidden = true;
    (getMessagesContainer() || document.body).appendChild(linkProbe);
    const linkColor = W.getComputedStyle(linkProbe).color;
    linkProbe.classList.add("visited");
    const visitedLinkColor = W.getComputedStyle(linkProbe).color;
    linkProbe.remove();
    const values = {
      "text": bodyStyle.color,
      "surface": surface,
      "input-background": inputBackground,
      "toolbar-background": background(toolbar) || surface,
      "input-border": inputStyle.borderTopColor || bodyStyle.color,
      "button": buttonBackground || "color-mix(in srgb, var(--ultreme-surface) 85%, var(--ultreme-text))",
      "button-text": buttonText,
      "control-border": controlBorder,
      "link": linkColor,
      "visited-link": visitedLinkColor,
      "accent": bodyStyle.accentColor !== "auto" ? bodyStyle.accentColor : "Highlight",
      "shade": dark ? background(document.body) || surface : bodyStyle.color,
    };
    for (const [key, value] of Object.entries(values))
      palette.setProperty(`--ultreme-native-${key}`, value);
  };

  // Keep temporary quote, selection, and message processing state
  let selectedText = "";
  let selectedQuoteData = null;
  let pendingQuote = null;
  let previewInterval = null;
  let selectedMessageIndex = -1;

  const processedMessages = new WeakSet();
  const konkiraStates = new Map();
  const highlightTimers = new WeakMap();
  const quoteAvatarSources = new WeakMap();
  let mediaModal = null;

  // Match quote avatars to the current display settings
  const syncQuoteAvatar = (quote) => {
    const existing = quote.querySelector(".message__quote-avatar");
    if (!settings.showQuoteAvatars || !settings.enableQuoteBlocks || document.body.classList.contains("compact")) {
      existing?.remove();
      return;
    }
    const src = quoteAvatarSources.get(quote);
    if (existing || !src) return;
    const avatar = document.createElement("img");
    avatar.className = "message__quote-avatar";
    avatar.alt = "";
    avatar.width = avatar.height = 20;
    avatar.loading = "lazy";
    avatar.decoding = "async";
    avatar.src = src;
    quote.prepend(avatar);
  };
  const syncQuoteAvatars = () => document.querySelectorAll(".message__quote").forEach(syncQuoteAvatar);
  const applyQuoteBlockSetting = () => {
    setBodyFlag("ultremeQuoteBlocks", settings.enableQuoteBlocks);
    syncQuoteAvatars();
  };

  // Locate messages, input controls, and quote references
  const getMessagesContainer = () => document.getElementById("umi-messages");
  const getMessagesList = () =>
    getMessagesContainer()?.querySelector(".messages-list") || getMessagesContainer();
  const applyMessageListZoom = () => {
    const container = getMessagesContainer();
    const list = container?.querySelector(".messages-list");
    if (!list) return;
    const zoom = String(settings.messageListZoom / 100);
    if (list.style.zoom === zoom) return;

    // Keep the latest messages in view, or preserve the row being read.
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 2;
    const viewport = container.getBoundingClientRect();
    const anchor = atBottom ? null : [...list.children].find(row => {
      const rect = row.getBoundingClientRect();
      return rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom;
    });
    const top = anchor?.getBoundingClientRect().top;
    list.style.zoom = zoom;
    if (atBottom) container.scrollTop = container.scrollHeight;
    else if (anchor) container.scrollTop += anchor.getBoundingClientRect().top - top;
  };
  const getChatInput = () => document.querySelector("textarea.input__text");
  const getNativeQuoteButton = (target) => {
    const button = target.closest("form.input .markup__button");
    return button && (button.querySelector(".fa-quote-right") ||
      button.title.includes("[quote]") || button.textContent.trim().toLowerCase() === "quote")
      ? button : null;
  };
  const getMessageText = (msg) => msg?.querySelector(".message__text, .message-tiny-text");
  const getUserColor = (element) => {
    const color = element?.style.color;
    return color && color !== "inherit" ? rgbToHex(color) : null;
  };
  const getQuoteReference = (text) => {
    const anchor = text.querySelector('a[href^="#"]');
    return { anchor, ...parseQuoteHref(anchor?.getAttribute("href")) };
  };

  const getVisibleMessages = () => {
    const container = getMessagesList();
    if (!container) return [];
    return [...container.children].filter((msg) =>
      msg.classList.contains("message") &&
      !msg.classList.contains("hidden") &&
      msg.querySelector(".message__user") && getMessageText(msg) &&
      !getConnectionNoticeType(msg),
    );
  };

  const rgbToHex = rgb => {
    if (rgb?.startsWith("#")) return rgb;
    const values = rgb?.match(/\d+/g);
    return values?.length >= 3
      ? `#${values.slice(0, 3).map(value => (+value).toString(16).padStart(2, "0")).join("")}`
      : null;
  };

  // Extract quote content and metadata from a message
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

  // Scroll to a message and briefly highlight its full row
  const scrollToMessageId = (targetId) => {
    if (!targetId) return;
    const target = document.getElementById(`message-${targetId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    let next = target.nextElementSibling;
    while (next && (!next.classList.contains("message") || !next.getClientRects().length))
      next = next.nextElementSibling;
    const gap = next ? Math.max(0, next.getBoundingClientRect().top - target.getBoundingClientRect().bottom) : 0;
    target.style.setProperty("--ultreme-highlight-gap", `${gap}px`);
    clearTimeout(highlightTimers.get(target));
    target.classList.remove("highlight-temp");
    void target.offsetWidth;
    target.classList.add("highlight-temp");
    highlightTimers.set(target, setTimeout(() => {
      target.classList.remove("highlight-temp");
      target.style.removeProperty("--ultreme-highlight-gap");
      highlightTimers.delete(target);
    }, 1500));
  };

  const getConnectionNoticeType = (msg) => {
    if (msg.dataset.tiny !== "1") return null;
    const body = (msg.dataset.body || "").trim();
    if (body === "has joined" || body === "has joined the channel") return "join";
    if (body === "has disconnected" || body === "has left the channel") return "leave";
    return null;
  };

  function scrollMessagesToBottom() {
    const messages = getMessagesContainer();
    if (!messages) return;
    messages.scrollTop = messages.scrollHeight;
    document.getElementById("umi-messages-anchor")?.scrollIntoView({ block: "end" });
  }

  // Sidebar shortcuts
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

  // Shorten quoted text without splitting nearby words
  function smartSlice(text, limit = 100, edge = 50, spill = 10, slice = (start, end) => text.slice(start, end)) {
    const isWhiteSpace = (char) => /\s/.test(char || "");

    const n = text.length;
    if (n <= limit) return slice(0, n);
    if (n <= limit + spill) {
      if (!isWhiteSpace(text[limit]) && !isWhiteSpace(text[limit - 1]))
        return slice(0, n);
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
    while (startEnd > 0 && isWhiteSpace(text[startEnd - 1])) --startEnd;
    const start = slice(0, startEnd);

    let endStart = Math.max(n - edge, 0);
    if (!isWhiteSpace(text[endStart]) && !isWhiteSpace(text[endStart - 1])) {
      const after = text.indexOf(" ", endStart);
      const before = text.lastIndexOf(" ", endStart);
      if (after !== -1) endStart = after + 1;
      else if (before !== -1) endStart = before + 1;
      else endStart = Math.max(n - edge, 0);
    }
    while (endStart < n && isWhiteSpace(text[endStart])) ++endStart;
    const end = slice(endStart, n);

    return `${start} ... ${end}`;
  }

  // Preserve BBCode formatting while shortening quoted content
  const sliceQuote = (text) => {
    const tokens = [];
    const pattern = /\[(img|video|audio|url|code|sjis)(?:=[^\]]*)?\][\s\S]*?\[\/\1\]|\[(\/?)(b|i|u|s|color|bgcolor|spoiler)(?:=[^\]]*)?\]|https?:\/\/[^\s\[]+|[^\[]+?(?=https?:\/\/|\[|$)|\[/gi;
    let plain = "";
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      const tag = match[3]?.toLowerCase();
      const atomic = !!match[1] || /^https?:\/\//i.test(value);
      tokens.push({ value, tag, close: match[2] === "/", atomic,
        start: plain.length, end: plain.length + (tag ? 0 : atomic ? 1 : value.length) });
      if (!tag) plain += atomic ? "\uFFFC" : value;
    }
    return smartSlice(plain, 100, 50, 10, (start, end) => {
      const stack = [];
      let result = "", started = false;
      for (const token of tokens) {
        if (token.start >= end) break;
        if (token.tag) {
          if (token.close) {
            if (stack.at(-1)?.tag !== token.tag) continue;
            stack.pop();
          } else stack.push(token);
          if (started) result += token.value;
        } else if (token.end > start) {
          if (!started) {
            result += stack.map(open => open.value).join("");
            started = true;
          }
          result += token.atomic ? token.value
            : token.value.slice(Math.max(0, start - token.start), end - token.start);
        }
      }
      return result + stack.reverse().map(open => `[/${open.tag}]`).join("");
    });
  };

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
      if (node.nodeType === Node.ELEMENT_NODE && node.matches(".message-embed-metadata")) return;
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
      return `${DEFAULT_AVATAR_URL}${authorId}?res=40&ver=${avatarVersion}`;
    return `${DEFAULT_AVATAR_URL}${authorId}?res=40`;
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

  // Map media extensions to preview elements and labels
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

  const getMediaLabel = kind => MEDIA_TYPES[kind]?.label || "View Media";

  const getMessageMediaKinds = (msg) => {
    const kinds = new Map();
    for (const match of (msg.dataset.body || "").matchAll(/\[(img|video|audio)\]([\s\S]*?)\[\/\1\]/gi)) {
      try {
        kinds.set(new URL(match[2].trim(), W.location.href).href,
          match[1].toLowerCase() === "img" ? "image" : match[1].toLowerCase());
      } catch {}
    }
    return kinds;
  };

  // Map native formatting elements to outgoing BBCode tags
  const INLINE_FORMAT_TAGS = {
    B: "b", STRONG: "b", I: "i", EM: "i", U: "u", S: "s", DEL: "s", CODE: "code",
  };

  const getSelectedQuote = (range, msg) => {
    const text = getMessageText(msg);
    if (!text?.contains(range.commonAncestorContainer)) return null;
    let content = range.cloneContents();
    let ancestor = range.commonAncestorContainer;
    if (ancestor.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentElement;
    while (ancestor && ancestor !== text) {
      const wrapper = ancestor.cloneNode(false);
      wrapper.appendChild(content);
      content = wrapper;
      ancestor = ancestor.parentElement;
    }
    const mediaKinds = getMessageMediaKinds(msg);
    const serialize = (node, rich) => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches('.message-embed-metadata, a[href^="javascript:"]')) return "";
        if (node.nodeName === "BR") return "\n";
        const nativeEmbed = node.matches("span[title]") && node.querySelector('a[href^="javascript:"]');
        if (nativeEmbed) {
          const url = node.title;
          let kind = getMediaKind(url);
          try { kind = mediaKinds.get(new URL(url, W.location.href).href) || kind; } catch {}
          const tag = kind === "image" ? "img" : kind || "url";
          return rich ? `[${tag}]${url}[/${tag}]` : url;
        }
        if (node.nodeName === "IMG") return node.alt || "";
      }
      const body = [...node.childNodes].map(child => serialize(child, rich)).join("");
      if (!rich || node.nodeType !== Node.ELEMENT_NODE) return body;
      const tag = INLINE_FORMAT_TAGS[node.nodeName];
      if (tag) return `[${tag}]${body}[/${tag}]`;
      if (node.nodeName === "A") return `[url=${node.getAttribute("href")}]${body}[/url]`;
      let formatted = body;
      if (node.style.color) formatted = `[color=${node.style.color}]${formatted}[/color]`;
      if (node.style.backgroundColor) formatted = `[bgcolor=${node.style.backgroundColor}]${formatted}[/bgcolor]`;
      return formatted;
    };
    return { plain: serialize(content, false).trim(), rich: serialize(content, true).trim() };
  };

  // Build media elements for inline embeds and viewer
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
      toggle.classList.add("visited");
    });

    wrapper.append(
      document.createTextNode("["),
      toggle,
      document.createTextNode("]"),
      embed,
    );
    return wrapper;
  };

  // Render rich quote contents with clickable media controls
  const createQuoteContent = (source, mediaKinds, { compact = false } = {}) => {
    const fragment = document.createDocumentFragment();
    const mediaLink = (url, kind) => {
      const wrapper = document.createElement("span");
      const link = document.createElement("a");
      link.href = url;
      link.className = "message__quote-media";
      link.dataset.mediaKind = kind;
      link.textContent = getMediaLabel(kind);
      wrapper.append("(", link, ")");
      if (!compact) wrapper.append(" ", createQuoteEmbedToggle(url, kind));
      return wrapper;
    };
    const copy = (node, parent) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue.replace(/\[(?:Embed|Remove)\]/gi, "");
        let offset = 0;
        for (const match of text.matchAll(/(?:https?:)?\/\/[^\s]+/gi)) {
          parent.append(text.slice(offset, match.index));
          let url;
          try { url = new URL(match[0], W.location.href).href; }
          catch { parent.append(match[0]); offset = match.index + match[0].length; continue; }
          const kind = mediaKinds.get(url) || getMediaKind(url);
          if (kind) parent.appendChild(mediaLink(url, kind));
          else {
            const link = document.createElement("a");
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = match[0];
            parent.appendChild(link);
          }
          offset = match.index + match[0].length;
        }
        parent.append(text.slice(offset));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || node.matches(".message-embed-metadata")) return;
      const nativeEmbed = node.matches("span[title]") && [...node.children].some(child =>
        child.matches('a[href^="javascript:"]') && /^(Embed|Remove)$/.test(child.textContent));
      let url = node.matches("a[href]") ? node.href : null;
      if (nativeEmbed) {
        try { url = new URL(node.title, W.location.href).href; } catch {}
      }
      const kind = url && (mediaKinds.get(url) || getMediaKind(url));
      if (kind) {
        parent.appendChild(mediaLink(url, kind));
        return;
      }
      if (nativeEmbed) {
        copy(node.querySelector("a"), parent);
        return;
      }
      if (node.nodeName === "BR") {
        parent.append(compact ? " " : document.createElement("br"));
        return;
      }
      const clone = node.cloneNode(false);
      clone.classList.remove("ultreme-inline-quote");
      for (const attribute of [...clone.attributes])
        if (attribute.name.startsWith("on")) clone.removeAttribute(attribute.name);
      if (node.matches('a[href^="javascript:"]')) {
        clone.href = "#";
        clone.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          node.click();
          const host = clone.parentElement;
          host.replaceChildren();
          for (const child of node.parentElement.childNodes) copy(child, host);
        });
      }
      if (node.nodeName === "A" || node.nodeName === "CODE") clone.append(...[...node.childNodes].map(child => child.cloneNode(true)));
      else for (const child of node.childNodes) copy(child, clone);
      parent.appendChild(clone);
    };
    for (const child of source.childNodes) copy(child, fragment);
    return fragment;
  };

  // Escape user text before inserting preview markup
  const escapeHtml = (text) =>
    String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const buildPreviewMediaLink = (url, explicitKind = null) => {
    const mediaUrl = String(url || "").trim();
    const kind = explicitKind || getMediaKind(mediaUrl);
    return `(<a href="${escapeHtml(mediaUrl)}" data-media-kind="${escapeHtml(kind || "")}" class="ultreme-preview-media">${getMediaLabel(kind)}</a>)`;
  };

  // Convert quoted BBCode to safe preview HTML
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
      stash(`<code class="code">${escapeHtml(code)}</code>`),
    );
    text = text.replace(/\[sjis\]([\s\S]*?)\[\/sjis\]/gi, (_, art) =>
      stash(`<span class="sjis">${escapeHtml(art)}</span>`),
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
    text = text.replace(/\[(color|bgcolor)=([^\]]+)\]/gi, (_, tag, color) => {
      const value = String(color || "").trim();
      if (W.CSS.supports("color", value)) {
        return `<span style="${tag.toLowerCase() === "bgcolor" ? "background-color" : "color"}:${value};">`;
      }
      return "<span>";
    });
    text = text.replace(/\[\/(?:color|bgcolor)\]/gi, "</span>");

    text = text.replace(/\[(?:\/)?[a-z]+(?:=[^\]]+)?\]/gi, "");

    text = text.replace(
      /\uE000(\d+)\uE001/g,
      (_, idx) => placeholders[Number(idx)] || "",
    );

    return text;
  };

  // Clear media playback and download links when the viewer closes
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
            <div class="umi-media-modal-title">Ultreme Script B Media Viewer</div>
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

  function openMediaModal(url, explicitKind = null) {
    ensureMediaModal();
    const content = mediaModal.querySelector(".umi-media-modal-content");
    const downloadLink = mediaModal.querySelector(".umi-media-modal-download");
    if (!content) return;

    content.replaceChildren();
    if (downloadLink) {
      downloadLink.href = url;
      downloadLink.setAttribute("download", "");
    }

    const mediaKind = MEDIA_TYPES[explicitKind] ? explicitKind : getMediaKind(url);

    if (!mediaKind) {
      W.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    content.appendChild(createMediaElement(url, mediaKind, { modal: true }));
    mediaModal.style.display = "flex";
    revealMinimalControls();
  }

  // Insert the quote preview above the message composer
  const insertBanner = (el) => {
    const form = document.querySelector("form.input");
    const main = form?.querySelector(".input__main");
    if (!form || !main) return;

    const quotePreview = document.getElementById("quote-preview");
    if (quotePreview && quotePreview.parentElement === form)
      form.insertBefore(el, quotePreview);
    else form.insertBefore(el, main);
  };

  let initialized = false;

  // Install chat hooks once Mami has initialized its user and input
  const initialize = () => {
    if (initialized || !W.Umi?.User?.getCurrentUser?.()?.id ||
        !getMessagesContainer() || !getChatInput()) return;
    initialized = true;

    const messageHistory = [];
    let messageHistoryIndex = 0;
    let messageHistoryDraft = null;
    const resetMessageHistoryNavigation = () => {
      messageHistoryIndex = messageHistory.length;
      messageHistoryDraft = null;
    };

    const isOwnMessage = (msg) =>
      msg.dataset.author === W.Umi?.User?.getCurrentUser?.()?.id;
    const deleteMessage = (msg) => {
      if (settings.enableDelete && isOwnMessage(msg))
        W.Umi.Server.sendMessage(`/delete ${msg.dataset.id}`);
    };

    applyQuoteBlockSetting();

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

    // Combine consecutive join and leave notices for each user
    const applyKonkira = (msg, userId, type) => {
      const previous = konkiraStates.get(userId);
      if (previous?.el.isConnected && previous.el.dataset.created > msg.dataset.created) return;

      const continuing = previous?.el.isConnected && previous.el.dataset.created <= msg.dataset.created;
      const count = continuing ? previous.cnt + 1 : 1;
      if (continuing) {
        previous.el.remove();
        msg.classList.add("konkira-summary");
        msg.setAttribute("konkira-count", count);
        const text = getMessageText(msg);
        if (text) {
          if (count === 2 && previous.start_t === "join" && type === "leave")
            text.innerHTML = "&nbsp;lurked";
          else if (count === 2 && previous.start_t === "leave" && type === "join")
            text.innerHTML = "&nbsp;rejoined";
          else text.innerHTML = `&nbsp;is jittery<span class="connection-badge">x${count}</span>`;
        }
      }

      konkiraStates.set(userId, {
        cnt: count,
        el: msg,
        start_t: continuing ? previous.start_t : type,
      });
    };

    // Add theme-aware styles for quotes, controls, and settings
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
          --ultreme-outline: var(--theme-colour-settings-input-border, var(--ultreme-native-control-border, var(--ultreme-border)));
          --ultreme-muted: var(--theme-colour-message-time-colour, color-mix(in srgb, var(--ultreme-text) 65%, var(--ultreme-surface)));
          --ultreme-shade: var(--ultreme-native-shade, CanvasText);
          --ultreme-shadow: color-mix(in srgb, var(--ultreme-shade) 45%, transparent);
        }
        #umi-menus-ultreme,
        #quote-preview,
        #umi-media-modal,
        .message-button-container,
        .message__quote {
          font-family: inherit;
          color: var(--ultreme-text);
        }
        #umi-menus-ultreme input,
        #umi-menus-ultreme select,
        #umi-menus-ultreme button,
        #quote-preview button,
        .message-button-container button {
          font-family: inherit;
        }
        .message__text {
          --theme-colour-message-time-colour: var(--ultreme-muted);
        }
        body[data-ultreme-hide-formatting-toolbar="1"] form.input .markup__buttons,
        body[data-ultreme-hide-formatting-toolbar="1"] form.input > .input__menu:has(> .markup__buttons):not(:has(.toolbar-attachment)) {
          display: none;
        }
        #ultreme-minimal-reveal {
          display: none;
          position: absolute;
          z-index: 2;
          width: 14px;
          height: 14px;
          padding: 0;
          border: 1px solid var(--ultreme-outline);
          border-radius: 0;
          background: var(--ultreme-button);
          opacity: 0.55;
          cursor: pointer;
        }
        #ultreme-minimal-reveal:hover,
        #ultreme-minimal-reveal:focus-visible {
          opacity: 1;
          outline: 1px solid var(--ultreme-accent);
        }
        body[data-ultreme-minimal="1"][data-ultreme-minimal-revealed="0"] #ultreme-minimal-reveal {
          display: block;
        }
        body[data-ultreme-minimal="1"] form.input .input__main {
          position: relative;
        }
        body[data-ultreme-minimal="1"] textarea.input__text {
          padding-inline-end: 22px;
        }
        body[data-ultreme-minimal="1"][data-ultreme-minimal-revealed="0"] :is(
          .chat-side, .sidebar, .sidebar__selector, [id^="umi-menus-"],
          form.input > :not(.input__main):not(#quote-preview):not(.input__menu:has(.toolbar-attachment)),
          form.input .markup__buttons,
          form.input .input__main > :not(textarea):not(#ultreme-minimal-reveal)
        ) {
          display: none !important;
        }
        body[data-ultreme-minimal="1"][data-ultreme-minimal-revealed="0"] .chat-main {
          margin-right: 0;
        }
        body[data-ultreme-minimal="1"][data-ultreme-minimal-revealed="0"] textarea.input__text {
          border-right-width: 1px;
        }
        body[data-ultreme-minimal-overlay="1"] .chat {
          overflow: hidden;
        }
        body[data-ultreme-minimal-overlay="1"] .chat-main {
          margin-right: 0;
        }
        body[data-ultreme-minimal-overlay="1"] .chat-side {
          position: absolute;
          top: max(4px, env(safe-area-inset-top));
          right: max(4px, env(safe-area-inset-right));
          bottom: max(4px, env(safe-area-inset-bottom));
          max-width: min(260px, calc(100% - 8px));
          z-index: 20;
        }
        body[data-ultreme-minimal-overlay="1"] textarea.input__text {
          border-right-width: 1px;
        }
        body[data-ultreme-minimal-overlay="1"] form.input > .input__menu:not(#quote-preview):not(:has(.toolbar-attachment)) {
          display: none !important;
        }
        #ultreme-minimal-controls {
          display: contents;
        }
        #ultreme-minimal-controls > .ultreme-minimal-toolbar {
          position: absolute;
          left: 0;
          right: calc(var(--ultreme-minimal-sidebar-width, 0px) + 4px);
          bottom: 100%;
          z-index: 21;
        }
        body[data-ultreme-minimal-overlay="1"] form.input .input__main.ultreme-minimal-input-actions {
          position: absolute;
          right: calc(var(--ultreme-minimal-sidebar-width, 0px) + 4px);
          bottom: 0;
          height: var(--ultreme-minimal-input-height, 48px);
          z-index: 21;
        }
        .message.ultreme-has-actions {
          flex-wrap: wrap;
        }
        .message.ultreme-has-actions .message__container {
          flex: 1 1 min(12em, calc(100% - 3.5em));
          min-width: min(12em, calc(100% - 3.5em));
        }
        body.compact #umi-messages .message:not(.message-tiny) > .message__container:not(.has-inline-quote) {
          display: flex;
        }
        body.compact #umi-messages .message:not(.message-tiny) > .message__container:not(.has-inline-quote) > .message__text {
          min-width: 0;
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
          flex: 0 0 auto;
          width: auto;
          height: auto;
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
        body.compact .message .message-button-container button {
          min-height: 1.3125em;
          padding-block: 0;
          font-size: inherit;
          line-height: 1;
        }
        body[data-ultreme-button-appearance="outlined"] .message-button-container button {
          background-clip: border-box;
          border: 1px solid color-mix(in srgb, var(--ultreme-outline) 60%, var(--ultreme-button-text));
        }
        body.theme-archaic[data-ultreme-button-appearance="outlined"] .message-button-container button {
          border-radius: 0;
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
        #quote-preview {
          background: color-mix(in srgb, var(--ultreme-native-toolbar-background, var(--ultreme-surface)) 50%, var(--ultreme-native-input-background, var(--ultreme-surface)));
          display: flex;
          flex-direction: row;
          align-items: center;
          min-width: 0;
          max-width: 100%;
          margin: 0;
          padding: 2px;
          border: 0 solid var(--ultreme-native-input-border, var(--ultreme-border));
          border-inline-width: 1px;
        }
        #quote-preview > span {
          flex: 1 1 auto;
          min-width: 0;
          padding-inline: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: normal;
        }
        #quote-preview code {
          font-size: 12px;
          padding: 1px 4px;
          border-radius: 2px;
          background: var(--ultreme-button);
        }
        #quote-preview .ultreme-preview-media {
          color: var(--ultreme-native-link, LinkText);
        }
        body:not(.no-visited) #quote-preview .ultreme-preview-media.visited,
        body:not(.no-visited) #quote-preview .ultreme-preview-media:visited {
          color: var(--ultreme-native-visited-link, VisitedText);
        }
        #quote-preview .ultreme-preview-spoiler {
          padding: 0 4px;
          border-radius: 2px;
          background: var(--ultreme-button);
          color: var(--ultreme-text);
          filter: brightness(0.8);
        }
        #cancel-quote {
          flex: 0 0 auto;
          margin-left: 6px;
          align-self: center;
          cursor: pointer;
        }
        #cancel-quote:focus-visible {
          outline: 1px solid var(--ultreme-accent);
          outline-offset: 1px;
        }
        .message.highlight-temp {
          position: relative;
        }
        .message.highlight-temp::before {
          content: "";
          position: absolute;
          inset: 0;
          bottom: calc(-1 * var(--ultreme-highlight-gap, 0px));
          pointer-events: none;
          background: color-mix(in srgb, var(--ultreme-accent) 65%, var(--ultreme-text));
          opacity: 0;
          animation: ultreme-message-flash 750ms ease-in-out 2;
        }
        @keyframes ultreme-message-flash {
          0%, 100% { opacity: 0; }
          50% { opacity: 0.3; }
        }
        @media (prefers-reduced-motion: reduce) {
          .message.highlight-temp::before {
            animation: none;
            opacity: 0.2;
          }
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
          --ultreme-quote-tint: var(--theme-colour-main-colour, currentColor);
          margin-top: 2px;
          margin-bottom: 2px;
          padding: 4px 8px;
          font-size: 12px;
          border-radius: 3px;
          border: 0 solid var(--ultreme-outline);
          border-left-width: 5px;
          border-left-color: color-mix(in srgb, var(--ultreme-accent) 65%, var(--ultreme-text));
          background: color-mix(in srgb, var(--ultreme-quote-tint) 8%, transparent);
          cursor: pointer;
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
        body.theme-archaic .message__quote {
          border-width: 1px;
          border-color: var(--ultreme-outline);
          border-radius: 0;
          background: var(--ultreme-surface);
        }
        body.theme-archaic .message__quote:hover {
          border-color: var(--ultreme-text);
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
        .message__quote-reply {
          margin-right: 0.4em;
          color: var(--ultreme-muted);
        }
        .message__quote-avatar + .message__quote-body .message__quote-reply {
          display: none;
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
        .message__quote-reference-wrap,
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
        body.compact[data-ultreme-quote-blocks="1"] #umi-messages .message__quote-reference-wrap {
          display: inline-flex !important;
          flex-wrap: wrap;
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
        body.compact[data-ultreme-quote-blocks="1"] #umi-messages .message__quote-reference {
          display: inline-flex;
          align-items: center;
          gap: 0.3em;
          min-width: 0;
          max-width: 100%;
          color: inherit;
          text-decoration: none;
        }
        .message__quote-compact-media {
          white-space: nowrap;
        }
        .message__quote-reference-text:empty {
          display: none;
        }
        .message__quote-reference i {
          flex: 0 0 auto;
        }
        .message__quote-reference-author {
          flex: 0 1 auto;
          min-width: 0;
          overflow-wrap: anywhere;
          font-weight: 500;
        }
        .message__quote-reference-text {
          display: inline-flex;
          flex: 1 1 auto;
          min-width: 0;
          max-width: min(25vw, 28ch);
          white-space: nowrap;
          word-break: normal;
        }
        .message__quote-reference-content {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .message__quote-reference-text--media {
          display: inline;
          max-width: min(50vw, 60ch);
          white-space: normal;
          overflow: visible;
          overflow-wrap: anywhere;
          line-height: 1.2;
          cursor: pointer;
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
          .message__quote-reference-text--media {
            max-width: 100%;
          }
          body.compact #umi-messages .message__container.has-inline-quote {
            grid-template-columns: max-content minmax(0, 1fr);
          }
          body.compact #umi-messages .message__container.has-inline-quote .message__meta {
            grid-row: 2;
          }
          body.compact[data-ultreme-quote-blocks="1"] #umi-messages .message__quote-reference-wrap {
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
        #umi-menus-ultreme .ultreme-setting-heading {
          display: flex;
          align-items: baseline;
          gap: 0.3em;
        }
        #umi-menus-ultreme .ultreme-setting-heading .setting__label {
          min-width: 0;
        }
        #umi-menus-ultreme .ultreme-setting-info {
          display: inline-flex;
          position: relative;
          top: -0.25em;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--ultreme-muted);
          font-size: 11px;
          line-height: 1;
          text-decoration: underline dotted;
          text-underline-offset: 0.15em;
          cursor: pointer;
          pointer-events: auto;
        }
        #umi-menus-ultreme .ultreme-setting-info:hover,
        #umi-menus-ultreme .ultreme-setting-info[aria-expanded="true"] {
          color: var(--ultreme-text);
        }
        #umi-menus-ultreme .ultreme-setting-info:focus-visible {
          outline: 1px solid var(--ultreme-accent);
          outline-offset: 1px;
        }
        #umi-menus-ultreme .setting__hint {
          margin: 4px 0;
          font-size: 12px;
          color: var(--ultreme-muted);
        }
        .ultreme-setting-disabled {
          opacity: 0.55;
          pointer-events: none;
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

    // Display the selected quote above the message composer
    const showQuotePreview = ({ name, msg, color, created }) => {
      clearInterval(previewInterval);

      let preview = document.getElementById("quote-preview");
      if (!preview) {
        preview = document.createElement("div");
        preview.id = "quote-preview";
        preview.className = "input__menu";

        const span = document.createElement("span");
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.id = "cancel-quote";
        cancel.className = "markup__button";
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

    // Capture selected message text for partial quoting
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

      const sourceMessage = element.closest(".message");
      const selection = sourceMessage ? getSelectedQuote(range, sourceMessage) : null;
      selectedText = selection?.plain ?? sel.toString().trim();
      selectedQuoteData =
        selectedText && sourceMessage
          ? buildQuoteDataFromMessageElement(sourceMessage, selection?.rich ?? selectedText)
          : null;
    });

    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || !(t instanceof Element)) return;

      const previewMediaLink = t.closest(".ultreme-preview-media, .message__quote-media, .message__quote-compact-media");
      if (previewMediaLink instanceof HTMLAnchorElement) {
        e.preventDefault();
        openMediaModal(previewMediaLink.href, previewMediaLink.dataset.mediaKind);
        previewMediaLink.classList.add("visited");
        return;
      }

      if (
        !settings.interceptNativeQuoteButton && getNativeQuoteButton(t)
      ) {
        setTimeout(() => {
          const input = getChatInput();
          if (input && selectedText) {
            const quoted = `[quote]${selectedText}[/quote]`;
            const start = input.selectionStart;
            const end = input.selectionEnd;
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
        if (!getNativeQuoteButton(t)) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        applyQuote(selectedQuoteData);
      },
      true,
    );

    // Declare message actions once for creation and visibility updates
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

    // Replace script-generated quote markup with a compact and expanded view
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
      const nativeAvatar = targetMsg?.querySelector(".message__avatar img");
      quoteAvatarSources.set(quoteContainer, nativeAvatar?.currentSrc || nativeAvatar?.src ||
        getAvatarUrl(quotedAuthorId, quotedAvatarVersion));

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

      const mediaKinds = getMessageMediaKinds(msg);
      textDiv.appendChild(createQuoteContent(qEl, mediaKinds));
      const summary = textDiv.cloneNode(true);
      summary.querySelectorAll(".message__quote-embed-wrap").forEach(node => node.remove());
      const withoutEmbed = getElementTextWithBreaks(summary);
      const compactWrap = document.createElement("span");
      compactWrap.className = "message__quote-reference-wrap";

      const compactReference = document.createElement("a");
      compactReference.className = "message__quote-reference";
      compactReference.href = `#${targetId}`;
      compactReference.title = `${quotedName}${relTime ? ` @ ${relTime}` : ""}: ${withoutEmbed}`;
      compactReference.setAttribute("aria-label", `Quoted ${quotedName}: ${withoutEmbed}. Go to original message.`);
      const replyIcon = document.createElement("i");
      replyIcon.className = "fas fa-reply";
      replyIcon.setAttribute("aria-hidden", "true");
      const headerIcon = replyIcon.cloneNode();
      headerIcon.classList.add("message__quote-reply");
      header.prepend(headerIcon);
      const referenceAuthor = document.createElement("span");
      referenceAuthor.className = "message__quote-reference-author";
      referenceAuthor.textContent = `${quotedName}:`;
      const referenceText = document.createElement("span");
      referenceText.className = "message__quote-reference-text";
      const snippet = document.createElement("span");
      snippet.appendChild(createQuoteContent(qEl, mediaKinds, { compact: true }));
      let hasMedia = false;
      for (const link of [...snippet.querySelectorAll("a")]) {
        if (link.matches(".message__quote-media")) {
          link.className = "message__quote-compact-media";
          hasMedia = true;
        } else link.replaceWith(...link.childNodes);
      }
      if (snippet.textContent.trim()) {
        // Keep punctuation outside the clipped excerpt so ellipsis retains both quotes.
        snippet.className = "message__quote-reference-content";
        referenceText.append("“", ...(hasMedia ? snippet.childNodes : [snippet]), "”");
      }
      compactWrap.appendChild(compactReference);
      compactReference.append(replyIcon, referenceAuthor);
      if (hasMedia) {
        referenceText.classList.add("message__quote-reference-text--media");
        referenceText.title = compactReference.title;
        compactWrap.appendChild(referenceText);
        referenceText.addEventListener("click", event => {
          if (event.target.closest("a")) return;
          scrollToMessageId(targetId);
        });
      } else compactReference.appendChild(referenceText);
      compactReference.addEventListener("click", (event) => {
        event.preventDefault();
        scrollToMessageId(targetId);
      });

      body.appendChild(header);
      body.appendChild(textDiv);

      quoteContainer.appendChild(body);
      syncQuoteAvatar(quoteContainer);

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
        quoteContainer.before(compactWrap);
      } else if (meta?.parentNode) {
        meta.parentNode.insertBefore(quoteContainer, meta.nextSibling);
        quoteContainer.before(compactWrap);
      }

      quoteContainer.addEventListener("click", (ev) => {
        if (
          ev.target?.closest?.(
            "a, .message__quote-embed",
          )
        )
          return;
        scrollToMessageId(targetId);
      });
    };

    // Build the Ultreme Script B settings panel inside Mami
    const setupUserscriptSettingsTab = () => {
      const menusApi = W.Umi?.UI?.Menus;
      if (!menusApi || typeof menusApi.Add !== "function") return;
      if (document.getElementById(`umi-menus-${ULTREME_MENU_ID}`)) return;

      try {
        menusApi.Add(ULTREME_MENU_ID, "Ultreme Script B");
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
        "messageListZoom": applyMessageListZoom,
        "minimalMode": applyMinimalModeSetting,
        "minimalOverlay": applyMinimalOverlaySetting,
        "minimalHideDelay": scheduleMinimalHide,
        "hideFormattingToolbar": applyFormattingToolbarSetting,
        "enableMessageHistory": resetMessageHistoryNavigation,
        "messageButtonContent": applyMessageButtonSettings,
        "messageButtonVisibility": applyMessageButtonSettings,
        "messageButtonAppearance": applyMessageButtonSettings,
        "showQuoteButton": syncMessageActionVisibility,
        "showGotoButton": syncMessageActionVisibility,
        "enableQuoteBlocks": applyQuoteBlockSetting,
        "showQuoteAvatars": syncQuoteAvatars,
        "enableDelete": syncMessageActionVisibility,
        "showDeleteButton": syncMessageActionVisibility,
        "enableKonkira": () => {
          if (!settings.enableKonkira) konkiraStates.clear();
        },
        "enableForumButton": syncSidebarActions,
        "enableJumpToBottomButton": syncSidebarActions,
      };

      let openHint = null;
      const closeHint = () => {
        if (!openHint) return;
        openHint.hint.hidden = true;
        openHint.button.setAttribute("aria-expanded", "false");
        openHint = null;
      };

      // Dismiss open hints when Mami changes panels or hides minimal controls
      const panelWrapper = panel.closest(".sidebar__menu");
      const menuFrame = panel.closest(".sidebar__menus");
      const closeHiddenHint = () => {
        const sidebarClosed = menuFrame?.classList.contains("js-menu-closed");
        const panelInactive = panelWrapper?.classList.contains("hidden");
        const minimalHidden = document.body.dataset.ultremeMinimal === "1" &&
          (document.body.dataset.ultremeMinimalRevealed !== "1" ||
            document.body.dataset.ultremeMinimalClosing === "1");
        if (sidebarClosed || panelInactive || minimalHidden) closeHint();
      };
      const hintObserver = new MutationObserver(closeHiddenHint);
      if (panelWrapper) hintObserver.observe(panelWrapper, {
        attributes: true, attributeFilter: ["class"],
      });
      if (menuFrame) hintObserver.observe(menuFrame, {
        attributes: true, attributeFilter: ["class"],
      });
      hintObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-ultreme-minimal", "data-ultreme-minimal-revealed", "data-ultreme-minimal-closing"],
      });

      panel.addEventListener("keydown", event => {
        if (event.key !== "Escape" || !openHint) return;
        const button = openHint.button;
        closeHint();
        button.focus();
        event.preventDefault();
        event.stopPropagation();
      });

      // Keep dependent inputs and selects synchronized with saved settings
      const controls = [];
      const syncControls = () => {
        for (const { field, row, input } of controls) {
          const enabled = field.enabled?.(settings) ?? true;
          row.classList.toggle("ultreme-setting-disabled", !enabled);
          input.disabled = !enabled;
          if (field.control === "number") input.value = settings[field.key];
          else if (field.control === "select") {
            input.value = settings[field.key];
            field.options.forEach((option, index) => {
              input.options[index].disabled = !(option.enabled?.(settings) ?? true);
            });
          } else input.checked = settings[field.key];
        }
      };

      const sections = new Map();
      for (const section of SETTINGS_SECTIONS) {
        const body = createCategory(section.title);
        body.dataset.settingsSection = section.id;
        sections.set(section.id, body);
        for (const field of section.fields) {
          const isSelect = field.control === "select";
          const isNumber = field.control === "number";
          const row = document.createElement("div");
          row.className = `setting__container setting__container--${field.control || "checkbox"}`;
          row.dataset.setting = field.key;
          body.appendChild(row);
          const label = document.createElement("label");
          label.className = "setting__label";
          const input = document.createElement(isSelect ? "select" : "input");
          if (!isSelect) input.type = isNumber ? "number" : "checkbox";
          if (isNumber) {
            input.min = field.min;
            input.max = field.max;
            input.step = field.step;
          }
          input.id = `ultreme-setting-${field.key}`;
          label.htmlFor = input.id;
          input.className = `setting__input js-ultreme-${field.key}`;
          if (isSelect) {
            input.name = STORAGE_PREFIX + field.key;
            for (const choice of field.options) {
              const item = document.createElement("option");
              item.value = choice.value;
              item.textContent = choice.label;
              input.appendChild(item);
            }
          }
          const text = document.createElement("span");
          text.textContent = field.label;
          if (isSelect || isNumber) label.appendChild(text);
          else label.append(input, text);
          const heading = document.createElement("div");
          heading.className = "ultreme-setting-heading";
          heading.appendChild(label);
          row.appendChild(heading);
          if (isSelect || isNumber) row.appendChild(input);
          input.addEventListener("change", () => {
            if (input.disabled) return;
            saveSetting(field.key, isNumber
              ? normalizeNumberSetting(field, input.value, settings[field.key])
              : isSelect ? input.value : input.checked);
            settingEffects[field.key]?.();
            syncControls();
          });
          if (field.hint) {
            const info = document.createElement("button");
            info.type = "button";
            info.className = "ultreme-setting-info";
            info.setAttribute("aria-label", `More information about ${field.label}`);
            info.setAttribute("aria-expanded", "false");
            info.textContent = "?";
            heading.appendChild(info);
            const hint = document.createElement("div");
            hint.className = "setting__hint";
            hint.id = `ultreme-hint-${field.key}`;
            hint.hidden = true;
            info.setAttribute("aria-controls", hint.id);
            input.setAttribute("aria-describedby", hint.id);
            hint.innerHTML = escapeHtml(field.hint)
              .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
            row.appendChild(hint);
            info.addEventListener("click", () => {
              const opening = hint.hidden;
              closeHint();
              if (!opening) return;
              hint.hidden = false;
              info.setAttribute("aria-expanded", "true");
              openHint = { hint, button: info };
            });
          }
          controls.push({ field, row, input });
        }
      }
      syncControls();
      const aboutBody = sections.get("about");
      aboutBody.classList.add("ultreme-about");

      const addLine = (text) => {
        const d = document.createElement("div");
        d.className = "mami-copyright";
        d.textContent = text;
        aboutBody.appendChild(d);
        return d;
      };

      addLine("Flashii Ultreme Script B");
      addLine(`Version ${SCRIPT_VERSION}`);
      addLine("thank you to all users of flashii <3");

      createButtonRow(aboutBody, "View Project on Patchii", () =>
        W.open(PATCHII_PAGE_URL, "_blank", "noopener,noreferrer"),
      );

      addLine("Manage updates in your userscript extension.");
      createButtonRow(aboutBody, "Download Ultreme Script B", () =>
        W.open(PATCHII_USERJS_URL, "_blank", "noopener,noreferrer"),
      );
    };

    // Add message actions, quoting, deletion, and connection summaries
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

    // Initialize styles, settings, message hooks, and touch actions
    injectCSS();
    syncThemeColors();
    new MutationObserver(() => {
      syncThemeColors();
      syncQuoteAvatars();
    }).observe(document.body, {
      attributes: true, attributeFilter: ["class", "style"],
    });
    W.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeColors);
    applyMessageButtonSettings();
    applyFormattingToolbarSetting();
    applyMessageListZoom();
    setupUserscriptSettingsTab();
    setupMinimalMode();
    const touchActions = W.matchMedia("(hover: none)");
    touchActions.addEventListener("change", dismissTouchActions);
    document.addEventListener("scroll", dismissTouchActions, { capture: true, passive: true });
    document.addEventListener("click", (event) => {
      if (!touchActions.matches || settings.messageButtonVisibility !== "hover") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const msg = target.closest("#umi-messages .message.ultreme-has-actions");
      if (!msg) {
        dismissTouchActions();
        return;
      }
      if (target.closest("a, button, input, textarea, select, label, summary, audio, video, [contenteditable], [role=button], .message__quote, .message__quote-reference-wrap, .message__time, .message__user")) {
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
    W.addEventListener("umi:ui:message_add", (event) => {
      const msg = event.detail?.element;
      if (msg?.parentElement === getMessagesList()) processMessage(msg);
    });
    for (const msg of [...getMessagesList().children]) {
      if (msg.classList.contains("message")) processMessage(msg);
    }
    syncSidebarActions();

    const form = document.querySelector("form.input");
    const input = getChatInput();

    // Save submitted messages and restore them with arrow-key history
    if (form && input) {
      form.addEventListener(
        "submit",
        () => {
          if (pendingQuote) {
            const { name, color, id, authorId, avatarVersion, msg, created } =
              pendingQuote;
            const hidden = "\u200C";
            const cleanMsg = cleanMessage(msg);
            const time = getRelativeTime(created);
            const storedText = sliceQuote(cleanMsg);

            const nameColor = color || DEFAULT_NAME_COLOR;
            const quoteHref = authorId
              ? `#${id}:${authorId}${avatarVersion ? `:${avatarVersion}` : ""}`
              : `#${id}`;

            const quoteBlock =
              `[i][color=${nameColor}][b]${name}[/b][/color] ` +
              `[color=var(--theme-colour-message-time-colour)]@ ${time} —[/color][/i]` +
              `[url=${quoteHref}]${hidden}[/url][quote]${storedText}[/quote]`;

            const userText = (input.value || "").replace(/^[ \t]+/, "");
            input.value = `${quoteBlock}${userText ? `\n[color=var(--theme-colour-message-time-colour)]└─ [/color]${userText}` : ""}`;
            clearPendingQuote();
          }

          if (settings.enableMessageHistory && input.value.trim()) messageHistory.push(input.value);
          resetMessageHistoryNavigation();
        },
        true,
      );

      input.addEventListener("keydown", event => {
        if (!settings.enableMessageHistory || event.defaultPrevented || event.isComposing ||
            event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
            !["ArrowUp", "ArrowDown"].includes(event.key) || !messageHistory.length ||
            input.selectionStart !== input.selectionEnd) return;

        const up = event.key === "ArrowUp";
        const caret = input.selectionStart;
        if (up ? input.value.slice(0, caret).includes("\n") : input.value.slice(caret).includes("\n")) return;
        if (up ? messageHistoryIndex === 0 : messageHistoryIndex === messageHistory.length) return;

        if (messageHistoryIndex === messageHistory.length) {
          messageHistoryDraft = { text: input.value, start: input.selectionStart,
            end: input.selectionEnd, direction: input.selectionDirection };
        }
        messageHistoryIndex += up ? -1 : 1;
        const draft = messageHistoryIndex === messageHistory.length ? messageHistoryDraft : null;
        input.value = draft ? draft.text : messageHistory[messageHistoryIndex];
        input.setSelectionRange(draft ? draft.start : input.value.length,
          draft ? draft.end : input.value.length, draft?.direction || "none");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        event.preventDefault();
      });
    }

    // Navigate message selection and cancel pending quotes with keyboard shortcuts
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
