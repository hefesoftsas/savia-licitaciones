using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Savia.OpenXmlHelper.Jobs;

/// <summary>Task request.</summary>
sealed class JobRequest
{
    public string Action { get; set; } = "";
}

/// <summary>Task result.</summary>
sealed class JobResult
{
    public bool Ok { get; set; }
    public string? Action { get; set; }
    public string? Error { get; set; }
    public string? Output { get; set; }
    public int? BlockCount { get; set; }

    /// <summary>Body paragraph roles in document order, used by preview to locate paragraphs for incremental style updates.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<string>? ParagraphRoles { get; set; }

    /// <summary>Images that could not be exported and were replaced in place with text notices, with reasons.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<ImageWarning>? ImageWarnings { get; set; }

    public static JobResult Success(string action, string? output = null, int? blockCount = null) => new()
    {
        Ok = true,
        Action = action,
        Output = output,
        BlockCount = blockCount,
    };

    public static JobResult Fail(string error) => new() { Ok = false, Error = error };
}

/// <summary>Resolve task directories and read/write request / result files.</summary>
static class JobFolder
{
    public const string JobsFolderName = "openxml-jobs";
    public const string RequestFileName = "request.json";
    public const string ResultFileName = "result.json";

    static readonly Regex JobIdPattern = new("^(?!\\.\\.?$)[A-Za-z0-9._-]+$", RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>Validate task IDs to prevent path traversal.</summary>
    public static bool IsValidJobId(string jobId)
    {
        return !string.IsNullOrWhiteSpace(jobId) && JobIdPattern.IsMatch(jobId);
    }

    public static string GetJobDirectory(string workspace, string jobId)
    {
        var jobsRoot = Path.GetFullPath(Path.Combine(workspace, JobsFolderName));
        var jobDir = Path.GetFullPath(Path.Combine(jobsRoot, jobId));
        if (!IsInsideDirectory(jobsRoot, jobDir))
        {
            throw new InvalidOperationException("Job directory escapes workspace");
        }

        return jobDir;
    }

    /// <summary>Read request.json; return a failure reason if the directory or file is missing.</summary>
    public static bool TryReadRequest(string workspace, string jobId, out JobRequest request, out string error)
    {
        request = new JobRequest();
        error = "";
        string jobDir;
        try
        {
            jobDir = GetJobDirectory(workspace, jobId);
        }
        catch (Exception exception)
        {
            error = exception.Message;
            return false;
        }

        if (!Directory.Exists(jobDir))
        {
            error = "Job directory not found";
            return false;
        }

        var requestPath = Path.Combine(jobDir, RequestFileName);
        if (!File.Exists(requestPath))
        {
            error = "request.json not found";
            return false;
        }

        try
        {
            var json = File.ReadAllText(requestPath, Encoding.UTF8);
            var parsed = JsonSerializer.Deserialize<JobRequest>(json, JsonOptions.File);
            if (parsed is null || string.IsNullOrWhiteSpace(parsed.Action))
            {
                error = "request.json is missing action";
                return false;
            }

            request = parsed;
            request.Action = parsed.Action.Trim();
            return true;
        }
        catch (Exception exception)
        {
            error = $"Unable to read request.json: {exception.Message}";
            return false;
        }
    }

    /// <summary>Write result.json. Return false if the directory is missing.</summary>
    public static bool TryWriteResult(string workspace, string jobId, JobResult result)
    {
        try
        {
            var jobDir = GetJobDirectory(workspace, jobId);
            if (!Directory.Exists(jobDir))
            {
                return false;
            }

            var json = JsonSerializer.Serialize(result, JsonOptions.File);
            File.WriteAllText(Path.Combine(jobDir, ResultFileName), json + "\n", new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            return true;
        }
        catch
        {
            return false;
        }
    }

    static bool IsInsideDirectory(string parent, string child)
    {
        var root = Path.GetFullPath(parent)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(child);
        return full.StartsWith(root, StringComparison.OrdinalIgnoreCase);
    }
}
