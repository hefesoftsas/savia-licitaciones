using System.Text.RegularExpressions;
using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;

namespace Savia.OpenXmlHelper.BlindCheck.Model;

/// <summary>Automatic paragraph numbering display: numbering format, referenced level formats, and template depth.</summary>
sealed record AutoNumber(string Format, string Text, IReadOnlyList<string> Formats)
{
    /// <summary>Number of levels in numbering text; %1.%2 has depth two.</summary>
    public int Depth => Formats.Count;
}

/// <summary>Paragraph numbering level: numId, abstract definition, level index, and effective definition, preferring lvlOverride.</summary>
sealed record NumberingLevel(string NumId, string AbstractId, int Index, XElement Level);

/// <summary>
/// Read minimal numbering.xml structure: num -> abstractNum, including lvlOverride -> per-level numFmt/lvlText.
/// Paragraph numbering prefers direct numPr, then paragraph styles; numId zero cancels it. Do not expand numStyleLink or other linked styles.
/// </summary>
sealed class NumberingFormats
{
    static readonly Regex Placeholder = new(@"%(\d)");

    readonly Dictionary<string, (string AbstractId, Dictionary<int, XElement> Levels)> _nums = new(StringComparer.Ordinal);
    readonly StyleSheet _sheet;

    NumberingFormats(StyleSheet sheet) => _sheet = sheet;

    /// <summary>numbering.xml part name; null when the document has no numbering definitions.</summary>
    public string? Part { get; private set; }

    /// <summary>load selects how parts are read; repairs pass the repair context loader so edits affect the XML that will be saved.</summary>
    public static NumberingFormats Load(DocumentModel model, Func<string, XDocument?>? load = null)
    {
        var formats = new NumberingFormats(model.Sheet);
        var part = model.Package.RelatedPart(model.DocumentPart, "/numbering", "word/numbering.xml");
        var root = part is null ? null : (load ?? model.Package.TryLoad)(part)?.Root;
        if (root is null) return formats;
        formats.Part = part;
        var abstracts = root.Elements(W.Ns + "abstractNum")
            .Where(item => W.Attr(item, "abstractNumId") is not null)
            .GroupBy(item => W.Attr(item, "abstractNumId")!, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => Levels(group.First()), StringComparer.Ordinal);
        foreach (var num in root.Elements(W.Ns + "num"))
        {
            var numId = W.Attr(num, "numId");
            var abstractId = W.ValOf(num.Element(W.Ns + "abstractNumId"));
            if (numId is null || abstractId is null || !abstracts.TryGetValue(abstractId, out var baseLevels)) continue;
            var levels = new Dictionary<int, XElement>(baseLevels);
            foreach (var overrideLevel in num.Elements(W.Ns + "lvlOverride"))
            {
                if (overrideLevel.Element(W.Ns + "lvl") is { } level && W.IntAttr(overrideLevel, "ilvl") is { } index) levels[index] = level;
            }

            formats._nums[numId] = (abstractId, levels);
        }

        return formats;
    }

    static Dictionary<int, XElement> Levels(XElement abstractNum)
    {
        var result = new Dictionary<int, XElement>();
        foreach (var level in abstractNum.Elements(W.Ns + "lvl"))
        {
            if (W.IntAttr(level, "ilvl") is { } index) result.TryAdd(index, level);
        }

        return result;
    }

    /// <summary>Paragraph numbering level; null when absent or canceled.</summary>
    public NumberingLevel? LevelOf(ParaRecord record)
    {
        var numPr = record.Element.Element(W.PPr)?.Element(W.NumPr);
        string? numId = W.ValOf(numPr?.Element(W.NumId));
        int? ilvl = W.IntAttr(numPr?.Element(W.Ilvl), "val");
        if (numId is null)
        {
            foreach (var style in _sheet.Chain(_sheet.ResolveParagraphStyle(record.Format.StyleId), "paragraph"))
            {
                if (style.PPr?.Element(W.NumPr) is not { } styleNumPr) continue;
                numId ??= W.ValOf(styleNumPr.Element(W.NumId));
                ilvl ??= W.IntAttr(styleNumPr.Element(W.Ilvl), "val");
                if (numId is not null) break;
            }
        }

        if (numId is null or "0" || !_nums.TryGetValue(numId, out var num)) return null;
        var current = ilvl ?? 0;
        return num.Levels.TryGetValue(current, out var level) ? new NumberingLevel(numId, num.AbstractId, current, level) : null;
    }

    /// <summary>Effective definition of a level under numId.</summary>
    public XElement? Level(string numId, int index)
    {
        return _nums.TryGetValue(numId, out var num) ? num.Levels.GetValueOrDefault(index) : null;
    }

    /// <summary>Automatic paragraph numbering; null when absent or canceled.</summary>
    public AutoNumber? Of(ParaRecord record)
    {
        if (LevelOf(record) is not { } used) return null;
        var level = used.Level;
        var text = W.ValOf(level.Element(W.Ns + "lvlText")) ?? "";
        // isLgl displays all referenced numbering levels as decimal digits.
        var legal = level.Element(W.Ns + "isLgl") is { } isLgl && W.OnOff(isLgl) != false;
        string FormatOf(int index) => legal ? "decimal" : W.ValOf((Level(used.NumId, index) ?? level).Element(W.Ns + "numFmt")) ?? "decimal";
        var referenced = Placeholder.Matches(text).Select(match => FormatOf(int.Parse(match.Groups[1].Value) - 1)).ToList();
        return new AutoNumber(FormatOf(used.Index), text, referenced);
    }
}
