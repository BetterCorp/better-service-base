<template>
  <vue-content-loading :width="width || 200" :height="20" :style="`width: ${ width || 200 }px; height: 20px`">
    <rect x="5" y="5" rx="5" ry="5" :width="(width || 200) - 10" height="10" />
  </vue-content-loading>
</template>

<script>
import VueContentLoading from "./VueContentLoading.vue";

export default {
  components: {
    VueContentLoading
  },
  name: "Loader",
  props: {
    width: Number
  },
};
</script>
