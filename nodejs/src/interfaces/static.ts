export class ErrorMessages {
  // [BSB-E000001] The method/get property is initialized when the BSB starts up and is overridden. So if you are seeing this error, it means the function was not overridden correctly.
  public static get BSBNotInit() {
    return new Error(
      "[BSB-E000001] Plugins aren`t being initialized properly or you`re trying to call this function directly"
    );
  }

  // [BSB-E000002] The events plugin in use does not implement all methods required for the BSB to function normally.
  public static get EventsNotImplementedProperly() {
    return new Error(
      "[BSB-E000002] Events plugin not properly implementing all methods."
    );
  }

  // [BSB-E000003] A plugin in use does not implement all methods required for the BSB to function normally.
  public static get PluginNotImplementedProperly() {
    return new Error(
      "[BSB-E000003] Plugin not properly implementing all methods."
    );
  }

  // [BSB-E000004] The logger plugin in use does not implement all methods required for the BSB to function normally.
  public static get LoggerNotImplementedProperly() {
    return new Error(
      "[BSB-E000004] Logger plugin not properly implementing all methods."
    );
  }

  // [BSB-E000005] The config plugin in use does not implement all methods required for the BSB to function normally.
  public static get ConfigNotImplementedProperly() {
    return new Error(
      "[BSB-E000005] Config plugin not properly implementing all methods."
    );
  }

  // [BSB-E000006] The logger plugin in use does not implement all methods required for the BSB to function normally.
  public static get PluginClientNotImplementedProperly() {
    return new Error(
      "[BSB-E000006] An extended plugin client must call this.construct(plugin); in the constructor!"
    );
  }

  // [BSB-E000007] Plugin sec.config not interfaced correctly
  public static get PluginConfigNotSetupToGenerateConfig() {
    return new Error(
      "[BSB-E000007] Plugin sec.config not interfaced correctly"
    );
  }

  // [BSB-E000008] Cannot call service plugin method because plugin is not running, or setup to handle it
  public static get ServicePluginNotCallableMethod() {
    return new Error(
      "[BSB-E000008] Cannot call service plugin method because plugin is not running, or setup to handle it"
    );
  }
}
