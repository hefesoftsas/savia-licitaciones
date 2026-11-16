using System.Text;
using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Model;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;
using Savia.OpenXmlHelper.BlindCheck.Rules;

namespace Savia.OpenXmlHelper.BlindCheck.Fix;

/// <summary>Character edits calculated from full paragraph text: replacements/deletions indexed into rendered text, with the requesting rule recorded.</summary>
sealed class TextEdits
{
    public Dictionary<int, (char Value, string RuleId)> Replace { get; } = [];
    public Dictionary<int, string> Delete { get; } = [];
    public bool IsEmpty => Replace.Count == 0 && Delete.Count == 0;
}

/// <summary>
/// Repair punctuation, spaces, special characters, and manual breaks using whole-paragraph text because run boundaries are arbitrary; checking separate runs containing 3 and .14 could corrupt a number.
/// Then map edits back to w:t elements by each child's text contribution, preserving other elements.
/// </summary>
static class TextFixes
{
    static readonly HashSet<char> DeletedIrregular = [(char)0x200B, (char)0x200C, (char)0x200D, (char)0xFEFF, (char)0x2028, (char)0x2029];
    const char NoBreakSpace = (char)0x00A0;

    public static bool Supports(string ruleId) => ruleId is "text.english_punct" or "text.spaces" or "text.irregular";

    /// <summary>Collect one rule's edits for a paragraph; the first rule at a position wins, with deletion taking precedence over replacement.</summary>
    public static void Collect(string ruleId, RuleContext context, ParaRecord record, TextEdits edits)
    {
        var text = record.Text;
        switch (ruleId)
        {
            case "text.english_punct":
                foreach (var (index, value) in TextRules.FindEnglishPunct(text))
                {
                    edits.Replace.TryAdd(index, (TextRules.ToFullWidth(value), ruleId));
                }

                break;
            case "text.spaces":
                foreach (var index in TextRules.RemovableSpaces(text, context.Profile))
                {
                    edits.Delete.TryAdd(index, ruleId);
                }

                break;
            case "text.irregular":
                for (var index = 0; index < text.Length; index += 1)
                {
                    if (DeletedIrregular.Contains(text[index])) edits.Delete.TryAdd(index, ruleId);
                    else if (text[index] == NoBreakSpace) edits.Replace.TryAdd(index, (' ', ruleId));
                }

                break;
        }
    }

    /// <summary>
    /// Map paragraph edits to individual w:t elements; remove emptied text elements and runs containing only properties.
    /// Return characters actually changed per rule; edits targeting non-w:t content such as tabs or symbols are neither applied nor counted.
    /// </summary>
    public static Dictionary<string, int> Apply(ParaRecord record, TextEdits edits)
    {
        var applied = new Dictionary<string, int>(StringComparer.Ordinal);
        if (edits.IsEmpty) return applied;
        var offset = 0;
        foreach (var run in record.Runs)
        {
            var runChanged = false;
            foreach (var child in run.Element.Elements().ToList())
            {
                var piece = DocumentModel.PieceText(child);
                if (child.Name == W.T && piece.Length > 0)
                {
                    var builder = new StringBuilder(piece.Length);
                    for (var index = 0; index < piece.Length; index += 1)
                    {
                        var position = offset + index;
                        if (edits.Delete.TryGetValue(position, out var deletedBy))
                        {
                            applied[deletedBy] = applied.GetValueOrDefault(deletedBy) + 1;
                            continue;
                        }

                        if (edits.Replace.TryGetValue(position, out var replacement) && replacement.Value != piece[index])
                        {
                            applied[replacement.RuleId] = applied.GetValueOrDefault(replacement.RuleId) + 1;
                            builder.Append(replacement.Value);
                        }
                        else
                        {
                            builder.Append(piece[index]);
                        }
                    }

                    var value = builder.ToString();
                    if (value != piece)
                    {
                        if (value.Length == 0) child.Remove();
                        else PropertyWriter.SetTextValue(child, value);
                        runChanged = true;
                    }
                }

                offset += piece.Length;
            }

            if (runChanged) PropertyWriter.RemoveIfEmptyRun(run.Element);
        }

        return applied;
    }

    /// <summary>
    /// Replace rendered text in [start, start + length) with value: write into the starting w:t, delete remaining characters, and remove emptied text elements and runs.
    /// Return false without changes if the range includes tabs, symbols, or other non-w:t content.
    /// </summary>
    public static bool ReplaceRange(XElement paragraph, int start, int length, string value)
    {
        var offset = 0;
        var pieces = new List<(XElement Element, int Start)>();
        foreach (var run in DocumentModel.RenderedRuns(paragraph))
        {
            foreach (var child in run.Elements())
            {
                var piece = DocumentModel.PieceText(child);
                if (piece.Length > 0 && offset < start + length && offset + piece.Length > start) pieces.Add((child, offset));
                offset += piece.Length;
            }
        }

        if (pieces.Count == 0 || pieces.Any(item => item.Element.Name != W.T)) return false;
        for (var index = 0; index < pieces.Count; index += 1)
        {
            var (element, at) = pieces[index];
            var text = element.Value;
            var updated = text[..Math.Max(0, start - at)] + (index == 0 ? value : "") + text[Math.Min(text.Length, start + length - at)..];
            if (updated.Length > 0)
            {
                PropertyWriter.SetTextValue(element, updated);
                continue;
            }

            var run = element.Parent;
            element.Remove();
            PropertyWriter.RemoveIfEmptyRun(run);
        }

        return true;
    }

    /// <summary>Count manual line breaks: w:br excluding page/column breaks, w:cr, and newline characters embedded in w:t.</summary>
    static int LineBreaks(XElement child)
    {
        if (child.Name == W.T) return child.Value.Count(item => item == '\n');
        return (child.Name == W.Br && W.Attr(child, "type") is null or "textWrapping") || child.Name == W.Cr ? 1 : 0;
    }

    /// <summary>Remove leading spaces from newly split paragraphs; paragraph formatting handles indentation, so manually typed spaces would double it.</summary>
    static void TrimLeadingSpaces(XElement paragraph)
    {
        foreach (var text in DocumentModel.RenderedRuns(paragraph).SelectMany(run => run.Elements(W.T)).ToList())
        {
            var value = text.Value.TrimStart(' ', '　');
            if (value.Length > 0)
            {
                PropertyWriter.SetTextValue(text, value);
                return;
            }

            var run = text.Parent;
            text.Remove();
            PropertyWriter.RemoveIfEmptyRun(run);
        }
    }

    static bool Visible(IEnumerable<XNode> nodes)
    {
        return nodes.OfType<XElement>().SelectMany(element => element.DescendantsAndSelf()).Any(item =>
            (item.Name == W.T && item.Value.Trim().Length > 0) || item.Name == W.Drawing || item.Name == W.Pict || item.Name == W.Object || item.Name == W.Sym
            || (item.Name.Namespace == W.Mc && item.Name.LocalName == "AlternateContent"));
    }

    /// <summary>
    /// Convert manual breaks into paragraphs, preserving paragraph formatting; page-break-before stays only on the first paragraph and section breaks on the last.
    /// Discard resulting blank lines and leading spaces. Do not split headings, numbered/framed paragraphs, paragraphs containing fields,
    /// or breaks inside hyperlink/revision wrappers; record a manual-handling note. Run after per-paragraph repairs so corrected runs move with the split.
    /// Return the number of handled breaks.
    /// </summary>
    public static int SplitLineBreaks(FixContext fix, IEnumerable<ParaRecord> records)
    {
        var count = 0;
        var skipped = 0;
        foreach (var record in records)
        {
            var paragraph = record.Element;
            var direct = paragraph.Elements(W.R_).Sum(run => run.Elements().Sum(LineBreaks));
            if (paragraph.Parent is null || direct == 0) continue;
            var pPr = paragraph.Element(W.PPr);
            if (direct != DocumentModel.RenderedRuns(paragraph).Sum(run => run.Elements().Sum(LineBreaks))
                || fix.Rules.HeadingLevel(record) is not null || StructureFixes.HasNumbering(fix, record)
                || pPr?.Element(W.Ns + "framePr") is not null || paragraph.Descendants(W.FldChar).Any())
            {
                skipped += 1;
                continue;
            }

            var segments = new List<List<XNode>> { new() };
            foreach (var node in paragraph.Nodes().Where(node => node != pPr).ToList())
            {
                node.Remove();
                if (node is not XElement run || run.Name != W.R_ || !run.Elements().Any(child => LineBreaks(child) > 0))
                {
                    segments[^1].Add(node);
                    continue;
                }

                var rPr = run.Element(W.RPr);
                XElement NewRun() => new(W.R_, run.Attributes(), rPr is null ? null : new XElement(rPr));
                var piece = NewRun();
                void Flush()
                {
                    if (piece.Elements().Any(item => item.Name != W.RPr)) segments[^1].Add(piece);
                    piece = NewRun();
                }

                foreach (var child in run.Elements().Where(item => item != rPr).ToList())
                {
                    child.Remove();
                    if (child.Name != W.T && LineBreaks(child) > 0)
                    {
                        Flush();
                        segments.Add([]);
                    }
                    else if (child.Name == W.T && child.Value.Contains('\n'))
                    {
                        var lines = child.Value.Replace("\r", "").Split('\n');
                        for (var index = 0; index < lines.Length; index += 1)
                        {
                            if (index > 0)
                            {
                                Flush();
                                segments.Add([]);
                            }

                            if (lines[index].Length == 0) continue;
                            var text = new XElement(W.T);
                            PropertyWriter.SetTextValue(text, lines[index]);
                            piece.Add(text);
                        }
                    }
                    else
                    {
                        piece.Add(child);
                    }
                }

                Flush();
            }

            // Merge segments without visible content into the preceding paragraph, preserving bookmarks and other markers.
            var kept = new List<List<XNode>>();
            var leading = new List<XNode>();
            foreach (var segment in segments)
            {
                if (!Visible(segment))
                {
                    (kept.Count > 0 ? kept[^1] : leading).AddRange(segment);
                    continue;
                }

                segment.InsertRange(0, leading);
                leading.Clear();
                kept.Add(segment);
            }

            if (kept.Count == 0) kept.Add(leading);
            paragraph.Add(kept[0]);
            var previous = paragraph;
            for (var index = 1; index < kept.Count; index += 1)
            {
                var properties = pPr is null ? null : new XElement(pPr);
                if (index < kept.Count - 1) properties?.Element(W.SectPr)?.Remove();
                var next = new XElement(W.P, properties, kept[index]);
                // Page-break-before may be inherited; explicitly disable it on new paragraphs.
                if (record.Format.PageBreakBefore) PropertyWriter.SetParagraphToggle(next, "pageBreakBefore", false);
                previous.AddAfterSelf(next);
                TrimLeadingSpaces(next);
                previous = next;
            }

            // The section break belongs to the original final line, so keep it on the last split paragraph.
            if (kept.Count > 1) pPr?.Element(W.SectPr)?.Remove();
            count += direct;
            fix.Touch(record);
        }

        if (skipped > 0) fix.Note($"有 {skipped} 段的手动换行在标题、编号段落或超链接、域中，没有自动拆分，请在 Word 中手动处理");
        return count;
    }
}
