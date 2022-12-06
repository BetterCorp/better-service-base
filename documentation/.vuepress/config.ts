import { defineUserConfig, defaultTheme, viteBundler } from "vuepress";
import { path } from "@vuepress/utils";

export default defineUserConfig({
  clientConfigFile: path.resolve(__dirname, "./clientConfig.ts"),
  lang: "en-US",
  title: "Better-Service-Base Documentation",
  description: "Better-Service-Base for distributed Micro-Services",
  theme: defaultTheme({
    repo: "https://github.com/BetterCorp/better-service-base",
    docsRepo: "https://github.com/BetterCorp/better-service-base",
    docsBranch: "develop",
    docsDir: "documentation",
    // default theme config
    navbar: [
      {
        text: "Home",
        link: "/",
      },
      {
        text: "Development",
        link: "/Development",
      },
      {
        text: "Deployment",
        link: "/Deployment",
      },
      /*{
        text: 'Config',
        link: '/Config',
      },
      {
        text: 'Events',
        link: '/Events',
      },
      {
        text: 'Logging',
        link: '/Logging',
      },*/
      {
        text: "Plugins",
        link: "/Plugins/",
      },
      {
        text: "Plugin Marketplace",
        link: "/Market/",
      },
      {
        text: "NPM",
        link: "https://www.npmjs.com/package/@bettercorp/service-base",
      },
      {
        text: "Docker",
        link: "https://hub.docker.com/r/betterweb/service-base",
      },
    ],
  }),
  bundler: viteBundler({
    vuePluginOptions: {
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === "left",
        },
      },
    },
  }),
});
