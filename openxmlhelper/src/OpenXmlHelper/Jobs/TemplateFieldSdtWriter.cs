using DocumentFormat.OpenXml;
using Wp = DocumentFormat.OpenXml.Wordprocessing;

namespace Savia.OpenXmlHelper.Jobs;

/// <summary>Deterministically convert confirmed candidates to Word content controls with business identifiers.</summary>
static class TemplateFieldSdtWriter
{
    public const string TagPrefix = "savia:field:";
    public const string PlaceholderFill = "FCE8E6";
    public const string PlaceholderTextColor = "000000";

    public static void Apply(TemplateFieldCandidate candidate, TemplateFieldDefinition field, int wordId)
    {
        if (candidate.Target is Wp.SdtRun existing)
        {
            UpdateExistingControl(existing, field, wordId);
            return;
        }

        if (candidate.Target is Wp.SdtBlock existingBlock)
        {
            UpdateExistingBlockControl(existingBlock, field, wordId);
            return;
        }

        if (candidate.Target is not Wp.Paragraph paragraph)
        {
            throw new InvalidOperationException($"候选位置已失效：{candidate.CandidateId}");
        }

        ReplaceParagraphRange(paragraph, candidate.Start, candidate.Length, field, wordId);
    }

    public static void ApplyValue(TemplateFieldCandidate candidate, string value, int wordId)
    {
        if (candidate.Target is not Wp.Paragraph paragraph)
            throw new InvalidOperationException("Este tipo de campo debe completarse en Word");
        var field = new TemplateFieldDefinition { Id = Guid.NewGuid().ToString("N"), Name = candidate.SuggestedName ?? "Campo" };
        if (ReplaceComplexText(paragraph, candidate.Start, candidate.Length, field, value, wordId)) return;
        ReplaceParagraphRange(paragraph, candidate.Start, candidate.Length,
            field, wordId, value);
    }

    // Split a single text node without discarding tabs or page markers in its run.
    static bool ReplaceComplexText(Wp.Paragraph paragraph, int start, int length, TemplateFieldDefinition field, string value, int wordId)
    {
        var offset = 0;
        foreach (var run in paragraph.Elements<Wp.Run>().ToList())
        {
            foreach (var text in run.Elements<Wp.Text>().ToList())
            {
                var end = offset + text.Text.Length;
                if (start >= offset && start + length <= end && length > 0
                    && run.ChildElements.Any(item => item is not Wp.RunProperties and not Wp.Text))
                {
                    var before = new Wp.Run(); var after = new Wp.Run();
                    if (run.RunProperties is not null)
                    {
                        before.AppendChild((Wp.RunProperties)run.RunProperties.CloneNode(true));
                        after.AppendChild((Wp.RunProperties)run.RunProperties.CloneNode(true));
                    }
                    var reached = false;
                    foreach (var child in run.ChildElements.Where(item => item is not Wp.RunProperties))
                    {
                        if (ReferenceEquals(child, text))
                        {
                            var prefix = text.Text[..(start - offset)];
                            var suffix = text.Text[(start - offset + length)..];
                            if (prefix.Length > 0) before.AppendChild(new Wp.Text(prefix) { Space = SpaceProcessingModeValues.Preserve });
                            if (suffix.Length > 0) after.AppendChild(new Wp.Text(suffix) { Space = SpaceProcessingModeValues.Preserve });
                            reached = true;
                        }
                        else (reached ? after : before).AppendChild(child.CloneNode(true));
                    }
                    if (before.ChildElements.Any(item => item is not Wp.RunProperties)) run.InsertBeforeSelf(before);
                    run.InsertBeforeSelf(CreateControl(field, wordId, run, value));
                    if (after.ChildElements.Any(item => item is not Wp.RunProperties)) run.InsertBeforeSelf(after);
                    run.Remove();
                    return true;
                }
                offset = end;
            }
        }
        return false;
    }

    static void UpdateExistingControl(Wp.SdtRun control, TemplateFieldDefinition field, int wordId)
    {
        var properties = control.SdtProperties ?? control.PrependChild(new Wp.SdtProperties());
        properties.RemoveAllChildren<Wp.SdtAlias>();
        properties.RemoveAllChildren<Wp.SdtId>();
        properties.RemoveAllChildren<Wp.Tag>();
        properties.AddChild(new Wp.SdtAlias { Val = field.Name }, throwOnError: true);
        properties.AddChild(new Wp.SdtId { Val = wordId }, throwOnError: true);
        properties.AddChild(new Wp.Tag { Val = $"{TagPrefix}{field.Id}" }, throwOnError: true);

        var content = control.SdtContentRun ?? control.AppendChild(new Wp.SdtContentRun());
        var sourceRun = content.Elements<Wp.Run>().FirstOrDefault();
        content.RemoveAllChildren();
        content.AppendChild(CreatePlaceholderRun(field, sourceRun));
    }

    static void UpdateExistingBlockControl(Wp.SdtBlock control, TemplateFieldDefinition field, int wordId)
    {
        var properties = control.SdtProperties ?? control.PrependChild(new Wp.SdtProperties());
        properties.RemoveAllChildren<Wp.SdtAlias>();
        properties.RemoveAllChildren<Wp.SdtId>();
        properties.RemoveAllChildren<Wp.Tag>();
        properties.AddChild(new Wp.SdtAlias { Val = field.Name }, throwOnError: true);
        properties.AddChild(new Wp.SdtId { Val = wordId }, throwOnError: true);
        properties.AddChild(new Wp.Tag { Val = $"{TagPrefix}{field.Id}" }, throwOnError: true);

        var content = control.SdtContentBlock ?? control.AppendChild(new Wp.SdtContentBlock());
        var sourceParagraph = content.Elements<Wp.Paragraph>().FirstOrDefault();
        var sourceRun = sourceParagraph?.Descendants<Wp.Run>().FirstOrDefault();
        var paragraph = new Wp.Paragraph();
        if (sourceParagraph?.ParagraphProperties is not null)
        {
            paragraph.AppendChild((Wp.ParagraphProperties)sourceParagraph.ParagraphProperties.CloneNode(true));
        }
        paragraph.AppendChild(CreatePlaceholderRun(field, sourceRun));
        content.RemoveAllChildren();
        content.AppendChild(paragraph);
    }

    static void ReplaceParagraphRange(
        Wp.Paragraph paragraph,
        int start,
        int length,
        TemplateFieldDefinition field,
        int wordId,
        string? value = null)
    {
        var runs = paragraph.Elements<Wp.Run>().ToList();
        var runTexts = runs.Select(ReadRunText).ToList();
        var totalLength = runTexts.Sum(item => item.Length);
        if (start < 0 || length < 0 || start + length > totalLength)
        {
            throw new InvalidOperationException($"模板字段位置已漂移：{field.Name}");
        }

        var control = CreateControl(field, wordId, FindStyleRun(runs, runTexts, start), value);
        if (runs.Count == 0)
        {
            if (start != 0 || length != 0) throw new InvalidOperationException($"模板字段位置已漂移：{field.Name}");
            paragraph.AppendChild(control);
            return;
        }

        if (length == 0)
        {
            InsertAt(paragraph, runs, runTexts, start, control);
            return;
        }

        var end = start + length;
        var firstIndex = FindRunIndex(runTexts, start, preferNextAtBoundary: true);
        var lastIndex = FindRunIndex(runTexts, end, preferNextAtBoundary: false);
        if (firstIndex < 0 || lastIndex < firstIndex)
        {
            throw new InvalidOperationException($"模板字段位置已漂移：{field.Name}");
        }

        var firstStart = runTexts.Take(firstIndex).Sum(item => item.Length);
        var lastStart = runTexts.Take(lastIndex).Sum(item => item.Length);
        var prefix = runTexts[firstIndex][..(start - firstStart)];
        var suffix = runTexts[lastIndex][(end - lastStart)..];
        var firstRun = runs[firstIndex];
        var lastRun = runs[lastIndex];

        if (prefix.Length > 0) firstRun.InsertBeforeSelf(CreateTextRun(prefix, firstRun));
        firstRun.InsertBeforeSelf(control);
        if (suffix.Length > 0) firstRun.InsertBeforeSelf(CreateTextRun(suffix, lastRun));
        for (var index = firstIndex; index <= lastIndex; index += 1)
        {
            runs[index].Remove();
        }
    }

    static void InsertAt(
        Wp.Paragraph paragraph,
        IReadOnlyList<Wp.Run> runs,
        IReadOnlyList<string> runTexts,
        int start,
        Wp.SdtRun control)
    {
        var totalLength = runTexts.Sum(item => item.Length);
        if (start == totalLength)
        {
            runs[^1].InsertAfterSelf(control);
            return;
        }

        var runIndex = FindRunIndex(runTexts, start, preferNextAtBoundary: true);
        if (runIndex < 0)
        {
            paragraph.AppendChild(control);
            return;
        }

        var runStart = runTexts.Take(runIndex).Sum(item => item.Length);
        var offset = start - runStart;
        var run = runs[runIndex];
        var text = runTexts[runIndex];
        if (offset == 0)
        {
            run.InsertBeforeSelf(control);
            return;
        }

        var prefix = text[..offset];
        var suffix = text[offset..];
        if (prefix.Length > 0) run.InsertBeforeSelf(CreateTextRun(prefix, run));
        run.InsertBeforeSelf(control);
        if (suffix.Length > 0) run.InsertBeforeSelf(CreateTextRun(suffix, run));
        run.Remove();
    }

    static int FindRunIndex(IReadOnlyList<string> runTexts, int offset, bool preferNextAtBoundary)
    {
        var cursor = 0;
        for (var index = 0; index < runTexts.Count; index += 1)
        {
            var next = cursor + runTexts[index].Length;
            if (offset < next || (!preferNextAtBoundary && offset == next && runTexts[index].Length > 0))
            {
                return index;
            }
            cursor = next;
        }
        return -1;
    }

    static Wp.Run? FindStyleRun(IReadOnlyList<Wp.Run> runs, IReadOnlyList<string> runTexts, int start)
    {
        if (runs.Count == 0) return null;
        var index = FindRunIndex(runTexts, start, preferNextAtBoundary: true);
        return index >= 0 ? runs[index] : runs[^1];
    }

    static Wp.SdtRun CreateControl(TemplateFieldDefinition field, int wordId, Wp.Run? sourceRun, string? value = null)
    {
        var properties = new Wp.SdtProperties(
            new Wp.SdtAlias { Val = field.Name },
            new Wp.SdtId { Val = wordId },
            new Wp.Tag { Val = $"{TagPrefix}{field.Id}" });
        var content = new Wp.SdtContentRun(value is null ? CreatePlaceholderRun(field, sourceRun) : CreateValueRun(value, sourceRun));
        return new Wp.SdtRun(properties, content);
    }

    static Wp.Run CreateValueRun(string value, Wp.Run? sourceRun)
    {
        var run = new Wp.Run();
        if (sourceRun?.RunProperties is not null) run.AppendChild((Wp.RunProperties)sourceRun.RunProperties.CloneNode(true));
        run.AppendChild(new Wp.Text(value) { Space = SpaceProcessingModeValues.Preserve });
        return run;
    }

    static Wp.Run CreatePlaceholderRun(TemplateFieldDefinition field, Wp.Run? sourceRun)
    {
        var properties = sourceRun?.RunProperties is null
            ? new Wp.RunProperties()
            : (Wp.RunProperties)sourceRun.RunProperties.CloneNode(true);
        properties.RemoveAllChildren<Wp.Color>();
        properties.RemoveAllChildren<Wp.Shading>();
        properties.AddChild(new Wp.Color { Val = PlaceholderTextColor }, throwOnError: true);
        properties.AddChild(
            new Wp.Shading
            {
                Val = Wp.ShadingPatternValues.Clear,
                Color = "auto",
                Fill = PlaceholderFill,
            },
            throwOnError: true);
        var prefix = field.FillBy == "manual" ? "人工处理" : "待填写";
        return new Wp.Run(
            properties,
            new Wp.Text($"【{prefix}：{field.Name}】") { Space = SpaceProcessingModeValues.Preserve });
    }

    static Wp.Run CreateTextRun(string text, Wp.Run sourceRun)
    {
        var run = new Wp.Run();
        if (sourceRun.RunProperties is not null)
        {
            run.AppendChild((Wp.RunProperties)sourceRun.RunProperties.CloneNode(true));
        }
        run.AppendChild(new Wp.Text(text) { Space = SpaceProcessingModeValues.Preserve });
        return run;
    }

    static string ReadRunText(Wp.Run run)
    {
        return string.Concat(run.Elements<Wp.Text>().Select(item => item.Text));
    }
}
