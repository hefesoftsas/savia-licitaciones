using Savia.OpenXmlHelper.Host;
using Savia.OpenXmlHelper.Jobs;

var workspace = ParseWorkspace(args);
if (string.IsNullOrWhiteSpace(workspace) || !Directory.Exists(workspace))
{
    Console.Error.WriteLine("Missing valid --workspace directory");
    return 1;
}

StdioLoop.ConfigureUtf8();
var runner = new JobRunner(Path.GetFullPath(workspace));
await StdioLoop.RunAsync(runner);
return 0;

/// <summary>Parse the --workspace argument.</summary>
static string? ParseWorkspace(string[] arguments)
{
    for (var index = 0; index < arguments.Length; index += 1)
    {
        if (arguments[index] == "--workspace" && index + 1 < arguments.Length)
        {
            return arguments[index + 1].Trim();
        }
    }

    return null;
}
