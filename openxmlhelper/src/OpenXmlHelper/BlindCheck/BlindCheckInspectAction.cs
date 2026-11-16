using System.Diagnostics;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Savia.OpenXmlHelper.BlindCheck.Model;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;
using Savia.OpenXmlHelper.BlindCheck.Rules;
using Savia.OpenXmlHelper.Jobs;

namespace Savia.OpenXmlHelper.BlindCheck;

sealed class SensitiveWord
{
    public string Text { get; set; } = "";
    /// <summary>custom: sensitive words from the preset; credential: this company's credential-library information.</summary>
    public string Source { get; set; } = "custom";
}

/// <summary>Main's conclusion for one image sampled with nativeImage.</summary>
sealed class ImageFact
{
    public string Part { get; set; } = "";
    public bool Color { get; set; }

    [JsonPropertyName("color_ratio")]
    public double ColorRatio { get; set; }
}

class BlindCheckInspectRequest
{
    public string Action { get; set; } = "";
    public string Source { get; set; } = "";
    public JsonObject? Profile { get; set; }

    [JsonPropertyName("sensitive_words")]
    public List<SensitiveWord> SensitiveWords { get; set; } = [];

    [JsonPropertyName("image_facts")]
    public List<ImageFact> ImageFacts { get; set; } = [];

    /// <summary>Whether to infer headings from numbering when no table of contents is available. Pass false when repairs removed the original heading-identification source, preserving the original recognition method.</summary>
    [JsonPropertyName("heading_fallback")]
    public bool HeadingFallback { get; set; } = true;
}

sealed class BlindCheckStats
{
    public int Paragraphs { get; init; }
    public int BodyParagraphs { get; init; }
    public int TableParagraphs { get; init; }
    public int Tables { get; init; }
    public int Sections { get; init; }
    public int TocEntries { get; init; }
    public int Headings { get; init; }
    public Dictionary<string, int> HeadingSources { get; init; } = [];
    public int CoverParagraphs { get; init; }
    public int Images { get; init; }
    public Dictionary<string, int> ImageFormats { get; init; } = [];
    public int VectorImages { get; init; }
    public int RulesChecked { get; init; }
    public long DurationMs { get; init; }
}

sealed class BlindCheckReport
{
    public int Version { get; init; } = 1;
    public Dictionary<string, int> Summary { get; init; } = [];
    public BlindCheckStats Stats { get; init; } = new();
    public List<FindingGroup> Groups { get; init; } = [];
    public List<string> RuleErrors { get; init; } = [];
}

/// <summary>
/// Anonymous-bid compliance checking: read workspace docx, run preset rules, aggregate findings, and write results.
/// Write progress.json atomically in the job directory; preserve the signal format.
/// </summary>
static class BlindCheckInspectAction
{
    public const string Name = "blind-check-inspect";
    public const string ProgressFileName = "progress.json";
    public const string OutputFileName = "blind-check-result.json";

    static readonly JsonSerializerOptions OutputOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static JobResult Execute(string workspace, string jobId)
    {
        string jobDir;
        BlindCheckInspectRequest request;
        try
        {
            jobDir = JobFolder.GetJobDirectory(workspace, jobId);
            var json = File.ReadAllText(Path.Combine(jobDir, JobFolder.RequestFileName), Encoding.UTF8);
            request = JsonSerializer.Deserialize<BlindCheckInspectRequest>(json, JsonOptions.File) ?? throw new InvalidOperationException("request.json 无效");
        }
        catch (Exception exception)
        {
            return JobResult.Fail($"无法读取 request.json：{exception.Message}");
        }

        var progress = new ProgressWriter(Path.Combine(jobDir, ProgressFileName));
        try
        {
            var sourcePath = WordWorkspace.ResolveWorkspacePath(workspace, request.Source);
            if (!File.Exists(sourcePath)) return JobResult.Fail("找不到待检查的文档，请重新选择文件");

            using var session = BlindCheckSession.Open(sourcePath, request, new ProgressRange(progress, 0, 0.45));
            var report = session.Inspect(new ProgressRange(progress, 0.45, 0.98));
            WriteJson(Path.Combine(jobDir, OutputFileName), report);
            progress.Report(0.99, "检查完成");
            return JobResult.Success(Name, OutputFileName);
        }
        catch (InvalidOperationException exception)
        {
            return JobResult.Fail(exception.Message);
        }
        catch (Exception exception)
        {
            return JobResult.Fail(UnexpectedMessage("暗标检查失败", exception));
        }
    }

    public static void WriteJson(string path, object value)
    {
        File.WriteAllText(path, JsonSerializer.Serialize(value, OutputOptions), new UTF8Encoding(false));
    }

    /// <summary>Preserve unexpected exception types and initial stack frames to diagnose user reports.</summary>
    public static string UnexpectedMessage(string title, Exception exception)
    {
        var stack = string.Join('\n', (exception.StackTrace ?? "").Split('\n').Take(8).Select(line => line.TrimEnd()));
        return $"{title}：{exception.GetType().Name}: {exception.Message}\n{stack}";
    }
}
