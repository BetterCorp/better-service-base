
import { defineUserConfig, defaultTheme, viteBundler } from 'vuepress';

export default defineUserConfig({
  lang: 'en-US',
  title: 'Better-Service-Base Documentation',
  description: 'Better-Service-Base for distributed Micro-Services',
  theme: defaultTheme({
    // default theme config
    navbar: [
      {
        text: 'Home',
        link: '/',
      },
      {
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
      },
      {
        text: 'Plugins',
        link: '/Plugins',
      },
      {
        text: 'Development',
        link: '/Development',
      },
    ],
  }),
  bundler: viteBundler({
    vuePluginOptions: {
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'left',
        },
      },
    },
  }),
});