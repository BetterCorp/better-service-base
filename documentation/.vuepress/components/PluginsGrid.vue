<template>
  <div>
    <div v-if="pluginConfig === null">Loading plugins</div>
    <div v-else>
      <div v-for="plugin of pluginConfig" v-bind:key="plugin.name">
        <div>{{ plugin.name }}</div>
      </div>
    </div>
  </div>
</template>

<script>

export default {
  data() {
    return {
      pluginConfig: null
    };
  },
  computed: {
    filteredPlugins() {
      return this.pluginConfig;
    }
  },
  mounted() {
    const self = this;
    fetch('https://min.gitcdn.link/cdn/BetterCorp/better-service-base/documentation/plugins.json').then(async x => {
      self.pluginConfig = await x.json();
    }).catch(x => {
      console.error(x);
    });
  }
}

</script>