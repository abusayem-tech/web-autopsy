import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Web Autopsy",
    description:
      "Capture page autopsies — network, APIs, images, performance — and save to your team archive.",
    permissions: [
      "storage",
      "tabs",
      "webRequest",
      "cookies",
      "scripting",
      "sidePanel",
      "debugger",
      "activeTab",
    ],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "Web Autopsy",
    },
    side_panel: {
      default_path: "sidepanel.html",
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
    web_accessible_resources: [
      {
        resources: ["inject.js"],
        matches: ["<all_urls>"],
      },
    ],
  },
});
