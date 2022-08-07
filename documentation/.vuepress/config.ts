import { defineUserConfig, defaultTheme, viteBundler } from "vuepress";

export default defineUserConfig({
  lang: "en-US",
  title: "Better-Service-Base Documentation",
  description: "Better-Service-Base for distributed Micro-Services",
  theme: defaultTheme({
    repo: "https://github.com/BetterCorp/better-service-base",
    docsRepo: "https://github.com/BetterCorp/better-service-base",
    docsBranch: "documentation",
    // default theme config
    navbar: [
      {
        text: "Home",
        link: "/",
      },
      {
        text: "Get Started",
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
        link: "/Plugins",
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
