# Mermaid diagrams in conversation messages

## Setup

Build the current frontend and start its Vite server on `127.0.0.1:4173`. For the automated fixture, install Chrome and run `node scripts/test-mermaid.cjs`. Alternatively install Playwright Chromium and set `MERMAID_BROWSER_CHANNEL=chromium`. The fixture uses synthetic messages in the real conversation component, without starting a model turn.

## Actions and expected results

1. Open an existing conversation containing a fenced `mermaid` flowchart. A diagram appears with Chinese multiline labels, arrows, and branch labels. Reload the page and reopen the conversation: the same diagram renders again.
2. At 375×812 and 768×1024, switch between light/dark themes. Cards and SVG colors match the theme, and the diagram fits within the message. Select **放大** to see the natural-size diagram and scroll horizontally/vertically where necessary; close using the button, backdrop, or Escape.
3. Select **查看代码** and **查看图表**. The original code and diagram alternate without losing the message. Ordinary JavaScript/Python fences remain ordinary highlighted code.
4. Show an unfinished live Mermaid message. It says **流程图生成中…** rather than flashing parser failures on every streamed token. Finish the message, including a finish that only changes `messageType`: the diagram renders.
5. Exercise Mermaid inside a plan and nested list. Both render; live plans defer rendering until finished. Change the message or leave the thread while drawing: no stale SVG should appear in another message.
6. Invalid syntax retains the source with an explanation and retry button. Sources longer than 50,000 characters are rejected with a readable message. Diagram scripts, HTML event handlers, and JavaScript click links do not execute.
7. Send a unique TestChat marker with representative Markdown and a file link in the fixture; verify `hrefOk`, `titleOk`, `textOk`. Open a duplicate chart/enlarged view and ensure SVG IDs remain unique.

## Performance and cleanup

The library loads from bundled local assets only when a diagram approaches the viewport. Identical renders share work; the SVG cache is bounded to 24 entries / 4,000,000 characters, separated by theme. Screenshots and measured request/render timings are saved under `output/playwright/`. No external CDN, translation service, or model request is needed. Leave the verification server on 4173 running; fixture state is disposable and resets on reload.
