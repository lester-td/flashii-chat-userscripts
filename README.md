# Flashii Chat — Ultreme Script

A userscript for [Flashii Chat](https://chat.flashii.net/) that adds richer quoting, message actions, media previews, interface customisation, and quality-of-life improvements.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or Greasemonkey.
2. **[Install Ultreme Script](https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script.user.js)**
3. Reload Flashii Chat.
4. Open **Ultreme Script** in the sidebar to configure its features.

Settings are saved locally and persist across reloads.

### Ultreme Script B

If the standard version does not work with your userscript manager, try **[Ultreme Script B](https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script-b.user.js)**. It keeps the same chat features and locally saved settings, with these compatibility changes:

- Uses `@inject-into page` and accesses the chat client through `window` directly, replacing `unsafeWindow`.
- Runs at `document-idle` and uses `@grant none`, with no dependency on GM APIs.
- In-chat update checks and notifications are removed.
- Uses separate update and download URLs so updates keep you on build B.

## Features

### Quoting

- Quote entire messages or selected text while preserving BBCode formatting.
- Preview quotes before sending, with the option to cancel.
- Display quoted messages with author names, timestamps, and optional avatars.
- Navigate directly to original messages using quote links.
- Automatically shorten long excerpts while preserving formatting and complete media URLs.
- Exclude attachment metadata and file sizes from quoted content.

**Keyboard shortcuts:**
- **Ctrl+↑ / Ctrl+↓** — Select messages to quote.
- **Esc** — Cancel a pending quote.

Quote avatars can be enabled or disabled under **Quotes**. When disabled, a reply icon is displayed instead.

### Message Actions

Add configurable actions to chat messages:

- **Quote** — Quote a message or selected text.
- **Go to quoted** — Jump to the referenced message.
- **Delete** — Delete your own messages.

Alternatively, hold **Shift** and click your message's timestamp to delete it.

Message action buttons support icons, text labels, or both, with configurable appearance and visibility. On touchscreens, tap a message to reveal its actions.

### Sent Message History

Recall previously sent messages without leaving the text field.

- **↑** on the first line — Recall an older message.
- **↓** on the last line — Move forward through history.
- Moving past the newest entry restores your previous draft and cursor position.
- Normal arrow-key navigation remains available when editing multiline messages.

History is stored in memory until the chat is reloaded and can be toggled under **Messages**.

*Adapted from geb's sockchat message history userscript.*

### Media Previews

View image, video, and audio attachments referenced in quotes.

- Open supported media in the built-in viewer.
- Expand or collapse media embeds directly within quote blocks.
- Access media through direct viewer links in compact mode.
- Open or download the original media from the viewer.

Media URLs remain intact when long quotes are shortened.

### Minimal Mode

Hide unnecessary interface elements for a cleaner chat layout.

Minimal mode keeps messages, the text field, message actions, quote previews, and native upload cards accessible.

- Hover, tap, or focus the small square at the bottom-right of the text field to reveal hidden controls.
- Controls appear as overlays by default, keeping the message list and text field stationary.
- Turn off **Use overlays in minimal mode** to use the resizing layout instead.
- Set **Hide controls after (seconds)** with a number field that adjusts in **0.25-second** steps. The default is **1.5 seconds**.
- Controls stay visible while hovered, focused with the keyboard, or being dragged. The hide delay starts when interaction ends.
- Show and hide transitions follow Mami's sidebar animation timing.
- Open dialogs remain accessible until closed.
- Upload progress, cancellation, retries, and completed attachments remain usable.
- Reduced-motion preferences are respected.

Minimal mode can be toggled under **Messages** and remains enabled across reloads.

### Interface Customisation

Adjust the chat interface under **Messages**.

**Message list zoom**
- Scale messages, avatars, and media from **50% to 200%** in **5%** steps.
- Set **Message list zoom (%)** to **100** to restore the original size.
- The composer and sidebar keep their usual size, and the zoom level persists across reloads.

**Message buttons**
- Display icons, text, or both.
- Show actions on hover, focus, or tap, or keep them permanently visible.
- Choose between plain, subtle, and outlined button styles.
- Match button colours to the active Mami theme.

**Formatting toolbar**
- Hide formatting buttons without affecting uploads or quote previews.

Changes apply immediately without reloading the page.

### Connection Notices

Compact consecutive join and leave notices to reduce clutter.

Repeated connection activity is combined into a single notice, with summaries for users who reconnect, leave shortly after joining, or repeatedly disconnect.

This feature can be toggled under **Messages**.

### Navigation

Enable additional sidebar shortcuts under **Navigation**.

- **Forum** — Open the Flashii Forum.
- **Jump to bottom** — Scroll to the latest chat messages.

Both buttons can be enabled or disabled independently.

### Script Settings

Configure individual features through the **Ultreme Script** sidebar.

Settings are organised into four sections:

- **Quotes** — Quote controls, formatting, and avatars.
- **Messages** — Message actions, history, minimal mode, and interface preferences.
- **Navigation** — Additional sidebar buttons.
- **About** — Script information and update checks.

Some settings include a superscript **?** that displays additional information when clicked.

Only one hint can be displayed at a time. Press **Esc** to dismiss it. Hints also close automatically when switching sections, closing the settings sidebar, or hiding the interface in minimal mode.

### Update Checks

The desktop script checks for updates and displays a notification when a newer version is available.

You can also check manually through **Ultreme Script → About**.

Updates are distributed through the [Patchii repository](https://patchii.net/lester/flashii-chat-userscripts).
