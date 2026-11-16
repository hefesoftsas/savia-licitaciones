using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Savia.OpenXmlHelper.Jobs;

sealed class RenderRestrictedHtmlDocxRequest
{
    public string Action { get; set; } = "";
    public string Html { get; set; } = "";
    public string Output { get; set; } = "preview.docx";

    /// <summary>Whole-document export formats program-marked style ranges; ordinary sections and samples retain their existing path.</summary>
    [JsonPropertyName("whole_document")]
    public bool WholeDocument { get; set; }

    /// <summary>Image directory relative to the workspace; use the task directory when empty.</summary>
    [JsonPropertyName("asset_root")]
    public string AssetRoot { get; set; } = "";

    /// <summary>Image types declared by Main from extensions, keyed by data-sv-asset-ref; used for unchanged embedding only when file headers are unrecognized.</summary>
    [JsonPropertyName("asset_types")]
    public Dictionary<string, string>? AssetTypes { get; set; }

    [JsonPropertyName("export_format")]
    public JsonElement ExportFormat { get; set; }

    /// <summary>Header/footer decoration images and text-layer descriptions produced by the renderer's shared SVG generator.</summary>
    [JsonPropertyName("chrome_assets")]
    public JsonElement ChromeAssets { get; set; }
}

/// <summary>Generate a new Word document from restricted HTML and export-template settings.</summary>
static class RenderRestrictedHtmlDocxAction
{
    public const string Name = "render-restricted-html-docx";

    /// <summary>Read task parameters and generate a docx in the current task directory.</summary>
    public static JobResult Execute(string workspace, string jobId)
    {
        try
        {
            var jobDirectory = JobFolder.GetJobDirectory(workspace, jobId);
            var requestPath = Path.Combine(jobDirectory, JobFolder.RequestFileName);
            var request = JsonSerializer.Deserialize<RenderRestrictedHtmlDocxRequest>(
                File.ReadAllText(requestPath, Encoding.UTF8),
                JsonOptions.File);
            if (request is null
                || string.IsNullOrWhiteSpace(request.Html)
                || request.ExportFormat.ValueKind != JsonValueKind.Object)
            {
                return JobResult.Fail("request.json 缺少 html 或 export_format");
            }

            var outputName = string.IsNullOrWhiteSpace(request.Output) ? "preview.docx" : request.Output.Trim();
            if (!string.Equals(outputName, Path.GetFileName(outputName), StringComparison.Ordinal)
                || !string.Equals(Path.GetExtension(outputName), ".docx", StringComparison.OrdinalIgnoreCase))
            {
                return JobResult.Fail("output 必须是当前任务目录内的 docx 文件名");
            }

            // Sample images stay unchanged across previews; allow a shared directory to avoid copying them for each task.
            var assetRoot = string.IsNullOrWhiteSpace(request.AssetRoot)
                ? jobDirectory
                : WordWorkspace.ResolveWorkspacePath(workspace, request.AssetRoot);
            if (!Directory.Exists(assetRoot))
            {
                return JobResult.Fail($"配图目录不存在：{request.AssetRoot}");
            }

            // Store header/footer decorations separately from images: decorations change with settings, while sample images remain constant across previews.
            var chrome = ChromeAssets.From(workspace, request.ChromeAssets);

            var outputPath = Path.Combine(jobDirectory, outputName);
            var rendered = RestrictedHtmlDocumentRenderer.Render(
                assetRoot,
                outputPath,
                request.Html,
                request.ExportFormat,
                chrome,
                request.WholeDocument,
                request.AssetTypes);
            var result = JobResult.Success(Name, outputName, rendered.BlockCount);
            result.ParagraphRoles = rendered.ParagraphRoles;
            result.ImageWarnings = rendered.ImageWarnings;
            return result;
        }
        catch (Exception exception)
        {
            return JobResult.Fail(exception.Message);
        }
    }
}
