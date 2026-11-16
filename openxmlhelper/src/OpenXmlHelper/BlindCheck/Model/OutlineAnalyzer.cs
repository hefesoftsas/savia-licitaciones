using System.Text.RegularExpressions;
using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;

namespace Savia.OpenXmlHelper.BlindCheck.Model;

sealed record TocEntry(int Level, string Text, string Normalized);

sealed class TocInfo
{
    public HashSet<XElement> Paragraphs { get; } = new(ReferenceEqualityComparer.Instance);
    /// <summary>Contents paragraphs recognized by styles outside fields, such as converted plain-text contents; deletion uses the same criteria.</summary>
    public HashSet<XElement> Styled { get; } = new(ReferenceEqualityComparer.Instance);
    public List<TocEntry> Entries { get; } = [];
    public bool HasToc { get; set; }
    public bool HasField { get; set; }
}

/// <summary>Heading recognition result: level and source for each top-level body paragraph.</summary>
sealed class Outline
{
    public TocInfo Toc { get; init; } = new();
    public Dictionary<XElement, int> Levels { get; } = new(ReferenceEqualityComparer.Instance);
    public Dictionary<string, int> SourceCounts { get; } = new(StringComparer.Ordinal);
    /// <summary>Heading level source: toc/style/pattern. Pattern-fallback levels are nominal and unsuitable for hierarchy comparisons.</summary>
    public Dictionary<XElement, string> Sources { get; } = new(ReferenceEqualityComparer.Instance);

    public int? LevelOf(XElement paragraph) => Levels.TryGetValue(paragraph, out var level) ? level : null;

    public string? SourceOf(XElement paragraph) => Sources.GetValueOrDefault(paragraph);

    public bool IsToc(XElement paragraph) => Toc.Paragraphs.Contains(paragraph);

    /// <summary>Headings determined from contents with at least three entries; numbering fallback is then disabled.</summary>
    public bool UsedToc { get; init; }
}

/// <summary>
/// Determine heading structure in order: contents -> heading styles/outline levels -> numbering fallback, preferring fewer correct matches.
/// Contents is author-confirmed structure; use numbering fallback only without contents and recognize only the first two numbering levels.
/// </summary>
static class OutlineAnalyzer
{
    const int MaxFallbackChars = 40;

    static readonly (string Name, Regex Pattern, int Level)[] NumberPatterns =
    [
        ("chapter", new Regex(@"^第\s*[一二三四五六七八九十百零〇\d]+\s*[章篇]"), 1),
        ("part", new Regex(@"^第\s*[一二三四五六七八九十百零〇\d]+\s*部分"), 1),
        ("section", new Regex(@"^第\s*[一二三四五六七八九十百零〇\d]+\s*节"), 2),
        ("cn_dun", new Regex(@"^[一二三四五六七八九十百零〇]{1,3}\s*[、.．]"), 1),
        ("cn_paren", new Regex(@"^[（(]\s*[一二三四五六七八九十百零〇]{1,3}\s*[)）]"), 2),
        ("num_dun", new Regex(@"^\d{1,2}\s*[、]"), 3),
        ("num_multi", new Regex(@"^\d{1,2}(?:\.\d{1,2}){1,4}\.?\s"), 3),
        ("num_dot", new Regex(@"^\d{1,2}\s*[.．]\s*\S"), 3),
        ("num_paren", new Regex(@"^[（(]\s*\d{1,2}\s*[)）]"), 4),
        ("num_rparen", new Regex(@"^\d{1,2}\s*[)）]"), 4),
        ("circle", new Regex(@"^[①-⑳⒈-⒚]"), 5),
        ("di_tiao", new Regex(@"^第\s*\d{1,3}\s*[条款项]"), 3),
    ];

    static readonly HashSet<string> FallbackPatterns = ["chapter", "part", "section", "cn_dun", "cn_paren", "num_dun", "num_dot"];
    static readonly Regex SentenceEnd = new(@"[。；;：:,，]$");
    static readonly Regex Leader = new(@"[.．·…]{3,}");
    static readonly Regex PageTail = new(@"\d{1,4}\s*$");
    static readonly Regex Whitespace = new(@"[\s\u3000]+");
    static readonly Regex TocStyle = new(@"^(?:toc|目录|contents)\s*([1-9１-９])?$", RegexOptions.IgnoreCase);
    static readonly Regex TocTitleStyle = new(@"^(?:toc\s*heading|toc\s*标题|目录标题)$", RegexOptions.IgnoreCase);
    static readonly Regex ContentsTitle = new(@"^(?:tableof)?contents$", RegexOptions.IgnoreCase);

    /// <summary>Contents title: short lines ending in Chinese contents/index terms, optionally with prefixes/spaces, or Contents.</summary>
    public static bool IsTocTitle(string text)
    {
        var value = Whitespace.Replace(text ?? "", "");
        return (value.Length <= 20 && (value.EndsWith("目录", StringComparison.Ordinal) || value.EndsWith("目次", StringComparison.Ordinal))) || ContentsTitle.IsMatch(value);
    }

    /// <summary>Contents-heading style, including Word TOC Heading and WPS equivalents.</summary>
    public static bool IsTocTitleStyle(string? styleName, string? styleId)
    {
        return (styleName is not null && TocTitleStyle.IsMatch(styleName.Trim())) || (styleId is not null && TocTitleStyle.IsMatch(styleId));
    }

    public static (string Name, int Level)? MatchNumber(string text)
    {
        var value = text.Trim();
        if (value.Length == 0) return null;
        foreach (var (name, pattern, level) in NumberPatterns)
        {
            if (pattern.IsMatch(value)) return (name, level);
        }

        return null;
    }

    public static string NormalizeTitle(string text)
    {
        var value = Leader.Replace(text ?? "", "");
        value = value.Replace("\t", "");
        value = Regex.Replace(value, @"\s*\d{1,4}\s*$", "");
        value = Whitespace.Replace(value, "");
        value = value.Replace('（', '(').Replace('）', ')').Replace('．', '.').Replace('。', '.').Replace('：', ':').Replace('，', ',');
        return value.Trim();
    }

    static bool LooksLikeHeading(string text, int maxLength)
    {
        var value = text.Trim();
        if (value.Length == 0 || value.Length > maxLength) return false;
        if (SentenceEnd.IsMatch(value) || Leader.IsMatch(value) || value.Contains('\n')) return false;
        return !PageTail.IsMatch(value);
    }

    /// <param name="numberFallback">Whether to infer headings from numbering when contents is absent; pass false when rechecking a repaired copy whose contents was removed, preserving original recognition.</param>
    public static Outline Analyze(DocumentModel model, bool numberFallback = true)
    {
        var toc = DetectToc(model);
        var useToc = toc.HasToc && toc.Entries.Count >= 3;
        var outline = new Outline { Toc = toc, UsedToc = useToc };
        var tocIndex = new Dictionary<string, List<int>>(StringComparer.Ordinal);
        if (useToc)
        {
            foreach (var entry in toc.Entries.Where(item => item.Normalized.Length > 0))
            {
                if (!tocIndex.TryGetValue(entry.Normalized, out var list)) tocIndex[entry.Normalized] = list = [];
                list.Add(entry.Level);
            }
        }

        var consumed = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var record in model.BodyParagraphs)
        {
            if (record.IsEmpty || toc.Paragraphs.Contains(record.Element)) continue;
            var text = record.Text.Trim();
            var normalized = NormalizeTitle(text);
            int? level = null;
            string? source = null;

            if (useToc && normalized.Length > 0 && tocIndex.TryGetValue(normalized, out var levels))
            {
                var used = consumed.GetValueOrDefault(normalized);
                if (used < levels.Count)
                {
                    consumed[normalized] = used + 1;
                    if (levels[used] > 0)
                    {
                        level = levels[used];
                        source = "toc";
                    }
                }
            }

            if (level is null && record.Format.HeadingLevel is >= 1 and <= 9 && text.Length <= 200)
            {
                level = record.Format.HeadingLevel;
                source = "style";
            }

            if (level is null && !useToc && numberFallback && MatchNumber(text) is { } match
                && FallbackPatterns.Contains(match.Name) && LooksLikeHeading(text, MaxFallbackChars))
            {
                level = match.Level;
                source = "pattern";
            }

            if (level is null || source is null) continue;
            outline.Levels[record.Element] = level.Value;
            outline.Sources[record.Element] = source;
        }

        if (!useToc) MarkManualToc(model, outline);
        foreach (var source in outline.Sources.Values)
        {
            outline.SourceCounts[source] = outline.SourceCounts.GetValueOrDefault(source) + 1;
        }

        return outline;
    }

    /// <summary>
    /// Manual contents: at least three consecutive early paragraphs recognized as numbered headings with text matching later headings one-to-one,
    /// indicating a manually entered contents list, often a construction-plan contents without page numbers.
    /// Classify these paragraphs and the immediately preceding contents-title line as contents rather than headings.
    /// </summary>
    static void MarkManualToc(DocumentModel model, Outline outline)
    {
        var records = model.BodyParagraphs.Where(record => !record.IsEmpty).ToList();
        var lastIndex = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var index = 0; index < records.Count; index += 1)
        {
            if (outline.LevelOf(records[index].Element) is null) continue;
            lastIndex[NormalizeTitle(records[index].Text)] = index;
        }

        bool IsDuplicate(int index)
        {
            var record = records[index];
            return outline.SourceOf(record.Element) == "pattern"
                && lastIndex.TryGetValue(NormalizeTitle(record.Text), out var last)
                && last > index;
        }

        var start = 0;
        while (start < records.Count)
        {
            if (!IsDuplicate(start))
            {
                start += 1;
                continue;
            }

            var end = start;
            while (end + 1 < records.Count && IsDuplicate(end + 1)) end += 1;
            if (end - start + 1 >= 3)
            {
                if (start > 0 && IsTocTitle(records[start - 1].Text) && outline.LevelOf(records[start - 1].Element) is null)
                {
                    outline.Toc.Paragraphs.Add(records[start - 1].Element);
                }

                for (var index = start; index <= end; index += 1)
                {
                    var record = records[index];
                    outline.Levels.Remove(record.Element);
                    outline.Sources.Remove(record.Element);
                    outline.Toc.Paragraphs.Add(record.Element);
                    outline.Toc.Entries.Add(new TocEntry(0, record.Text, NormalizeTitle(record.Text)));
                }
            }

            start = end + 1;
        }
    }

    /// <summary>Recognize contents using three sources: TOC field ranges, contents styles, and leader/page-number shapes.</summary>
    static TocInfo DetectToc(DocumentModel model)
    {
        var info = new TocInfo();
        var paragraphs = model.BodyElement.Descendants(W.P).ToList();
        var position = new Dictionary<XElement, int>(ReferenceEqualityComparer.Instance);
        for (var index = 0; index < paragraphs.Count; index += 1) position[paragraphs[index]] = index;

        foreach (var field in FieldScanner.Scan(model.BodyElement).Where(item => item.Kind == "toc"))
        {
            info.HasToc = true;
            info.HasField = true;
            if (field.Begin is null || !position.TryGetValue(field.Begin, out var start)) continue;
            var end = field.End is not null && position.TryGetValue(field.End, out var found) ? found : Math.Min(start + 1200, paragraphs.Count - 1);
            for (var index = start; index <= end; index += 1)
            {
                // If the TOC field ends in the next heading alongside a page break and title text, classify that paragraph as body, not contents.
                var paragraph = paragraphs[index];
                if ((index == start || index == end) && OnlyOutside(paragraph, field)) continue;
                info.Paragraphs.Add(paragraph);
            }
        }

        var inField = new HashSet<XElement>(info.Paragraphs, ReferenceEqualityComparer.Instance);
        info.Styled.UnionWith(StyledToc(model, paragraphs, inField));
        foreach (var paragraph in paragraphs)
        {
            if (paragraph.Parent?.Name == W.Tc) continue;
            var level = TocLevelOfStyle(model, paragraph);
            var text = TextOf(model, paragraph);
            if (level is not null && (inField.Contains(paragraph) || info.Styled.Contains(paragraph)))
            {
                info.Paragraphs.Add(paragraph);
                info.HasToc = true;
                info.Entries.Add(new TocEntry(level.Value, text, NormalizeTitle(text)));
                continue;
            }

            var trimmed = text.Trim();
            if (trimmed.Length > 0 && (Leader.IsMatch(text) || text.Contains('\t')) && PageTail.IsMatch(text) && MatchNumber(trimmed) is not null)
            {
                info.Paragraphs.Add(paragraph);
                info.Entries.Add(new TocEntry(0, text, NormalizeTitle(text)));
            }
        }

        if (info.Entries.Count == 0 && info.Paragraphs.Count > 0)
        {
            foreach (var paragraph in paragraphs.Where(info.Paragraphs.Contains))
            {
                var text = DocumentModel.ParagraphText(paragraph);
                if (text.Trim().Length > 0) info.Entries.Add(new TocEntry(0, text, NormalizeTitle(text)));
            }
        }

        return info;
    }

    static string TextOf(DocumentModel model, XElement paragraph) => model.Records.TryGetValue(paragraph, out var record) ? record.Text : DocumentModel.ParagraphText(paragraph);

    static int? TocLevelOfStyle(DocumentModel model, XElement paragraph)
    {
        var styleId = W.ValOf(paragraph.Element(W.PPr)?.Element(W.PStyle));
        return TocLevelOfStyle(styleId is null ? null : model.Sheet.ById.GetValueOrDefault(styleId)?.DisplayName, styleId);
    }

    /// <summary>
    /// Out-of-field contents-style paragraphs must form a group and have a preceding contents title or page-number endings in more than half the entries;
    /// isolated body paragraphs accidentally using contents styles without page numbers are excluded.
    /// </summary>
    static HashSet<XElement> StyledToc(DocumentModel model, List<XElement> paragraphs, HashSet<XElement> inField)
    {
        var result = new HashSet<XElement>(ReferenceEqualityComparer.Instance);
        bool Member(int index) => paragraphs[index].Parent?.Name != W.Tc && !inField.Contains(paragraphs[index]) && TocLevelOfStyle(model, paragraphs[index]) is not null;
        for (var index = 0; index < paragraphs.Count; index += 1)
        {
            if (!Member(index)) continue;
            var start = index;
            while (index + 1 < paragraphs.Count && Member(index + 1)) index += 1;
            var texts = Enumerable.Range(start, index - start + 1).Select(item => TextOf(model, paragraphs[item])).Where(text => text.Trim().Length > 0).ToList();
            if (texts.Count == 0) continue;
            if (!TitledBefore(model, paragraphs, start) && texts.Count(text => PageTail.IsMatch(text)) * 2 < texts.Count) continue;
            for (var item = start; item <= index; item += 1) result.Add(paragraphs[item]);
        }

        return result;
    }

    /// <summary>The nearest preceding nonempty paragraph, across at most two blanks, is a contents title.</summary>
    static bool TitledBefore(DocumentModel model, List<XElement> paragraphs, int start)
    {
        for (var index = start - 1; index >= 0 && index >= start - 3; index -= 1)
        {
            var text = TextOf(model, paragraphs[index]);
            if (text.Trim().Length == 0) continue;
            var styleId = W.ValOf(paragraphs[index].Element(W.PPr)?.Element(W.PStyle));
            return IsTocTitle(text) || IsTocTitleStyle(styleId is null ? null : model.Sheet.ById.GetValueOrDefault(styleId)?.DisplayName, styleId);
        }

        return false;
    }

    /// <summary>All paragraph text lies outside the field, before its start or after its end; the field contains no text.</summary>
    static bool OnlyOutside(XElement paragraph, FieldSpan field)
    {
        var inside = false;
        var outside = false;
        foreach (var text in paragraph.Descendants(W.T).Where(item => item.Value.Trim().Length > 0))
        {
            var simple = field.BeginMarker == field.EndMarker;
            var within = simple
                ? text.Ancestors().Contains(field.BeginMarker)
                : (field.BeginMarker is null || text.IsAfter(field.BeginMarker)) && (field.EndMarker is null || text.IsBefore(field.EndMarker));
            if (within) inside = true;
            else outside = true;
        }

        return outside && !inside;
    }

    public static int? TocLevelOfStyle(string? styleName, string? styleId)
    {
        foreach (var value in new[] { styleName, styleId })
        {
            if (string.IsNullOrWhiteSpace(value)) continue;
            var match = TocStyle.Match(value.Trim());
            if (!match.Success) continue;
            var group = match.Groups[1];
            if (!group.Success) return 1;
            var digit = group.Value[0];
            return digit >= '１' && digit <= '９' ? digit - '１' + 1 : digit - '0';
        }

        return null;
    }
}

sealed class FieldSpan
{
    public string Kind { get; set; } = "unknown";
    public XElement? Begin { get; init; }
    public XElement? End { get; set; }
    /// <summary>Boundary markers: begin/end fldChar for complex fields, or fldSimple itself for simple fields.</summary>
    public XElement? BeginMarker { get; init; }
    public XElement? EndMarker { get; set; }
    public string Instruction { get; set; } = "";
}

/// <summary>Scan paired begin/separate/end markers and collect instrText instructions for complex fields.</summary>
static class FieldScanner
{
    public static List<FieldSpan> Scan(XElement root)
    {
        var fields = new List<FieldSpan>();
        var stack = new Stack<FieldSpan>();
        foreach (var element in root.Descendants())
        {
            if (element.Name == W.FldChar)
            {
                var type = W.Attr(element, "fldCharType");
                if (type == "begin")
                {
                    stack.Push(new FieldSpan { Begin = OwningParagraph(element), BeginMarker = element });
                }
                else if (type == "end" && stack.Count > 0)
                {
                    var field = stack.Pop();
                    field.End = OwningParagraph(element);
                    field.EndMarker = element;
                    field.Kind = Classify(field.Instruction);
                    fields.Add(field);
                }
            }
            else if (element.Name == W.InstrText && stack.Count > 0)
            {
                stack.Peek().Instruction += element.Value;
            }
            else if (element.Name == W.FldSimple)
            {
                var instruction = W.Attr(element, "instr") ?? "";
                var paragraph = OwningParagraph(element);
                fields.Add(new FieldSpan { Begin = paragraph, End = paragraph, BeginMarker = element, EndMarker = element, Instruction = instruction, Kind = Classify(instruction) });
            }
        }

        return fields;
    }

    static XElement? OwningParagraph(XElement element) => element.Ancestors(W.P).FirstOrDefault();

    public static string Classify(string instruction)
    {
        var value = instruction.Trim().ToUpperInvariant();
        var keyword = value.Split((char[]?)null, 2, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";
        return keyword switch
        {
            "TOC" => "toc",
            "PAGEREF" => "pageref",
            "PAGE" => "page",
            "NUMPAGES" => "numpages",
            "HYPERLINK" => "hyperlink",
            _ => keyword.ToLowerInvariant(),
        };
    }
}
