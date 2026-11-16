using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Fix;
using Savia.OpenXmlHelper.BlindCheck.Model;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;
using Savia.OpenXmlHelper.Jobs;

namespace Savia.OpenXmlHelper.BlindCheck.Review;

sealed class BlindCheckEditItem
{
    /// <summary>replace edits paragraph text; delete_paragraph removes a paragraph; clear_image_alt removes image alternative text and title.</summary>
    public string Op { get; set; } = "";
    /// <summary>Paragraph locator such as p12 or t3.r2.c1, or image locator such as img3.</summary>
    public string Target { get; set; } = "";
    public string Find { get; set; } = "";
    public string Replace { get; set; } = "";
}

sealed class BlindCheckEditRequest : BlindCheckInspectRequest
{
    /// <summary>Original document before edits, workspace-relative, used as the structural-validation baseline so preexisting defects are not attributed to this edit.</summary>
    public string Original { get; set; } = "";
    public List<BlindCheckEditItem> Edits { get; set; } = [];
}

sealed class BlindCheckEditOutcome
{
    public int Index { get; init; }
    public string Op { get; init; } = "";
    public string Target { get; init; } = "";
    public bool Ok { get; set; }
    public string Message { get; set; } = "";
    public string Before { get; init; } = "";
    public string After { get; init; } = "";
}

sealed class BlindCheckEditReport
{
    public int Applied { get; init; }
    public List<BlindCheckEditOutcome> Results { get; init; } = [];
    public FixValidationResult Validation { get; init; } = new();
    public DocumentDumpResult Dump { get; init; } = new();
}

/// <summary>
/// AI review text edits locate paragraphs by ID and replace one text occurrence, delete paragraphs, or clear image alternative text without changing formatting.
/// Replacement source must occur exactly once; compare Open XML validation against the original and roll back the entire batch on new errors.
/// Overwrite the source location after success and return updated structure for subsequent positioning, since paragraph deletion changes locators.
/// </summary>
static class BlindCheckEditAction
{
    public const string Name = "blind-check-edit";
    public const string OutputFileName = "blind-check-edit-result.json";
    const int MaxFindChars = 200;
    const int MaxReplaceChars = 300;

    public static JobResult Execute(string workspace, string jobId)
    {
        string jobDir;
        BlindCheckEditRequest request;
        try
        {
            jobDir = JobFolder.GetJobDirectory(workspace, jobId);
            var json = File.ReadAllText(Path.Combine(jobDir, JobFolder.RequestFileName), Encoding.UTF8);
            request = JsonSerializer.Deserialize<BlindCheckEditRequest>(json, JsonOptions.File) ?? throw new InvalidOperationException("request.json 无效");
        }
        catch (Exception exception)
        {
            return JobResult.Fail($"无法读取 request.json：{exception.Message}");
        }

        var progress = new ProgressWriter(Path.Combine(jobDir, BlindCheckInspectAction.ProgressFileName));
        string? tempPath = null;
        try
        {
            var sourcePath = WordWorkspace.ResolveWorkspacePath(workspace, request.Source);
            if (!File.Exists(sourcePath)) return JobResult.Fail("找不到要修改的文档，请重新修复");
            var originalPath = string.IsNullOrWhiteSpace(request.Original) ? sourcePath : WordWorkspace.ResolveWorkspacePath(workspace, request.Original);
            if (request.Edits.Count == 0) return JobResult.Fail("没有要执行的修改");

            var outcomes = new List<BlindCheckEditOutcome>();
            var applied = 0;
            using (var session = BlindCheckSession.Open(sourcePath, request, new ProgressRange(progress, 0, 0.35)))
            {
                var model = session.Context.Model;
                var paragraphs = model.Locators.GroupBy(item => item.Value).ToDictionary(group => group.Key, group => group.First().Key, StringComparer.Ordinal);
                var images = DocumentDump.CollectImages(model).ToDictionary(item => item.Id, StringComparer.Ordinal);
                var touched = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                for (var index = 0; index < request.Edits.Count; index += 1)
                {
                    var outcome = Apply(session, paragraphs, images, touched, request.Edits[index], index);
                    outcomes.Add(outcome);
                    if (outcome.Ok) applied += 1;
                }

                if (applied > 0)
                {
                    progress.Report(0.4, "正在写出修改");
                    var writer = new DocxWriter(session.Package);
                    foreach (var part in touched)
                    {
                        if (model.Parts.TryGetValue(part, out var document)) writer.SetXml(part, document);
                    }

                    tempPath = sourcePath + ".edit.docx";
                    writer.Save(tempPath);
                }
            }

            var validation = new FixValidationResult();
            if (tempPath is not null)
            {
                progress.Report(0.5, "正在校验修改后的文档");
                validation = FixValidation.Compare(originalPath, tempPath);
                if (validation.NewErrors.Count > 0)
                {
                    File.Delete(tempPath);
                    var reason = $"修改后的文档未通过 Word 文件结构校验，本批修改已全部撤销：{string.Join("；", validation.NewErrors.Take(3))}";
                    foreach (var outcome in outcomes.Where(item => item.Ok))
                    {
                        outcome.Ok = false;
                        outcome.Message = reason;
                    }

                    applied = 0;
                }
                else
                {
                    File.Move(tempPath, sourcePath, overwrite: true);
                }

                tempPath = null;
            }

            DocumentDumpResult dump;
            using (var session = BlindCheckSession.Open(sourcePath, request, new ProgressRange(progress, 0.6, 0.95)))
            {
                dump = DocumentDump.Build(session.Context);
            }

            BlindCheckInspectAction.WriteJson(Path.Combine(jobDir, OutputFileName), new BlindCheckEditReport
            {
                Applied = applied,
                Results = outcomes,
                Validation = validation,
                Dump = dump,
            });
            progress.Report(0.99, "修改完成");
            return JobResult.Success(Name, OutputFileName);
        }
        catch (InvalidOperationException exception)
        {
            TryDelete(tempPath);
            return JobResult.Fail(exception.Message);
        }
        catch (Exception exception)
        {
            TryDelete(tempPath);
            return JobResult.Fail(BlindCheckInspectAction.UnexpectedMessage("修改文档失败", exception));
        }
    }

    static BlindCheckEditOutcome Apply(BlindCheckSession session, Dictionary<string, XElement> paragraphs, Dictionary<string, DumpImage> images, HashSet<string> touched, BlindCheckEditItem edit, int index)
    {
        var op = (edit.Op ?? "").Trim();
        var target = (edit.Target ?? "").Trim();
        BlindCheckEditOutcome Fail(string message) => new() { Index = index, Op = op, Target = target, Message = message };

        if (op == "clear_image_alt")
        {
            if (!images.TryGetValue(target, out var image) || image.Element is null) return Fail($"找不到图片 {target}，请按标书结构里的 img 编号提交");
            var before = image.Description;
            foreach (var name in new[] { "descr", "title", "alt" }) image.Element.Attribute(name)?.Remove();
            image.Element.Element(W.V + "imagedata")?.Attribute(XNamespace.Get("urn:schemas-microsoft-com:office:office") + "title")?.Remove();
            touched.Add(image.SourcePart);
            return new BlindCheckEditOutcome { Index = index, Op = op, Target = target, Ok = true, Message = "已清除替代文字", Before = before, After = "" };
        }

        if (!paragraphs.TryGetValue(target, out var paragraph) || paragraph.Parent is null) return Fail($"找不到段落 {target}，编号可能因删段已变化，请按最新的标书结构提交");
        var model = session.Context.Model;
        if (!model.Records.TryGetValue(paragraph, out var record)) return Fail($"段落 {target} 不能修改");
        var display = DocumentDump.DisplayText(DocumentModel.ParagraphText(paragraph));

        if (op == "replace")
        {
            var find = edit.Find ?? "";
            var replace = edit.Replace ?? "";
            if (find.Length == 0) return Fail("find 不能为空");
            if (find.Length > MaxFindChars) return Fail($"find 超过 {MaxFindChars} 字，只能改一处具体文字，不能整段改写");
            if (replace.Length > MaxReplaceChars) return Fail($"replace 超过 {MaxReplaceChars} 字，只能改一处具体文字，不能整段改写");
            if (replace.IndexOfAny(['\n', '\r', '\t', DocumentDump.LineBreakMark, DocumentDump.TabMark, DocumentDump.ObjectMark]) >= 0) return Fail("replace 不能包含换行、制表符或图片标记");
            var position = display.IndexOf(find, StringComparison.Ordinal);
            if (position < 0) return Fail($"段落 {target} 中找不到「{Clip(find)}」，请按标书结构里的原文逐字填写");
            var count = 0;
            for (var at = position; at >= 0; at = display.IndexOf(find, at + 1, StringComparison.Ordinal)) count += 1;
            if (count > 1) return Fail($"「{Clip(find)}」在段落 {target} 中出现 {count} 次，请多带几个字让它只出现一次");
            if (find.IndexOfAny([DocumentDump.LineBreakMark, DocumentDump.TabMark, DocumentDump.ObjectMark]) >= 0 || !TextFixes.ReplaceRange(paragraph, position, find.Length, replace))
            {
                return Fail("要替换的文字跨越了手动换行、制表符、图片或域等非文字内容，无法直接替换，请缩小范围或改为人工处理");
            }

            touched.Add(record.Container.Part);
            return new BlindCheckEditOutcome
            {
                Index = index, Op = op, Target = target, Ok = true, Message = "已替换",
                Before = Context(display, position, find.Length), After = Context(DocumentDump.DisplayText(DocumentModel.ParagraphText(paragraph)), position, replace.Length),
            };
        }

        if (op == "delete_paragraph")
        {
            if (paragraph.Element(W.PPr)?.Element(W.SectPr) is not null) return Fail("该段落带分节符，删除会改变页面设置，不能删除");
            if (record.HasPageBreak) return Fail("该段落含分页符，删除后后文不再另起一页，不能删除；含分页符的空段落请判为人工处理");
            if (session.Context.HeadingLevel(record) is not null) return Fail("标题段落不能删除，如需修改标题文字请用 replace");
            if (session.Context.Outline.IsToc(paragraph)) return Fail("目录段落由目录域生成，不能单独删除，请修改正文后在 Word 中更新目录");
            if (paragraph.Parent.Name == W.Tc && paragraph.Parent.Elements(W.P).Count() <= 1) return Fail("这是单元格里唯一的段落，不能删除，可用 replace 清空文字");
            static string Compact(string value) => string.Concat(value.Where(item => !char.IsWhiteSpace(item)));
            if (Compact(edit.Find ?? "") != Compact(display)) return Fail("删除整段时 find 必须填写该段完整原文（空白可省略），用于确认删除的是哪一段");
            paragraph.Remove();
            touched.Add(record.Container.Part);
            return new BlindCheckEditOutcome { Index = index, Op = op, Target = target, Ok = true, Message = "已删除段落", Before = Clip(display, 120), After = "" };
        }

        return Fail($"不支持的修改方式「{op}」，只能是 replace、delete_paragraph 或 clear_image_alt");
    }

    static string Clip(string value, int length = 30) => value.Length <= length ? value : value[..length] + "…";

    static string Context(string text, int start, int length)
    {
        var from = Math.Max(0, start - 15);
        var to = Math.Min(text.Length, start + length + 15);
        return (from > 0 ? "…" : "") + text[from..to] + (to < text.Length ? "…" : "");
    }

    static void TryDelete(string? path)
    {
        try
        {
            if (path is not null && File.Exists(path)) File.Delete(path);
        }
        catch (IOException)
        {
        }
    }
}
