namespace BSB.Runtime;

using BSB.Base;
using BSB.Interfaces;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;

/// <summary>
/// Result of loading a plugin from an assembly.
/// </summary>
internal record LoadedPlugin(
    string Name,
    Type PluginType,
    Type? ConfigType,
    BSBPluginMetadata? Metadata,
    string AssemblyPath);

/// <summary>
/// Plugin loader. Discovers and loads plugins dynamically from assemblies (DLLs).
///
/// Search order (mirrors Node.js):
///   1. BSB_PLUGIN_DIR / BSB_PLUGINS_DIR env var (external plugin directory)
///   2. {cwd}/plugins/ (local plugin directory)
///
/// Plugins are assemblies containing types that extend BSBConfig, BSBObservable,
/// BSBEvents, BSBService, or BSBServiceClient. Each assembly is loaded into
/// an isolated AssemblyLoadContext.
///
/// The framework exports a "Plugin" class from each plugin assembly -- the loader
/// scans for types extending the BSB base classes and matches them by plugin name.
/// </summary>
public class SBPlugins
{
    private readonly string _cwd;
    private readonly string? _pluginDir;
    private readonly Dictionary<string, LoadedPlugin> _cache = new();
    private readonly Dictionary<string, AssemblyLoadContext> _loadContexts = new();
    private IObservable? _obs;

    public SBPlugins(string cwd)
    {
        _cwd = cwd;
        _pluginDir = Environment.GetEnvironmentVariable("BSB_PLUGIN_DIR")
            ?? Environment.GetEnvironmentVariable("BSB_PLUGINS_DIR");
    }

    /// <summary>
    /// Set the observable for logging during plugin loading.
    /// </summary>
    internal void SetObservable(IObservable obs) => _obs = obs;

    // -----------------------------------------------------------------
    // Public loading API - called by ServiceBase for each plugin type
    // -----------------------------------------------------------------

    /// <summary>
    /// Load and instantiate a config plugin by definition.
    /// </summary>
    internal BSBConfig CreateConfigInstance(PluginDefinition def, PluginConstructorArgs args)
    {
        var loaded = LoadPlugin(def, typeof(BSBConfig));
        return (BSBConfig)Activator.CreateInstance(loaded.PluginType, args)!;
    }

    /// <summary>
    /// Load and instantiate an observable plugin by definition.
    /// </summary>
    internal IObservablePlugin CreateObservableInstance(PluginDefinition def, PluginConstructorArgs baseArgs, object? config)
    {
        var loaded = LoadPlugin(def, typeof(BSBObservable<>));
        var ctorArgs = BuildServiceConstructorArgs(loaded.PluginType, baseArgs, config);
        return (IObservablePlugin)Activator.CreateInstance(loaded.PluginType, ctorArgs)!;
    }

    /// <summary>
    /// Load and instantiate an events plugin by definition.
    /// </summary>
    internal BSBEvents CreateEventsInstance(PluginDefinition def, PluginConstructorArgs args)
    {
        var loaded = LoadPlugin(def, typeof(BSBEvents));
        return (BSBEvents)Activator.CreateInstance(loaded.PluginType, args)!;
    }

    /// <summary>
    /// Load and instantiate a service plugin by definition.
    /// Returns MainBase because the generic type is resolved at runtime.
    /// </summary>
    internal MainBase CreateServiceInstance(PluginDefinition def, PluginConstructorArgs baseArgs, object? config)
    {
        var loaded = LoadPlugin(def, typeof(BSBService<>));
        var ctorArgs = BuildServiceConstructorArgs(loaded.PluginType, baseArgs, config);
        return (MainBase)Activator.CreateInstance(loaded.PluginType, ctorArgs)!;
    }

    /// <summary>
    /// Get metadata for a loaded plugin. Returns null if not loaded.
    /// </summary>
    internal BSBPluginMetadata? GetMetadata(string name)
    {
        return _cache.GetValueOrDefault(name)?.Metadata;
    }

    // -----------------------------------------------------------------
    // Plugin loading - assembly discovery and type scanning
    // -----------------------------------------------------------------

    /// <summary>
    /// Load a plugin by its definition. Searches for the assembly, loads it,
    /// and finds the plugin type matching the expected base class.
    /// Results are cached by plugin name.
    /// </summary>
    private LoadedPlugin LoadPlugin(PluginDefinition def, Type expectedBaseType)
    {
        var pluginName = def.ResolvedPluginName;
        var cacheKey = $"{def.Package ?? "local"}:{pluginName}";

        if (_cache.TryGetValue(cacheKey, out var cached))
            return cached;

        _obs?.Log.Debug("Loading plugin: {name} (package: {package})",
            new LogMeta { ["name"] = pluginName, ["package"] = def.Package ?? "local" });

        // Find the assembly file
        var assemblyPath = ResolveAssemblyPath(def);
        if (assemblyPath is null)
        {
            throw new FileNotFoundException(
                $"Plugin assembly not found for '{pluginName}'" +
                (def.Package is not null ? $" in package '{def.Package}'" : "") +
                $". Searched: {string.Join(", ", GetSearchPaths(def))}");
        }

        // Load the assembly in an isolated context
        var context = new AssemblyLoadContext(pluginName, isCollectible: false);
        _loadContexts[cacheKey] = context;

        // Set up dependency resolution so the plugin can find BSB.dll and other deps
        context.Resolving += (ctx, assemblyName) =>
        {
            // Try to find the dependency next to the plugin assembly
            var dir = Path.GetDirectoryName(assemblyPath)!;
            var depPath = Path.Combine(dir, assemblyName.Name + ".dll");
            if (File.Exists(depPath))
                return ctx.LoadFromAssemblyPath(depPath);

            // Fall back to default context (BSB framework assemblies)
            try { return AssemblyLoadContext.Default.LoadFromAssemblyName(assemblyName); }
            catch { return null; }
        };

        var assembly = context.LoadFromAssemblyPath(assemblyPath);

        // Find the plugin type in the assembly
        var pluginType = FindPluginType(assembly, expectedBaseType, pluginName);
        if (pluginType is null)
        {
            throw new InvalidOperationException(
                $"Assembly '{assemblyPath}' does not contain a type extending " +
                $"'{expectedBaseType.Name}' for plugin '{pluginName}'. " +
                $"Ensure the assembly exports a public class named 'Plugin' or " +
                $"a class extending the appropriate BSB base class.");
        }

        // Extract metadata from static property
        var metadata = ExtractMetadata(pluginType);
        var configType = FindGenericConfigType(pluginType);

        var loaded = new LoadedPlugin(pluginName, pluginType, configType, metadata, assemblyPath);
        _cache[cacheKey] = loaded;

        _obs?.Log.Info("Loaded plugin: {name} ({type}) from {path}",
            new LogMeta
            {
                ["name"] = pluginName,
                ["type"] = pluginType.Name,
                ["path"] = assemblyPath,
            });

        return loaded;
    }

    // -----------------------------------------------------------------
    // Assembly path resolution - mirrors Node.js search order
    // -----------------------------------------------------------------

    /// <summary>
    /// Resolve the path to a plugin's assembly DLL.
    /// Search order:
    ///   1. BSB_PLUGIN_DIR/{package}/{version}/{plugin}.dll
    ///   2. {cwd}/plugins/{plugin}/{plugin}.dll
    ///   3. {cwd}/plugins/{plugin}.dll
    /// </summary>
    private string? ResolveAssemblyPath(PluginDefinition def)
    {
        var pluginName = def.ResolvedPluginName;

        // 1. External plugin directory (BSB_PLUGIN_DIR)
        if (_pluginDir is not null && def.Package is not null)
        {
            var path = ResolveFromPluginDir(def.Package, pluginName, def.Version);
            if (path is not null) return path;
        }

        // 2. External plugin directory without package (search by plugin name)
        if (_pluginDir is not null)
        {
            var path = ResolveFromPluginDir(pluginName, pluginName, def.Version);
            if (path is not null) return path;
        }

        // 3. Local plugins directory: {cwd}/plugins/{pluginName}/{pluginName}.dll
        var localDir = Path.Combine(_cwd, "plugins", pluginName);
        if (Directory.Exists(localDir))
        {
            var localDll = Path.Combine(localDir, pluginName + ".dll");
            if (File.Exists(localDll)) return Path.GetFullPath(localDll);

            // Also check for any .dll in the directory
            var dlls = Directory.GetFiles(localDir, "*.dll");
            if (dlls.Length > 0) return Path.GetFullPath(dlls[0]);
        }

        // 4. Flat: {cwd}/plugins/{pluginName}.dll
        var flatDll = Path.Combine(_cwd, "plugins", pluginName + ".dll");
        if (File.Exists(flatDll)) return Path.GetFullPath(flatDll);

        return null;
    }

    /// <summary>
    /// Resolve a plugin assembly from the external plugin directory.
    /// Supports versioned layout: {pluginDir}/{package}/{major}/{minor}/{patch}/{plugin}.dll
    /// Also supports flat: {pluginDir}/{package}/{plugin}.dll
    /// </summary>
    private string? ResolveFromPluginDir(string package_, string pluginName, string? requestedVersion)
    {
        var packageDir = Path.Combine(_pluginDir!, package_);
        if (!Directory.Exists(packageDir)) return null;

        // Try versioned layout: {package}/{M}/{m}/{p}/
        var versions = ListVersions(packageDir);
        if (versions.Count > 0)
        {
            var resolved = ResolveVersion(versions, requestedVersion);
            if (resolved is not null)
            {
                var versionedDll = Path.Combine(resolved, pluginName + ".dll");
                if (File.Exists(versionedDll)) return Path.GetFullPath(versionedDll);

                // Check subdirectory
                var subDir = Path.Combine(resolved, pluginName);
                if (Directory.Exists(subDir))
                {
                    var dll = Path.Combine(subDir, pluginName + ".dll");
                    if (File.Exists(dll)) return Path.GetFullPath(dll);
                }
            }
        }

        // Flat layout: {package}/{plugin}.dll
        var flatDll = Path.Combine(packageDir, pluginName + ".dll");
        if (File.Exists(flatDll)) return Path.GetFullPath(flatDll);

        return null;
    }

    /// <summary>
    /// List available versions from a versioned plugin directory.
    /// Returns sorted list of (version string, path) pairs.
    /// Supports layout: {dir}/{major}/{minor}/{patch}/
    /// </summary>
    private static List<(Version Version, string Path)> ListVersions(string dir)
    {
        var result = new List<(Version, string)>();

        foreach (var majorDir in Directory.GetDirectories(dir))
        {
            if (!int.TryParse(Path.GetFileName(majorDir), out var major)) continue;

            foreach (var minorDir in Directory.GetDirectories(majorDir))
            {
                if (!int.TryParse(Path.GetFileName(minorDir), out var minor)) continue;

                foreach (var patchDir in Directory.GetDirectories(minorDir))
                {
                    if (!int.TryParse(Path.GetFileName(patchDir), out var patch)) continue;
                    result.Add((new Version(major, minor, patch), patchDir));
                }
            }
        }

        result.Sort((a, b) => b.Item1.CompareTo(a.Item1)); // Descending
        return result;
    }

    /// <summary>
    /// Resolve a version from the available versions using a selector.
    /// Selector formats: "1.0.3" (exact), "1.0" (latest 1.0.x), null (latest).
    /// </summary>
    private static string? ResolveVersion(List<(Version Version, string Path)> versions, string? selector)
    {
        if (versions.Count == 0) return null;
        if (string.IsNullOrEmpty(selector)) return versions[0].Path; // Latest

        var parts = selector.Split('.');
        if (parts.Length == 3
            && int.TryParse(parts[0], out var major)
            && int.TryParse(parts[1], out var minor)
            && int.TryParse(parts[2], out var patch))
        {
            // Exact match
            var exact = new Version(major, minor, patch);
            return versions.FirstOrDefault(v => v.Version == exact).Path;
        }

        if (parts.Length == 2
            && int.TryParse(parts[0], out var maj)
            && int.TryParse(parts[1], out var min))
        {
            // Latest patch for major.minor
            return versions
                .Where(v => v.Version.Major == maj && v.Version.Minor == min)
                .Select(v => v.Path)
                .FirstOrDefault();
        }

        return versions[0].Path; // Fall back to latest
    }

    /// <summary>
    /// Get all search paths for error reporting.
    /// </summary>
    private List<string> GetSearchPaths(PluginDefinition def)
    {
        var paths = new List<string>();
        var pluginName = def.ResolvedPluginName;

        if (_pluginDir is not null)
        {
            if (def.Package is not null)
                paths.Add(Path.Combine(_pluginDir, def.Package));
            paths.Add(Path.Combine(_pluginDir, pluginName));
        }

        paths.Add(Path.Combine(_cwd, "plugins", pluginName));
        paths.Add(Path.Combine(_cwd, "plugins", pluginName + ".dll"));
        return paths;
    }

    // -----------------------------------------------------------------
    // Type scanning - find plugin types in loaded assemblies
    // -----------------------------------------------------------------

    /// <summary>
    /// Find a plugin type in an assembly that extends the expected base class.
    /// Priority: class named "Plugin" > any class extending the base.
    /// </summary>
    private static Type? FindPluginType(Assembly assembly, Type expectedBaseType, string pluginName)
    {
        Type? fallback = null;

        foreach (var type in assembly.GetExportedTypes())
        {
            if (type.IsAbstract || type.IsInterface) continue;
            if (!ExtendsBase(type, expectedBaseType)) continue;

            // Prefer a class named "Plugin" (convention from Node.js)
            if (type.Name == "Plugin")
                return type;

            fallback ??= type;
        }

        return fallback;
    }

    /// <summary>
    /// Check if a type extends the expected base class (handles open generics).
    /// </summary>
    private static bool ExtendsBase(Type type, Type expectedBase)
    {
        var current = type.BaseType;
        while (current is not null)
        {
            if (expectedBase.IsGenericTypeDefinition)
            {
                if (current.IsGenericType && current.GetGenericTypeDefinition() == expectedBase)
                    return true;
            }
            else
            {
                if (current == expectedBase || expectedBase.IsAssignableFrom(current))
                    return true;
            }
            current = current.BaseType;
        }
        return false;
    }

    /// <summary>
    /// Extract BSBPluginMetadata from a plugin type's static Metadata property.
    /// </summary>
    private static BSBPluginMetadata? ExtractMetadata(Type pluginType)
    {
        var prop = pluginType.GetProperty("Metadata",
            BindingFlags.Static | BindingFlags.Public | BindingFlags.FlattenHierarchy);
        return prop?.GetValue(null) as BSBPluginMetadata;
    }

    // -----------------------------------------------------------------
    // Constructor args building
    // -----------------------------------------------------------------

    /// <summary>
    /// Build a ServiceConstructorArgs&lt;TConfig&gt; for a plugin type.
    /// The TConfig type is extracted from the plugin's generic base class.
    /// </summary>
    internal static object BuildServiceConstructorArgs(Type pluginType, PluginConstructorArgs baseArgs, object? config)
    {
        var configType = FindGenericConfigType(pluginType)
            ?? throw new InvalidOperationException(
                $"Plugin type '{pluginType.FullName}' does not extend a generic base with a config type parameter");

        var ctorArgsType = typeof(ServiceConstructorArgs<>).MakeGenericType(configType);
        var ctorArgs = Activator.CreateInstance(ctorArgsType, nonPublic: true)!;

        ctorArgsType.GetProperty(nameof(PluginConstructorArgs.AppId))!.SetValue(ctorArgs, baseArgs.AppId);
        ctorArgsType.GetProperty(nameof(PluginConstructorArgs.Mode))!.SetValue(ctorArgs, baseArgs.Mode);
        ctorArgsType.GetProperty(nameof(PluginConstructorArgs.PluginName))!.SetValue(ctorArgs, baseArgs.PluginName);
        ctorArgsType.GetProperty(nameof(PluginConstructorArgs.Cwd))!.SetValue(ctorArgs, baseArgs.Cwd);
        ctorArgsType.GetProperty(nameof(PluginConstructorArgs.Region))!.SetValue(ctorArgs, baseArgs.Region);

        // Set Config property, deserializing from JsonElement if needed
        var configProp = ctorArgsType.GetProperty("Config")!;
        if (config is not null && configType.IsAssignableFrom(config.GetType()))
        {
            configProp.SetValue(ctorArgs, config);
        }
        else if (config is JsonElement jsonElement)
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var deserialized = JsonSerializer.Deserialize(jsonElement.GetRawText(), configType, options)
                ?? CreateDefaultConfig(configType);
            configProp.SetValue(ctorArgs, deserialized);
        }
        else
        {
            configProp.SetValue(ctorArgs, CreateDefaultConfig(configType));
        }

        return ctorArgs;
    }

    /// <summary>
    /// Walk the type hierarchy to find the TConfig generic type argument.
    /// </summary>
    private static Type? FindGenericConfigType(Type pluginType)
    {
        var current = pluginType.BaseType;
        while (current is not null)
        {
            if (current.IsGenericType)
            {
                var genDef = current.GetGenericTypeDefinition();
                if (genDef == typeof(BSBObservable<>) || genDef == typeof(BSBService<>)
                    || genDef == typeof(BSBServiceClient<>))
                {
                    return current.GetGenericArguments()[0];
                }
            }
            current = current.BaseType;
        }
        return null;
    }

    /// <summary>
    /// Create a default instance of a config type using its parameterless constructor.
    /// </summary>
    private static object CreateDefaultConfig(Type configType)
    {
        try
        {
            return Activator.CreateInstance(configType)!;
        }
        catch
        {
            throw new InvalidOperationException(
                $"Cannot create default config for type '{configType.FullName}'. " +
                "Ensure it has a parameterless constructor or provide config explicitly.");
        }
    }
}
