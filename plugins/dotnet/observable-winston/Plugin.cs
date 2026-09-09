using BSB.Base;
using BSB.Interfaces;
namespace BSB.Plugins.Winston;
public sealed class Plugin(ServiceConstructorArgs<ConsoleLoggingConfig> args) : ConsoleLogging(args)
{
    public static BSBPluginMetadata Metadata => new() { Name = "observable-winston", Description = "Native structured console and rotating file logging", Category = PluginType.Observable };
}
