import { defineClientConfig } from "@vuepress/client";
import PluginsGrid from "./components/PluginsGrid.vue";
import PluginsGridPlugin from "./components/PluginsGridPlugin.vue";
import Loader from "./components/Loader.vue";

export default defineClientConfig({
  enhance({ app, router, siteData }) {
    app.component("PluginsGrid", PluginsGrid);
    app.component("PluginsGridPlugin", PluginsGridPlugin);
    app.component("Loader", Loader);
  },
  setup() {},
  rootComponents: [],
});
