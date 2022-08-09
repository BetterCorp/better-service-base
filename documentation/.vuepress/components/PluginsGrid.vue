<template>
  <div style="margin-top: 50px;">
    <div v-if="pluginConfig === null" style="margin: 0 auto; text-align: center;">[ Loading plugins ]</div>
    <div v-else class="pluginsList">
      <div :class="`plugin-card plugin-type-${ plugin.type }`" v-for="plugin of reparsedPlugins"
        v-bind:key="plugin.ref.name + plugin.name">
        <div class="plugin-header">
          <h2 class="plugin-title">
            <img class="plugin-img plugin-img-author" :src="plugin.ref.author.avatar" />
            <img class="plugin-img plugin-img-icon"
              :src="plugin.ref.github + '/raw/' + (plugin.ref.branch || 'master') + '/bsb-' + plugin.def.icon" />
            <div>
              {{ plugin.def.name }}
            </div>
          </h2>
          <span style="font-weight: 600;">v{{ plugin.ref.version }}</span>
          <span> - </span>
          <span>By </span>
          <a :href="plugin.ref.author.url" nofollow style="font-weight: 600;">{{ plugin.ref.author.name }}</a>
        </div>
        <p size="1" data-part-id="text">
          {{ plugin.def.description }}
        </p>
        <div data-part-id="flex">
          <a href="/plugins/6294728cffc0cd18356a97c2/souin">
            <div data-part-id="flex">
              <span size="2">Details
              </span>
            </div>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.pluginsList {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  justify-content: space-around;
  gap: 50px;
}

.plugin-card:not(:hover) .plugin-img-icon {
  margin-left: -20px;
}

.plugin-card:hover .plugin-img-icon {
  margin-left: 5px;
}

.plugin-img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: white;
  border: 3px solid white;
  box-shadow: rgb(0 0 0 / 20%) 0px 4px 12px 0px;
}

.plugin-img-icon {
  transition: 150ms cubic-bezier(.82, .37, .14, .87);
}

.plugin-title {
  height: 50px;
  font-weight: 600;
  line-height: 1.25;
}

.plugin-title div {
  padding-left: 10px;
  display: inline-block;
  height: 65px;
  line-height: 40px;
  vertical-align: middle;
}

.plugin-card {
  box-sizing: border-box;
  background-color: rgb(255, 255, 255);
  border-radius: 6px;
  border: 1px solid rgb(219, 219, 219);
  position: relative;
  transition: opacity 80ms linear 0s, transform 150ms ease 0s, border-color 150ms ease-in-out 0s;
  padding: 24px;
  display: flex;
  flex-direction: column;
  width: 400px;
  padding-top: 0;
  border-color: #2d2d2d;
  box-shadow: rgba(0, 0, 0, 0.2) 0px 4px 12px 0px;
}

.plugin-header::before {
  position: absolute;
  padding: 5px 10px 5px 10px;
  border-radius: 15px;
  margin-top: -15px;
  margin-left: -10px;
}

.plugin-type-config .plugin-header::before {
  content: "CONFIG";
  background: #03A9F4;
  color: white;
}

.plugin-type-config {
  border-color: #03A9F4;
  box-shadow: rgba(2, 166, 242, 0.2) 0px 4px 12px 0px;
}

.plugin-type-events .plugin-header::before {
  content: "EVENTS";
  background: #FB8C00;
  color: white;
}

.plugin-type-events {
  border-color: #FB8C00;
  box-shadow: rgba(251, 140, 0, 0.2) 0px 4px 12px 0px;
}

.plugin-type-logging .plugin-header::before {
  content: "LOGGING";
  background: #43A047;
  color: white;
}

.plugin-type-logging {
  border-color: #43A047;
  box-shadow: rgba(67, 160, 71, 0.2) 0px 4px 12px 0px;
}
</style>

<script>
export default {
  data() {
    return {
      pluginConfig: null,
    };
  },
  computed: {
    reparsedPlugins() {
      let outputList = [];
      for (let plugin of this.pluginConfig) {
        for (let pluginDef of plugin.plugins) {
          outputList.push({
            ...pluginDef,
            ref: plugin
          });
        }
      }
      console.log(outputList);
      return outputList;
    },
    filteredPlugins() {
      return this.pluginConfig;
    },
  },
  mounted() {
    const self = this;
    fetch(
      "https://raw.githubusercontent.com/BetterCorp/better-service-base/documentation/plugins.json"
      //"https://min.gitcdn.link/cdn/BetterCorp/better-service-base/documentation/plugins.json?time=" +
      //new Date().getTime()
    )
      .then(async (x) => {
        self.pluginConfig = await x.json();
        self.pluginConfig = self.pluginConfig.concat(self.pluginConfig);
        self.pluginConfig = self.pluginConfig.concat(self.pluginConfig);
        self.pluginConfig = self.pluginConfig.concat(self.pluginConfig);
        self.pluginConfig = self.pluginConfig.concat(self.pluginConfig);
      })
      .catch((x) => {
        console.error(x);
      });
  },
};
</script>
