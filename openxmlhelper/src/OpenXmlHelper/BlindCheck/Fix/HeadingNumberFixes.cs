using System.Text.RegularExpressions;
using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Model;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;
using Savia.OpenXmlHelper.BlindCheck.Rules;
using static Savia.OpenXmlHelper.BlindCheck.Fix.PropertyWriter;
using HeadingNumber = Savia.OpenXmlHelper.BlindCheck.Rules.StructureRules.HeadingNumber;

namespace Savia.OpenXmlHelper.BlindCheck.Fix;

/// <summary>
/// Convert heading numbers to decimal hierarchy when required. Handle only three reliable cases and leave other cases for manual review:
/// convert automatic heading levels to decimal; remove nondecimal prefixes from same/higher-level headings before the first decimal heading because they are document or volume titles;
/// when all manual prefixes are nondecimal, levels progress from one without gaps, and same-level formats agree, renumber by heading level as 1, 1.1, 1.1.1.
/// Update corresponding contents-entry text after manual-prefix changes; automatic numbering requires a Word field update.
/// </summary>
static class HeadingNumberFixes
{
    static readonly Regex Spaces = new(@"\s+");
    static readonly Regex NumberChars = new(@"[一二三四五六七八九十百零〇\d]+");
    static readonly Regex Letters = new(@"[IVXⅠ-Ⅻ]+|[A-Za-z]");
    static readonly Regex Circled = new(@"[①-⑳]");

    public static int Fix(FixContext fix)
    {
        var numbering = NumberingFormats.Load(fix.Model, fix.Extra);
        var headings = StructureRules.HeadingNumbers(fix.Rules, numbering);
        var count = FixAutoNumbers(fix, numbering, headings, out var manual);
        var renames = WrittenRenames(headings, out var unsure);
        manual += unsure + headings.Count(item => item.Kind == "arabic" && item.DepthMismatch);

        var toc = fix.Model.BodyElement.Descendants(W.P).Where(fix.Rules.Outline.IsToc).ToList();
        foreach (var (heading, replacement) in renames)
        {
            var element = heading.Record.Element;
            var title = OutlineAnalyzer.NormalizeTitle(DocumentModel.ParagraphText(element));
            if (!ReplacePrefix(element, heading.Prefix, replacement))
            {
                manual += 1;
                continue;
            }

            fix.Touch(heading.Record);
            count += 1;
            var entry = toc.FirstOrDefault(item => OutlineAnalyzer.NormalizeTitle(DocumentModel.ParagraphText(item)) == title);
            if (entry is null) continue;
            toc.Remove(entry);
            if (ReplacePrefix(entry, heading.Prefix, replacement)) fix.Touch(fix.Model.DocumentPart);
        }

        if (manual > 0) fix.Note($"有 {manual} 个标题的序号写法混用或层级不清，没有自动修改，请对照招标要求手动改为阿拉伯数字分级编号");
        return count;
    }

    /// <summary>Replace the leading manual prefix with replacement (empty removes it), also removing following spaces; leave text unchanged if the prefix does not match.</summary>
    static bool ReplacePrefix(XElement paragraph, string prefix, string replacement)
    {
        var text = DocumentModel.ParagraphText(paragraph);
        var start = text.Length - text.TrimStart(' ', '　', '\t').Length;
        if (prefix.Length == 0 || !text[start..].StartsWith(prefix, StringComparison.Ordinal)) return false;
        var end = start + prefix.Length;
        while (end < text.Length && text[end] is ' ' or '　') end += 1;
        return TextFixes.ReplaceRange(paragraph, start, end - start, replacement);
    }

    /// <summary>Prefix shape after replacing numbers, letters, and circled digits with placeholders, such as chapter-number, parenthesized-number, or number-plus-separator forms.</summary>
    static string ShapeOf(string prefix)
    {
        var value = Spaces.Replace(prefix, "").Replace('(', '（').Replace(')', '）').Replace('．', '.');
        return NumberChars.Replace(Letters.Replace(Circled.Replace(value, "①"), "A"), "#");
    }

    /// <summary>Manual-prefix edits map headings to new prefixes; empty removes numbering. unsure counts headings left for manual review.</summary>
    static List<(HeadingNumber Heading, string Replacement)> WrittenRenames(List<HeadingNumber> headings, out int unsure)
    {
        var others = headings.Count(item => item.Kind == "other");
        unsure = 0;
        if (others == 0) return [];

        var firstArabic = headings.FindIndex(item => item.Kind is "arabic" or "auto");
        if (firstArabic >= 0)
        {
            // Later decimal numbering starting at one implies earlier headings with other prefix forms are document/volume titles outside that sequence.
            var first = headings[firstArabic];
            var startsAtOne = first.Kind == "auto" || first.Prefix.TakeWhile(char.IsAsciiDigit).SequenceEqual("1");
            var titles = startsAtOne ? headings.Take(firstArabic).Where(item => item.Kind == "other" && item.Level <= first.Level).ToList() : [];
            unsure = others - titles.Count;
            return titles.Select(item => (item, "")).ToList();
        }

        var numbered = headings.SkipWhile(item => item.Kind == "none").ToList();
        if (numbered.Any(item => item.Kind != "other") || !Renumberable(numbered))
        {
            unsure = others;
            return [];
        }

        var counters = new int[10];
        var result = new List<(HeadingNumber, string)>();
        foreach (var heading in numbered)
        {
            counters[heading.Level] += 1;
            Array.Clear(counters, heading.Level + 1, counters.Length - heading.Level - 1);
            var number = string.Join(".", counters.Skip(1).Take(heading.Level));
            result.Add((heading, number + (heading.Prefix.TrimEnd().EndsWith('、') ? "、" : " ")));
        }

        return result;
    }

    /// <summary>Renumber only if levels start at one without gaps, same-level prefix shapes match, and different levels have different shapes; otherwise level recognition is likely wrong.</summary>
    static bool Renumberable(List<HeadingNumber> numbered)
    {
        var previous = 0;
        var shapes = new Dictionary<int, string>();
        foreach (var heading in numbered)
        {
            if (heading.Level > previous + 1 || heading.Level >= 10) return false;
            var shape = ShapeOf(heading.Prefix);
            if (shapes.TryGetValue(heading.Level, out var known) && known != shape) return false;
            shapes[heading.Level] = shape;
            previous = heading.Level;
        }

        return shapes.Values.Distinct().Count() == shapes.Count;
    }

    /// <summary>
    /// Automatic numbering: convert affected heading levels to decimal and add isLgl so referenced parent levels also display decimal numbers;
    /// match prefix depth to heading level (level two uses %1.%2), preserving the original ideographic separator and trailing tab/space.
    /// Within a numbering scheme, numbering-level index minus heading level must agree, and body lists must not share those levels; otherwise leave for manual repair to avoid misalignment or body changes.
    /// </summary>
    static int FixAutoNumbers(FixContext fix, NumberingFormats numbering, List<HeadingNumber> headings, out int manual)
    {
        manual = 0;
        var used = headings.Where(item => item.Kind == "auto")
            .Select(item => (Heading: item, Level: numbering.LevelOf(item.Record)!))
            .ToList();
        if (numbering.Part is null || !used.Any(item => item.Heading.OtherFormat is not null || item.Heading.DepthMismatch)) return 0;

        var headingElements = headings.Select(item => item.Record.Element).ToHashSet(ReferenceEqualityComparer.Instance);
        var listLevels = fix.Rules.Groups.All
            .Where(record => !headingElements.Contains(record.Element))
            .Select(numbering.LevelOf)
            .Where(item => item is not null)
            .Select(item => (item!.AbstractId, item.Index))
            .ToHashSet();
        var count = 0;
        foreach (var group in used.GroupBy(item => item.Level.AbstractId))
        {
            var wrong = group.Where(item => item.Heading.OtherFormat is not null || item.Heading.DepthMismatch).ToList();
            if (wrong.Count == 0) continue;
            var offsets = group.Select(item => item.Level.Index - item.Heading.Level + 1).Distinct().ToList();
            if (offsets.Count != 1 || offsets[0] < 0 || group.Any(item => listLevels.Contains((item.Level.AbstractId, item.Level.Index))))
            {
                manual += wrong.Count;
                continue;
            }

            foreach (var (heading, target) in wrong.DistinctBy(item => item.Level.Level))
            {
                var level = target.Level;
                var text = W.ValOf(level.Element(W.Ns + "lvlText")) ?? "";
                var placeholders = Enumerable.Range(offsets[0] + 1, heading.Level).Select(index => $"%{index}");
                var format = LevelChild(level, "numFmt");
                SetVal(format, "decimal");
                SetAttr(format, "format", null);
                LevelChild(level, "isLgl");
                SetVal(LevelChild(level, "lvlText"), string.Join(".", placeholders) + (text.TrimEnd().EndsWith('、') ? "、" : ""));
            }

            count += wrong.Count;
        }

        if (count > 0)
        {
            fix.Touch(numbering.Part);
            if (fix.Rules.Outline.Toc.HasToc) fix.Note($"已把 {count} 个标题的自动编号改为阿拉伯数字，目录里的编号要在 Word 中右键目录「更新域」后才会变");
        }

        return count;
    }
}
