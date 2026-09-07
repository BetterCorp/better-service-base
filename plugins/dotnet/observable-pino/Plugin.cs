using BSB.Base;
using BSB.Interfaces;
namespace BSB.Plugins.Pino;
public sealed class Plugin(ServiceConstructorArgs<ConsoleLoggingConfig> args) : ConsoleLogging(args)
{
    public static BSBPluginMetadata Metadata => new() { Name = "observable-pino", Description = "Native JSON console logging with numeric levels and redaction", Category = PluginType.Observable };
    protected override bool NumericLevel => true;
}
