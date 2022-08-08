import { defineClientConfig } from "@vuepress/client";
import PluginsGrid from "./components/PluginsGrid.vue";

export default defineClientConfig({
  enhance({ app, router, siteData }) {
    app.component("PluginsGrid", PluginsGrid);
  },
  setup() {},
  rootComponents: [],
});
