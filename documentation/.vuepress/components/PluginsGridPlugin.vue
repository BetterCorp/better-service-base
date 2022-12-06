<template>
  <div :class="`plugin-card plugin-type-${ plugin === null ? 'grey' : plugin.type }`">
    <div class="plugin-header">
      <h2 class="plugin-title">
        <Loader v-if="plugin === null" :width="300" />
        <template v-else>
          <span class="plugin-img plugin-img-author" :style="`background-image: url(${plugin.ref.author.avatar})`" />
          <span class="plugin-img plugin-img-icon"
            :style="`background-image: url(${plugin.ref.github + '/raw/' + (plugin.ref.branch || 'master') + '/bsb-' + plugin.def.icon})`" />
          <div class="plugin-title-name" v-if="plugin.def.name.length <= 18">
            {{ plugin.def.name }}
          </div>
          <div v-else class="plugin-title-name">
            {{ plugin.def.name.substring(0, 15) }}...
          </div>
        </template>
      </h2>
      <Loader v-if="plugin === null" :width="200" />
      <template v-else>
        <span style="font-weight: 600;">v{{ plugin.ref.version }}</span>
        <span> - </span>
        <span>By </span>
        <a class="author-name" :href="plugin.ref.author.url" rel="nofollow" style="font-weight: 600;"> {{
        plugin.ref.author.name
        }} <svg style="max-height: 10px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <!-- Font Awesome Pro 5.15.4 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) -->
            <path
              d="M432,320H400a16,16,0,0,0-16,16V448H64V128H208a16,16,0,0,0,16-16V80a16,16,0,0,0-16-16H48A48,48,0,0,0,0,112V464a48,48,0,0,0,48,48H400a48,48,0,0,0,48-48V336A16,16,0,0,0,432,320ZM488,0h-128c-21.37,0-32.05,25.91-17,41l35.73,35.73L135,320.37a24,24,0,0,0,0,34L157.67,377a24,24,0,0,0,34,0L435.28,133.32,471,169c15,15,41,4.5,41-17V24A24,24,0,0,0,488,0Z" />
          </svg></a>
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
        <span>View documentation <svg style="max-height: 10px;" xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512">
            <!-- Font Awesome Pro 5.15.4 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) -->
            <path
              d="M432,320H400a16,16,0,0,0-16,16V448H64V128H208a16,16,0,0,0,16-16V80a16,16,0,0,0-16-16H48A48,48,0,0,0,0,112V464a48,48,0,0,0,48,48H400a48,48,0,0,0,48-48V336A16,16,0,0,0,432,320ZM488,0h-128c-21.37,0-32.05,25.91-17,41l35.73,35.73L135,320.37a24,24,0,0,0,0,34L157.67,377a24,24,0,0,0,34,0L435.28,133.32,471,169c15,15,41,4.5,41-17V24A24,24,0,0,0,488,0Z" />
          </svg></span>
      </a>
    </div>

    <div class="card-show-container" v-if="plugin !== null && quickStart">
      <div
        :class="`plugin-card plugin-type-${ plugin === null ? 'grey' : plugin.type } plugin-type-${ plugin === null ? 'grey' : plugin.type }-forced card-show-start`">

        <div>
          <div class="card-show-exit plugin-header">
            <svg @click="quickStart = false" xmlns="http://www.w3.org/2000/svg" class="plugin-img action-button-style"
              style="margin-right: 40px; cursor: pointer; fill: white;" viewBox="0 0 320 512">
              <!-- Font Awesome Pro 6.1.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. -->
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
              }} <svg style="max-height: 15px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                <!-- Font Awesome Pro 5.15.4 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) -->
                <path
                  d="M432,320H400a16,16,0,0,0-16,16V448H64V128H208a16,16,0,0,0,16-16V80a16,16,0,0,0-16-16H48A48,48,0,0,0,0,112V464a48,48,0,0,0,48,48H400a48,48,0,0,0,48-48V336A16,16,0,0,0,432,320ZM488,0h-128c-21.37,0-32.05,25.91-17,41l35.73,35.73L135,320.37a24,24,0,0,0,0,34L157.67,377a24,24,0,0,0,34,0L435.28,133.32,471,169c15,15,41,4.5,41-17V24A24,24,0,0,0,488,0Z" />
              </svg></a>
          </h2>
        </div>
        <div style="padding: 20px;">
          <div style="display: inline-block; margin-right: 5px;" v-for="badge of badges" v-bind:key="badge.url">
            <a :href="badge.url" v-if="typeof badge.url === 'string'"><img :src="badge.img" /></a>
            <img v-else :src="badge.img" />
          </div>
        </div>
        <p>
          Ok so to get started, let's configure the service.<br />
          This config is changed in the <code>sec.config.json</code> file or via your respective config plugin (see
          config plugin documentation for more information)<br /><br />
          Below are the default plugin configuration values for the plugin:
        </p>
        <div class="language-json ext-json">
          <pre class="language-json"><code v-html="generateConfig"></code></pre>
        </div>
        <p>
          Here is more information for the configuration:
        </p>
        <div v-html="generateTableProperties">

        </div>
        <p>
          Now that we have configured the plugin, we should enable it for deployment:
        </p>
        <div class="language-json ext-json">
          <pre class="language-json"><code v-html="generateDeploymentConfig"></code></pre>
        </div>
        <p>
          Last but not least, we should install it.<br />
          This will actually be taken care of automatically by the BSB.
          !! Coming soon
        </p>
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
    badges() {
      let badgs = [];

      if (this.plugin.def.badges !== undefined) {
        badgs = this.plugin.def.badges;
      }

      // docker-default
      badgs.push(
        {
          url: "https://hub.docker.com/r/betterweb/service-base",
          img: "https://img.shields.io/docker/image-size/betterweb/service-base/latest"
        }
      );

      return badgs;
    },
    generateTableProperties() {
      return this.generateTableCode(this.plugin.config.definitions, this.plugin.config.defaultValues, this.plugin.config.extraDefinitions, null).join('');
    },
    generateDeploymentConfig() {
      let strCode = `{\n  "<span class="token keyword">deploymentProfiles</span>": {\n    "<span class="token keyword">default</span>": {\n      "<span class="token class-name">${ this.plugin.name }</span>": {\n` +
        `        "<span class="token function">mappedName</span>": <span class="token string">"${ this.plugin.name }"</span>,\n` +
        '        "<span class="token function">enabled</span>": <span class="token string">true</span>,\n' +
        '      }\n    }\n  }\n}';
      return strCode;
    },
    generateConfig() {
      let code = this.generateConfigCode(this.plugin.config.definitions, this.plugin.config.defaultValues, this.plugin.config.extraDefinitions, 6);
      let strCode = `{\n  "<span class="token keyword">plugins</span>": {\n    "<span class="token class-name">${ this.plugin.name }</span>": {\n` + code.join(',\n') + '\n    }\n  }\n}';
      return strCode;
    }
  },
  methods: {
    generateTableCode(definitions, defaultValues, additionalDefinitions, interfaceName) {
      let extraDefs = Object.keys(additionalDefinitions);
      let code = [
        (interfaceName !== null ? `<h5 id="PLUGIN_DEF_${ interfaceName }">Type: ${ interfaceName }</h5>` : '<h5>Plugin configuration definition</h5>'),
        `<table style="overflow: visible"><thead><tr>` +
        `<th>Name</th>` +
        `<th>Property</th>` +
        `<th>Required</th>` +
        `<th>Type</th>` +
        `<th>Default</th>` +
        `<th>Description</th>` +
        `</tr></thead><tbody>`
      ];
      let requiredAdditionalDefs = [];
      for (let pkey of Object.keys(definitions)) {
        if (defaultValues[pkey] === undefined) continue;
        code.push('<tr>');
        code.push(`<td>${ definitions[pkey].name }</td>`);
        code.push(`<td>${ pkey }</td>`);
        code.push(`<td>${ definitions[pkey].required ? 'Yes' : 'No' }</td>`);
        if (extraDefs.indexOf(definitions[pkey].type) >= 0) {
          requiredAdditionalDefs.push({ p: pkey, t: definitions[pkey].type });
          code.push(`<td><a href="#PLUGIN_DEF_${ definitions[pkey].type }">${ definitions[pkey].type }</a></td>`);
          code.push(`<td><a href="#PLUGIN_DEF_${ definitions[pkey].type }"> - see interface definition - </a></td>`);
        } else {
          code.push(`<td>${ definitions[pkey].type }</td>`);
          code.push(`<td>${ JSON.stringify(defaultValues[pkey]) }</td>`);
        }
        code.push(`<td>${ definitions[pkey].description || '' }</td>`);
        code.push('</tr>');
      }
      code.push('</tbody>');
      code.push('</table>');

      for (let def of requiredAdditionalDefs) {
        code = code.concat(this.generateTableCode(additionalDefinitions[def.t], defaultValues[def.p], additionalDefinitions, def.t));
      }

      return code;
    },
    generateConfigCode(definitions, defaultValues, additionalDefinitions, space) {
      let extraDefs = Object.keys(additionalDefinitions);
      let code = [];
      for (let pkey of Object.keys(definitions)) {
        if (defaultValues[pkey] === undefined) continue;
        if (extraDefs.indexOf(definitions[pkey].type) >= 0) {
          code.push(`${ " ".repeat(space) }"<span class="token function">${ pkey }</span>": {\n${ this.generateConfigCode(additionalDefinitions[definitions[pkey].type], defaultValues[pkey], additionalDefinitions, space + 2).join('\n') }\n${ " ".repeat(space) }}`);
        } else {
          code.push(`${ " ".repeat(space) }"<span class="token function">${ pkey }</span>": <span class="token string">${ JSON.stringify(defaultValues[pkey]) }</span>`);
        }
      }
      return code;
    },
    quickStartEvent(e) {
      e.preventDefault();
      this.quickStart = true;
    }
  }
};
</script>