using System;
using System.Diagnostics;
using System.IO;
using System.Security;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using BSB.Interfaces;
using BSB.Runtime;
using BSB.Tooling;

public static class IntegerClientChecks
{
    public static async Task Run()
    {
        var document = JsonNode.Parse("""
        {"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"object","properties":{"value":{"kind":"int"}},"required":["value"]},"definitions":{},"extensions":{}}
        """)!.AsObject();
        var schema = BSBType.Import(document);
        foreach (var value in new[] { 9007199254740993L, long.MaxValue })
            if (!schema.Validate(new { value })) throw new Exception($"AnyVali generic int rejected {value}");

        var literalDocument = JsonNode.Parse("""
        {"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"object","properties":{"value":{"kind":"int"},"signed":{"kind":"literal","value":9007199254740993},"signedExponent":{"kind":"literal","value":9007199254740993e0},"unsigned":{"kind":"literal","value":18446744073709551615},"fractional":{"kind":"literal","value":0.5}},"required":["value","signed","signedExponent","unsigned","fractional"]},"definitions":{},"extensions":{}}
        """)!.AsObject();
        var contract = new EventSchemaExport { PluginName = "service-integer", Version = "1.0.0", Events = new() {
            ["echo"] = new ExportedEvent { Category = "onReturnableEvents", Type = "returnable",
                InputSchema = literalDocument, OutputSchema = literalDocument, DefaultTimeoutSeconds = .5 }
        } };
        var directory = Directory.CreateTempSubdirectory("bsb-integer-client-").FullName;
        try
        {
            await File.WriteAllTextAsync(Path.Combine(directory, "Integer.cs"), ClientGenerator.Generate(contract, "integer"));
            var reference = SecurityElement.Escape(typeof(ServiceBase).Assembly.Location);
            await File.WriteAllTextAsync(Path.Combine(directory, "IntegerCheck.csproj"), $"""
            <Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable></PropertyGroup>
            <ItemGroup><Reference Include="BSB"><HintPath>{reference}</HintPath></Reference></ItemGroup></Project>
            """);
            await File.WriteAllTextAsync(Path.Combine(directory, "Program.cs"), """
            using System;
            using System.Text.Json;
            foreach (var value in new[] { 9007199254740993L, long.MaxValue })
            {
                var outbound = new IntegerClientEchoInput { Value = value, Signed = 9007199254740993L, SignedExponent = 9007199254740993L, Unsigned = ulong.MaxValue, Fractional = .5 };
                var json = JsonSerializer.Serialize(outbound);
                if (JsonDocument.Parse(json).RootElement.GetProperty("value").GetInt64() != value) throw new Exception("Outbound integer precision lost");
                if (JsonDocument.Parse(json).RootElement.GetProperty("signed").GetInt64() != 9007199254740993L) throw new Exception("Signed literal precision lost");
                if (JsonDocument.Parse(json).RootElement.GetProperty("signedExponent").GetInt64() != 9007199254740993L) throw new Exception("Exponent literal precision lost");
                if (JsonDocument.Parse(json).RootElement.GetProperty("unsigned").GetUInt64() != ulong.MaxValue) throw new Exception("Unsigned literal precision lost");
                var inbound = JsonSerializer.Deserialize<IntegerClientEchoOutput>(json)!;
                if (inbound.Value != value || inbound.Signed != 9007199254740993L || inbound.SignedExponent != 9007199254740993L || inbound.Unsigned != ulong.MaxValue || inbound.Fractional != .5)
                    throw new Exception("Inbound numeric precision lost");
            }
            """);
            var start = new ProcessStartInfo("dotnet")
            {
                WorkingDirectory = directory,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            start.ArgumentList.Add("run");
            start.ArgumentList.Add("--project");
            start.ArgumentList.Add("IntegerCheck.csproj");
            using var process = Process.Start(start)!;
            var stdout = process.StandardOutput.ReadToEndAsync();
            var stderr = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();
            if (process.ExitCode != 0) throw new Exception(await stdout + await stderr);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
        Console.WriteLine("PASS: generated generic integers and numeric literals preserve signed, unsigned and fractional precision");
    }
}
