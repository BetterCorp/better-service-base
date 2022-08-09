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
      <span v-if="plugin.type !== 'config'" style="margin-right: 10px;">
        <a href="" class="action-button">Quick Start</a>
      </span>
      <a class="action-button-basic" :rel="plugin.pluginLink !== null ? 'external' : 'nofollow'"
        :href="plugin.pluginLink !== null ? `https://${ plugin.pluginLink }` : plugin.ref.github">
        <span>View documentation</span>
      </a>
    </div>
  </div>
</template>

<script>
export default {
  props: ['plugin']
};
</script>