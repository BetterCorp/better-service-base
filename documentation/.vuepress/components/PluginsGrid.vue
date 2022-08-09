<template>
  <div style="margin-top: 50px;" class="plugins-container">
    <div :class="`plugin-selector-container plugin-filter-${ filter.toLowerCase() }`">
      <div class="plugin-selector">
        <span :active="filter == 'ALL'" @click="filter = 'ALL'">ALL</span>
        <span :active="filter == 'PLUGIN'" @click="filter = 'PLUGIN'">PLUGINS</span>
        <span :active="filter == 'CONFIG'" @click="filter = 'CONFIG'">CONFIG</span>
        <span :active="filter == 'EVENTS'" @click="filter = 'EVENTS'">EVENTS</span>
        <span :active="filter == 'LOG'" @click="filter = 'LOG'">LOGGING</span>
      </div>
      <div class="plugin-selector search-bar" v-if="pluginConfig !== null && false">
        <span :active="!doSearch" @click="doSearch = true">SEARCH</span> <input v-if="doSearch" v-model="search"
          :active="true" />
      </div>
    </div>
    <div class="pluginsList">
      <template v-if="pluginConfig === null">
        <PluginsGridPlugin v-for="i of 3" v-bind:key="i" :plugin="null" />
      </template>
      <template v-else>
        <div v-if="filteredPlugins.length === 0">[ No plugins found ]</div>
        <PluginsGridPlugin v-for="plugin of filteredPlugins" v-bind:key="plugin.ref.name + plugin.name"
          :plugin="plugin" />
      </template>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      search: '',
      filter: 'ALL',
      pluginConfig: null,
      pulledFromCache: false,
      doSearch: false
    };
  },
  watch: {
    filter() {
      //this.pluginConfig = null;
      window.document.getElementsByClassName('page')[0].classList.add('notransition');
      switch (this.filter) {
        case 'PLUGIN':
          return this.$router.push('/Market/Plugin/');
        case 'EVENTS':
          return this.$router.push('/Market/Events/');
        case 'CONFIG':
          return this.$router.push('/Market/Config/');
        case 'LOG':
          return this.$router.push('/Market/Log/');
      }
      this.$router.push('/Market/');
    }
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
      // console.log(outputList);
      return outputList;
    },
    filteredPlugins() {
      const self = this;
      console.log(this.reparsedPlugins);
      const filterFunc = x => x.name.toLowerCase().indexOf(self.search.toLowerCase()) >= 0 ||
        x.def.name.toLowerCase().indexOf(self.search.toLowerCase()) >= 0 ||
        x.def.description.toLowerCase().indexOf(self.search.toLowerCase()) >= 0 ||
        x.ref.name.toLowerCase().indexOf(self.search.toLowerCase()) >= 0;
      if (self.filter === 'ALL') {
        if (self.search === '')
          return self.reparsedPlugins;
        return self.reparsedPlugins.filter(filterFunc);
      }
      const filterAsLower = self.filter.toLowerCase();
      if (self.search === '')
        return self.reparsedPlugins.filter(x => filterAsLower === x.type);
      return self.reparsedPlugins.filter(x => filterAsLower === x.type).filter(filterFunc);
    },
  },
  created() {
    const self = this;
    let time = 0;
    let lastPD = window.localStorage.getItem('plugin-date') || '';
    if (lastPD !== '') {
      time = Number.parseInt(lastPD);
    }
    if (new Date().getTime() - time < (60 * 60 * 1000)) {
      self.$data.pluginConfig = JSON.parse(window.localStorage.getItem('plugins'));
      self.pulledFromCache = true;
    }
  },
  mounted() {
    const self = this;
    if (this.$route.path.indexOf('/Market/') === 0) {
      let searchFilter = this.$route.path.split('Market/')[1];
      if (searchFilter.indexOf('/') > 0) {
        this.filter = searchFilter.split('/')[0].toUpperCase();
        if (['PLUGIN', 'EVENTS', 'LOG', 'CONFIG'].indexOf(this.filter) < 0) {
          this.$router.replace('/Market/');
        }
      }
    }
    if (self.pulledFromCache) return;
    fetch(
      "https://raw.githubusercontent.com/BetterCorp/better-service-base/documentation/plugins.json"
      //"https://min.gitcdn.link/cdn/BetterCorp/better-service-base/documentation/plugins.json?time=" +
      //new Date().getTime()
    )
      .then(async (x) => {
        //await (new Promise(r => setTimeout(r, 15000)));
        //return;
        self.pluginConfig = await x.json();
        window.localStorage.setItem('plugins', JSON.stringify(self.pluginConfig));
        window.localStorage.setItem('plugin-date', new Date().getTime());
        //self.pluginConfig = self.pluginConfig.concat(self.pluginConfig);
        //self.pluginConfig = self.pluginConfig.concat(self.pluginConfig);
        //self.pluginConfig = self.pluginConfig.concat(self.pluginConfig);
        //self.pluginConfig = self.pluginConfig.concat(self.pluginConfig);
      })
      .catch((x) => {
        console.error(x);
      });
  },
};
</script>
