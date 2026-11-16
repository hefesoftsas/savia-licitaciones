using System.Text.Encodings.Web;
using System.Text.Json;

namespace Savia.OpenXmlHelper;

/// <summary>Shared JSON serialization: compact signals and readable task files.</summary>
static class JsonOptions
{
    public static readonly JsonSerializerOptions Signal = Create(writeIndented: false);
    public static readonly JsonSerializerOptions File = Create(writeIndented: true);

    static JsonSerializerOptions Create(bool writeIndented)
    {
        return new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            WriteIndented = writeIndented,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        };
    }
}
