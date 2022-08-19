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
}
