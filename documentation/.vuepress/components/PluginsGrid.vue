<template>
  <div style="margin-top: 50px;">
    <div v-if="pluginConfig === null" style="margin: 0 auto; text-align: center;">[ Loading plugins ]</div>
    <div v-else class="pluginsList">
      <div class="plugin-card" v-for="plugin of pluginConfig" v-bind:key="plugin.name">
        <div>
          <div>
            <div>
              <h2>
                {{ plugin.name }}
              </h2>
              <span>v{{ plugin.version }}</span>
              <span> - </span>
              <span>By </span>
              <span style="font-size: 14px">Darkweak</span>
            </div>
          </div>
          <!-- <div data-part-id="flex">
            <i><svg xmlns="http://www.w3.org/2000/svg" width="18px" height="18px" viewBox="0 0 24 24" fill="#F5AA54">
                <g data-name="Layer 2">
                  <g data-name="star">
                    <rect width="24" height="24" transform="rotate(90 12 12)" opacity="0"></rect>
                    <path
                      d="M17.56 21a1 1 0 0 1-.46-.11L12 18.22l-5.1 2.67a1 1 0 0 1-1.45-1.06l1-5.63-4.12-4a1 1 0 0 1-.25-1 1 1 0 0 1 .81-.68l5.7-.83 2.51-5.13a1 1 0 0 1 1.8 0l2.54 5.12 5.7.83a1 1 0 0 1 .81.68 1 1 0 0 1-.25 1l-4.12 4 1 5.63a1 1 0 0 1-.4 1 1 1 0 0 1-.62.18z">
                    </path>
                  </g>
                </g>
              </svg></i><span size="1" data-part-id="text">292</span>
          </div> -->
        </div>
        <p size="1" data-part-id="text">
          Souin is a powerfull cache system as fast as Varnish but easier to
          configure
        </p>
        <div data-part-id="flex">
          <a href="/plugins/6294728cffc0cd18356a97c2/souin">
            <div data-part-id="flex">
              <span size="2" data-part-id="text">Details
                <!-- -->
              </span>
              <div data-part-id="flex">
                <!-- <i><svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24"
                    fill="hsl(222, 67%, 51%)">
                    <g data-name="Layer 2">
                      <g data-name="arrow-forward">
                        <rect width="24" height="24" transform="rotate(-90 12 12)" opacity="0"></rect>
                        <path
                          d="M5 13h11.86l-3.63 4.36a1 1 0 0 0 1.54 1.28l5-6a1.19 1.19 0 0 0 .09-.15c0-.05.05-.08.07-.13A1 1 0 0 0 20 12a1 1 0 0 0-.07-.36c0-.05-.05-.08-.07-.13a1.19 1.19 0 0 0-.09-.15l-5-6A1 1 0 0 0 14 5a1 1 0 0 0-.64.23 1 1 0 0 0-.13 1.41L16.86 11H5a1 1 0 0 0 0 2z">
                        </path>
                      </g>
                    </g>
                  </svg></i> -->
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.pluginsList {
  /* grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); 
  grid-gap: 30px;
  box-sizing: border-box;
  display: grid;
  padding-top: 16px;
  padding-bottom: 16px;
  */
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  justify-content: space-around;
  gap: 50px;
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
  max-width: 450px;
}

.plugin-card::before {
  content: "";
  position: absolute;
  top: 0px;
  left: 0px;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
  transition-property: all;
  transition-duration: 80ms;
  transition-timing-function: linear;
  box-shadow: rgb(0 0 0 / 10%) 0px 4px 12px 0px;
  opacity: 1;
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
    filteredPlugins() {
      return this.pluginConfig;
    },
  },
  mounted() {
    const self = this;
    fetch(
      "https://min.gitcdn.link/cdn/BetterCorp/better-service-base/documentation/plugins.json?time=" +
      new Date().getTime()
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
