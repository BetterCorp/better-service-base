<template>
  <div :class="`plugin-card plugin-type-${ plugin === null ? 'grey' : plugin.type }`">
    <div class="plugin-header">
      <h2 class="plugin-title">
        <Loader v-if="plugin === null" :width="300" />
        <template v-else>
          <img class="plugin-img plugin-img-author" :src="plugin.ref.author.avatar" />
          <img class="plugin-img plugin-img-icon"
            :src="plugin.ref.github + '/raw/' + (plugin.ref.branch || 'master') + '/bsb-' + plugin.def.icon" />
          <div>
            {{ plugin.def.name }}
          </div>
        </template>
      </h2>
      <Loader v-if="plugin === null" :width="200" />
      <template v-else>
        <span style="font-weight: 600;">v{{ plugin.ref.version }}</span>
        <span> - </span>
        <span>By </span>
        <a class="author-name" :href="plugin.ref.author.url" rel="nofollow" style="font-weight: 600;">{{
            plugin.ref.author.name
        }}</a>
      </template>
    </div>
    <p size="1" data-part-id="text">
      <Loader v-if="plugin === null" :width="150" />
      <span v-else>{{ plugin.def.description }}</span>
    </p>
    <Loader v-if="plugin === null" :width="100" />
    <div v-else>
      <span v-if="plugin.config !== null" style="margin-right: 10px;">
        <a href="" class="action-button" @click="quickStartEvent">Quick Start</a>
      </span>
      <a class="action-button-basic" :rel="plugin.pluginLink !== null ? 'external' : 'nofollow'"
        :href="plugin.pluginLink !== null ? `https://${ plugin.pluginLink }` : plugin.ref.github">
        <span>View documentation</span>
      </a>
    </div>

    <div class="card-show-container" v-if="plugin !== null && quickStart">
      <div
        :class="`plugin-card plugin-type-${ plugin === null ? 'grey' : plugin.type } plugin-type-${ plugin === null ? 'grey' : plugin.type }-forced card-show-start`">
        <div class="plugin-header"></div>
        <div>
          <div>
            <svg @click="quickStart = false" xmlns="http://www.w3.org/2000/svg" class="plugin-img action-button-style"
              style="margin-right: 40px; cursor: pointer; fill: white;" viewBox="0 0 320 512">
              <!--! Font Awesome Pro 6.1.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. -->
              <path
                d="M310.6 361.4c12.5 12.5 12.5 32.75 0 45.25C304.4 412.9 296.2 416 288 416s-16.38-3.125-22.62-9.375L160 301.3L54.63 406.6C48.38 412.9 40.19 416 32 416S15.63 412.9 9.375 406.6c-12.5-12.5-12.5-32.75 0-45.25l105.4-105.4L9.375 150.6c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L160 210.8l105.4-105.4c12.5-12.5 32.75-12.5 45.25 0s12.5 32.75 0 45.25l-105.4 105.4L310.6 361.4z" />
            </svg>
          </div>
          <h2>
            <img class="plugin-img" style="width: 25px; height: 25px;margin-bottom: -5px;"
              :src="plugin.ref.github + '/raw/' + (plugin.ref.branch || 'master') + '/bsb-' + plugin.def.icon" /> Quick
            Start with <a class="author-name"
              :href="plugin.pluginLink !== null ? `https://${ plugin.pluginLink }` : plugin.ref.github"
              :rel="plugin.pluginLink !== null ? 'external' : 'nofollow'" style="font-weight: 600;">{{ plugin.def.name
              }}</a> <span>v{{ plugin.ref.version }}</span> by
            <a class="author-name" :href="plugin.ref.author.url" rel="nofollow" style="font-weight: 600;">{{
                plugin.ref.author.name
            }}</a>
          </h2>
        </div>
        <p>
          Ok so to get started, let's configure the service.
        </p>
        <div class="language-json ext-json">
          <pre class="language-json"><code v-html="generateConfig"></code></pre>
        </div>
        <br />
        <br />
        <br />
        <div class="language-typescript ext-ts line-numbers-mode">
          <pre class="language-typescript"><code><span class="token keyword">export</span> <span class="token keyword">class</span> <span class="token class-name">frontend</span> <span class="token keyword">extends</span> <span class="token class-name">CPluginClient<span class="token operator">&lt;</span><span class="token builtin">any</span><span class="token operator">&gt;</span></span> <span class="token punctuation">{</span>
  <span class="token keyword">public</span> <span class="token keyword">readonly</span> _pluginName<span class="token operator">:</span> <span class="token builtin">string</span> <span class="token operator">=</span> <span class="token string">"frontend"</span><span class="token punctuation">;</span>

  <span class="token keyword">async</span> <span class="token function">triggerServerOnEvent</span><span class="token punctuation">(</span>data<span class="token operator">:</span> <span class="token builtin">any</span><span class="token punctuation">)</span><span class="token operator">:</span> <span class="token builtin">Promise</span><span class="token operator">&lt;</span><span class="token keyword">void</span><span class="token operator">&gt;</span> <span class="token punctuation">{</span>
    <span class="token keyword">await</span> <span class="token keyword">this</span><span class="token punctuation">.</span><span class="token function">emitEvent</span><span class="token punctuation">(</span><span class="token string">"exampleOnEvent"</span><span class="token punctuation">,</span> data<span class="token punctuation">)</span><span class="token punctuation">;</span>
  <span class="token punctuation">}</span>
  <span class="token keyword">async</span> <span class="token function">triggerServerMethod</span><span class="token punctuation">(</span>data<span class="token operator">:</span> <span class="token builtin">any</span><span class="token punctuation">)</span><span class="token operator">:</span> <span class="token builtin">Promise</span><span class="token operator">&lt;</span><span class="token builtin">any</span><span class="token operator">&gt;</span> <span class="token punctuation">{</span>
    <span class="token keyword">return</span> <span class="token keyword">this</span><span class="token punctuation">.</span><span class="token function">emitEventAndReturn</span><span class="token punctuation">(</span><span class="token string">"exampleServerMethod"</span><span class="token punctuation">,</span> data<span class="token punctuation">)</span><span class="token punctuation">;</span>
  <span class="token punctuation">}</span>
<span class="token punctuation">}</span>
</code></pre>
          <div class="line-numbers" aria-hidden="true">
            <div class="line-number"></div>
            <div class="line-number"></div>
            <div class="line-number"></div>
            <div class="line-number"></div>
            <div class="line-number"></div>
            <div class="line-number"></div>
            <div class="line-number"></div>
            <div class="line-number"></div>
            <div class="line-number"></div>
            <div class="line-number"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: ['plugin'],
  data() {
    return {
      quickStart: false,
    };
  },
  computed: {
    generateConfig() {
      let code = [];
      console.log(this.plugin.config);
      let extraDefs = Object.keys(this.plugin.config.extraDefinitions);
      for (let pkey of Object.keys(this.plugin.config.definitions)) {
        console.log(pkey);
        code.push(`      "<span class="token function">${pkey}</span>": ""`);
        if (extraDefs.indexOf(this.plugin.config.definitions[pkey].type)) {
          
        }
      }
      let strCode = `{\n  "<span class="token keyword">plugins</span>": {\n    "<span class="token class-name">frontend</span>": {\n` + code.join(',\n') + '\n    }\n  }\n}';
      return strCode;
    }
  },
  methods: {
    quickStartEvent(e) {
      e.preventDefault();
      this.quickStart = true;
    }
  }
};
</script>