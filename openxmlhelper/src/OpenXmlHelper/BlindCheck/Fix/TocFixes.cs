using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Model;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;

namespace Savia.OpenXmlHelper.BlindCheck.Fix;

/// <summary>
/// Remove contents when prohibited, but only with clear markers: TOC fields including outer Word automatic-contents controls,
/// out-of-field entries recognized by contents styles using check criteria, manual contents headed by a contents title whose lines match later paragraphs, and adjacent contents titles.
/// Manual contents inferred only from leaders/page numbers without a title may be body text; leave for manual handling.
/// Clean the join after deletion: keep one page transition and merge empty sections into neighbors to avoid blank pages.
/// </summary>
static class TocFixes
{
    static readonly XName PageBreakBefore = W.Ns + "pageBreakBefore";
    static readonly XName DocPartGallery = W.Ns + "docPartGallery";
    static readonly XName SdtPr = W.Ns + "sdtPr";
    static readonly XName PPrChange = W.Ns + "pPrChange";
    static readonly XName BookmarkStart = W.Ns + "bookmarkStart";
    static readonly XName BookmarkEnd = W.Ns + "bookmarkEnd";

    /// <summary>
    /// A removed-contents join records the closest preceding content block (or document start), whether a page transition originally existed,
    /// and blank paragraphs formerly on the contents page that would become unwanted trailing cover or leading body space.
    /// </summary>
    sealed record Seam(XElement? Before, bool NeedsBreak, List<XElement> Strays);

    public static int Fix(FixContext fix)
    {
        var model = fix.Model;
        if (fix.Rules.Profile.Text("structure.check_toc_present", "hint") != "forbid") return 0;
        var toc = fix.Rules.Outline.Toc;
        var body = model.BodyElement;
        var blocks = Blocks(body);
        var position = new Dictionary<XElement, int>(ReferenceEqualityComparer.Instance);
        for (var index = 0; index < blocks.Count; index += 1) position[blocks[index]] = index;

        var fields = FieldEditor.Collect(body).Where(field => field.Kind == "toc").ToList();
        var spanned = new HashSet<XElement>(ReferenceEqualityComparer.Instance);
        foreach (var field in fields)
        {
            var first = TopIndex(field.Simple ?? field.Markers[0], position);
            var last = TopIndex(field.Simple ?? field.Markers[^1], position);
            if (first is null || last is null) continue;
            for (var index = first.Value; index <= last.Value; index += 1)
            {
                if (blocks[index].Name == W.P) spanned.Add(blocks[index]);
            }
        }

        // Remove entire paragraphs for out-of-field styled contents entries, contents titles, and manual contents rows.
        var removed = new HashSet<XElement>(toc.Styled.Where(item => position.ContainsKey(item) && !spanned.Contains(item)), ReferenceEqualityComparer.Instance);
        var ranges = new List<(int From, int End)>();
        foreach (var (start, end) in Regions(blocks, block => spanned.Contains(block) || removed.Contains(block)))
        {
            var from = start;
            if (FindTitle(model, blocks, start) is { } title)
            {
                removed.Add(title);
                from = position[title];
            }

            ranges.Add((from, end));
        }

        foreach (var (title, lines) in ManualTocs(model, toc, blocks, block => spanned.Contains(block) || removed.Contains(block)))
        {
            removed.Add(title);
            removed.UnionWith(lines);
            ranges.Add((position[title], position[lines[^1]]));
        }

        if (toc.Paragraphs.Any(item => position.ContainsKey(item) && !spanned.Contains(item) && !removed.Contains(item) && DocumentModel.ParagraphText(item).Trim().Length > 0))
        {
            fix.Note("没有目录标题的手工目录（按点导引和页码，或与后文标题重复的编号行识别）没有自动删除，请人工确认后删除");
        }

        if (fields.Count == 0 && ranges.Count == 0) return 0;

        // For headings recognized only through contents, write the contents level into paragraph outline level; printed appearance is unchanged,
        // and removing the contents preserves heading structure so rechecks do not classify them as body text.
        var outline = fix.Rules.Outline;
        foreach (var (paragraph, source) in outline.Sources)
        {
            if (source != "toc" || removed.Contains(paragraph) || !model.Records.TryGetValue(paragraph, out var record) || record.Format.HeadingLevel is not null) continue;
            if (outline.LevelOf(paragraph) is { } level and >= 1 and <= 9) PropertyWriter.SetVal(PropertyWriter.ParagraphChild(paragraph, "outlineLvl"), PropertyWriter.Number(level - 1));
        }

        var seams =ranges.OrderBy(item => item.From).Select(item => MakeSeam(model, blocks, item.From, item.End)).ToList();
        var tablePairs = AdjacentTables(body);
        var endsWithTable = LastBlock(body)?.Name == W.Tbl;
        var sdts = new HashSet<XElement>(ReferenceEqualityComparer.Instance);
        fields.ForEach(FieldEditor.DeleteWhole);
        foreach (var paragraph in spanned.Concat(removed))
        {
            if (paragraph.Parent is null) continue;
            sdts.UnionWith(paragraph.Ancestors(W.Sdt));
            // A field may end inside the next heading; preserve paragraphs with external body text and remove only empty hyperlink shells.
            if (!removed.Contains(paragraph) && Visible(paragraph) && !IsTitle(model, paragraph))
            {
                paragraph.Elements(W.Hyperlink).Where(link => !link.Descendants(W.R_).Any()).ToList().ForEach(link => link.Remove());
                continue;
            }

            Vacate(model, paragraph);
        }

        CleanSdts(sdts);
        foreach (var seam in seams) Mend(model, body, seam);
        KeepTablesApart(body, tablePairs, endsWithTable);
        fix.Touch(model.DocumentPart);
        return Math.Max(1, ranges.Count);
    }

    /// <summary>Top-level body paragraphs/tables expanded through content controls and custom XML, matching the check model.</summary>
    static List<XElement> Blocks(XElement body)
    {
        var blocks = new List<XElement>();
        Collect(body);
        return blocks;

        void Collect(XElement parent)
        {
            foreach (var child in parent.Elements())
            {
                if (child.Name == W.P || child.Name == W.Tbl) blocks.Add(child);
                else if (child.Name == W.Sdt) Collect(child.Element(W.SdtContent) ?? child);
                else if (child.Name == W.CustomXml || child.Name == W.SdtContent) Collect(child);
            }
        }
    }

    /// <summary>Index of the containing top-level body paragraph; null inside table cells.</summary>
    static int? TopIndex(XElement element, Dictionary<XElement, int> position)
    {
        var paragraph = element.AncestorsAndSelf(W.P).LastOrDefault();
        return paragraph is not null && position.TryGetValue(paragraph, out var index) ? index : null;
    }

    static string? StyleName(DocumentModel model, XElement paragraph, out string? styleId)
    {
        styleId = W.ValOf(paragraph.Element(W.PPr)?.Element(W.PStyle));
        return styleId is null ? null : model.Sheet.ById.GetValueOrDefault(styleId)?.DisplayName;
    }

    static bool IsTocStyle(DocumentModel model, XElement paragraph)
    {
        var name = StyleName(model, paragraph, out var styleId);
        return OutlineAnalyzer.TocLevelOfStyle(name, styleId) is not null;
    }

    static bool IsTitle(DocumentModel model, XElement paragraph)
    {
        var name = StyleName(model, paragraph, out var styleId);
        return OutlineAnalyzer.IsTocTitleStyle(name, styleId) || OutlineAnalyzer.IsTocTitle(DocumentModel.ParagraphText(paragraph));
    }

    static List<(int Start, int End)> Regions(List<XElement> blocks, Func<XElement, bool> member)
    {
        var regions = new List<(int, int)>();
        for (var index = 0; index < blocks.Count; index += 1)
        {
            if (!member(blocks[index])) continue;
            var start = index;
            while (index + 1 < blocks.Count && member(blocks[index + 1])) index += 1;
            regions.Add((start, index));
        }

        return regions;
    }

    /// <summary>Standalone contents title before entries, separated by at most two blank paragraphs.</summary>
    static XElement? FindTitle(DocumentModel model, List<XElement> blocks, int start)
    {
        for (var index = start - 1; index >= 0 && index >= start - 3; index -= 1)
        {
            var block = blocks[index];
            if (block.Name != W.P) return null;
            if (IsTitle(model, block)) return block;
            if (Visible(block)) return null;
        }

        return null;
    }

    /// <summary>
    /// Manual contents: a contents-title line followed by at least three consecutive entries whose text matches later paragraphs after removing leaders/page numbers; blank lines may intervene.
    /// Delete only when checks recognize at least one entry, preserving consistent criteria; do not delete without a contents title.
    /// </summary>
    static List<(XElement Title, List<XElement> Lines)> ManualTocs(DocumentModel model, TocInfo toc, List<XElement> blocks, Func<XElement, bool> handled)
    {
        var texts = blocks.Select(block => block.Name == W.P ? DocumentModel.ParagraphText(block) : "").ToList();
        var lastIndex = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var index = 0; index < blocks.Count; index += 1)
        {
            var normalized = OutlineAnalyzer.NormalizeTitle(texts[index]);
            if (normalized.Length > 0) lastIndex[normalized] = index;
        }

        var result = new List<(XElement, List<XElement>)>();
        for (var index = 0; index < blocks.Count; index += 1)
        {
            if (blocks[index].Name != W.P || handled(blocks[index]) || !IsTitle(model, blocks[index])) continue;
            var lines = new List<XElement>();
            var pending = new List<XElement>();
            var count = 0;
            var cursor = index + 1;
            for (; cursor < blocks.Count; cursor += 1)
            {
                var block = blocks[cursor];
                if (block.Name != W.P || handled(block)) break;
                if (texts[cursor].Trim().Length == 0)
                {
                    if (Visible(block) || HasPageBreak(block) || SectionOf(block) is not null) break;
                    pending.Add(block);
                    continue;
                }

                var normalized = OutlineAnalyzer.NormalizeTitle(texts[cursor]);
                if (normalized.Length == 0 || !lastIndex.TryGetValue(normalized, out var last) || last <= cursor) break;
                if (lines.Count > 0) lines.AddRange(pending);
                pending.Clear();
                lines.Add(block);
                count += 1;
            }

            if (count < 3 || !lines.Any(toc.Paragraphs.Contains)) continue;
            result.Add((blocks[index], lines));
            index = cursor - 1;
        }

        return result;
    }

    static Seam MakeSeam(DocumentModel model, List<XElement> blocks, int from, int end)
    {
        var before = from - 1;
        while (before >= 0 && IsGap(blocks[before])) before -= 1;
        var after = end + 1;
        while (after < blocks.Count && IsGap(blocks[after])) after += 1;
        var needs = false;
        if (before >= 0 && blocks[before].Name == W.P) needs = TrailingBreaks(blocks[before]).Count > 0 || PageSection(blocks[before]);
        for (var index = before + 1; index < after; index += 1)
        {
            var block = blocks[index];
            needs |= block.Name == W.P && (HasPageBreak(block) || PageSection(block) || BreaksBefore(model, block));
        }

        if (after < blocks.Count && blocks[after].Name == W.P) needs |= BreaksBefore(model, blocks[after]) || LeadingBreaks(blocks[after]).Count > 0;
        var strays = Strays(model, blocks, from, end, before, after);
        // Blank paragraphs between title and entries are also on the contents page.
        for (var index = from + 1; index <= end; index += 1)
        {
            if (blocks[index].Name == W.P && !Visible(blocks[index]) && !HasPageBreak(blocks[index]) && SectionOf(blocks[index]) is null) strays.Add(blocks[index]);
        }

        // Locate the join by the nearest preceding content block, which survives deletion; intervening blank paragraphs may disappear.
        return new Seam(before >= 0 ? blocks[before] : null, needs, strays);
    }

    /// <summary>
    /// Blank contents-page paragraphs lie between contents and the preceding/following page transitions, without page/section breaks themselves.
    /// If contents shares a page with neighboring content, blank paragraphs on that side are normal spacing and excluded.
    /// </summary>
    static List<XElement> Strays(DocumentModel model, List<XElement> blocks, int from, int end, int before, int after)
    {
        var strays = new List<XElement>();
        bool Separator(XElement block) => HasPageBreak(block) || PageSection(block);

        // When contents begins with page-break-before, preceding blank paragraphs belong to the previous page and are excluded.
        if (!BreaksBefore(model, blocks[from]))
        {
            var side = new List<XElement>();
            var index = from - 1;
            for (; index > before; index -= 1)
            {
                if (Separator(blocks[index])) break;
                side.Add(blocks[index]);
                if (BreaksBefore(model, blocks[index])) break;
            }

            var paged = index > before
                || side.Any(block => BreaksBefore(model, block))
                || (before >= 0 && blocks[before].Name == W.P && (TrailingBreaks(blocks[before]).Count > 0 || PageSection(blocks[before])))
                || before < 0;
            if (paged) strays.AddRange(side);
        }

        var tail = new List<XElement>();
        var cursor = end + 1;
        var ended = false;
        for (; cursor < after; cursor += 1)
        {
            if (BreaksBefore(model, blocks[cursor])) { ended = true; break; }
            if (Separator(blocks[cursor])) { ended = true; break; }
            tail.Add(blocks[cursor]);
        }

        if (ended || after >= blocks.Count || (blocks[after].Name == W.P && (BreaksBefore(model, blocks[after]) || LeadingBreaks(blocks[after]).Count > 0))) strays.AddRange(tail);
        return strays;
    }

    static bool IsVisibleElement(XElement element)
    {
        if (element.Name == W.T) return element.Value.Trim().Length > 0;
        if (element.Name == W.Tab || element.Name == W.Sym) return element.Parent?.Name == W.R_;
        if (element.Name == W.Br) return W.Attr(element, "type") != "page";
        return element.Name == W.Drawing || element.Name == W.Pict || element.Name == W.Object || element.Name == W.FldChar || element.Name == W.TxbxContent;
    }

    /// <summary>Visible paragraph content includes text, images, objects, tabs, line breaks, or fields, but not page breaks.</summary>
    internal static bool Visible(XElement paragraph) => paragraph.Descendants().Any(IsVisibleElement);

    /// <summary>Join paragraphs have no visible content and may contain only page or section breaks.</summary>
    static bool IsGap(XElement block) => block.Name == W.P && !Visible(block);

    internal static XElement? SectionOf(XElement paragraph) => paragraph.Element(W.PPr)?.Element(W.SectPr);

    /// <summary>A section break that starts a new page; continuous sections do not change pages.</summary>
    static bool PageSection(XElement paragraph)
    {
        var section = SectionOf(paragraph);
        return section is not null && W.ValOf(section.Element(W.Type)) != "continuous";
    }

    static bool HasPageBreak(XElement paragraph) => paragraph.Descendants(W.Br).Any(item => W.Attr(item, "type") == "page" && !item.Ancestors(W.TxbxContent).Any());

    /// <summary>Paragraph page-break-before, set directly or inherited from a style.</summary>
    internal static bool BreaksBefore(DocumentModel model, XElement paragraph)
    {
        var direct = paragraph.Element(W.PPr)?.Element(PageBreakBefore);
        if (direct is not null) return W.OnOff(direct) ?? true;
        var style = model.Sheet.ResolveParagraphStyle(W.ValOf(paragraph.Element(W.PPr)?.Element(W.PStyle)));
        return model.Sheet.Chain(style, "paragraph").Select(item => item.PPr?.Element(PageBreakBefore)).FirstOrDefault(item => item is not null) is { } inherited && (W.OnOff(inherited) ?? true);
    }

    /// <summary>Content used to locate page breaks excludes field markers but includes field-result text.</summary>
    static bool IsContent(XElement element) => element.Name != W.FldChar && IsVisibleElement(element);

    /// <summary>Trailing page break: a page break after the final content.</summary>
    internal static List<XElement> TrailingBreaks(XElement paragraph)
    {
        var breaks = new List<XElement>();
        foreach (var element in paragraph.Descendants().Reverse())
        {
            if (element.Name == W.Br && W.Attr(element, "type") == "page") breaks.Add(element);
            else if (IsContent(element)) break;
        }

        return breaks;
    }

    /// <summary>Leading page break: before the first content, such as a TOC field end followed by a break and heading text.</summary>
    internal static List<XElement> LeadingBreaks(XElement paragraph)
    {
        var breaks = new List<XElement>();
        foreach (var element in paragraph.Descendants())
        {
            if (element.Name == W.Br && W.Attr(element, "type") == "page") breaks.Add(element);
            else if (IsContent(element)) break;
        }

        return breaks;
    }

    static void RemoveBreaks(IEnumerable<XElement> breaks)
    {
        foreach (var item in breaks.ToList())
        {
            var run = item.Parent;
            item.Remove();
            PropertyWriter.RemoveIfEmptyRun(run);
        }
    }

    /// <summary>Delete a paragraph and matching bookmark endpoints to avoid unpaired bookmarks.</summary>
    static void DeleteParagraph(XElement paragraph)
    {
        var root = paragraph.Document?.Root;
        foreach (var mark in paragraph.Descendants().Where(item => item.Name == BookmarkStart || item.Name == BookmarkEnd).ToList())
        {
            var id = W.Attr(mark, "id");
            var other = mark.Name == BookmarkStart ? BookmarkEnd : BookmarkStart;
            root?.Descendants(other).Where(item => W.Attr(item, "id") == id && !item.Ancestors().Contains(paragraph)).ToList().ForEach(item => item.Remove());
        }

        paragraph.Remove();
    }

    /// <summary>
    /// When clearing contents paragraphs containing section/page breaks, retain properties and page breaks but remove contents style and page-break-before; join cleanup decides whether to keep them.
    /// Delete other paragraphs entirely.
    /// </summary>
    static void Vacate(DocumentModel model, XElement paragraph)
    {
        if (SectionOf(paragraph) is null && !HasPageBreak(paragraph))
        {
            DeleteParagraph(paragraph);
            return;
        }

        var pageBreaks = paragraph.Descendants(W.Br).Count(item => W.Attr(item, "type") == "page");
        foreach (var node in paragraph.Nodes().Where(node => node is not XElement element || element.Name != W.PPr).ToList()) node.Remove();
        for (var index = 0; index < pageBreaks; index += 1) paragraph.Add(new XElement(W.R_, new XElement(W.Br, new XAttribute(W.Type, "page"))));
        var properties = paragraph.Element(W.PPr);
        if (properties is null) return;
        if (IsTocStyle(model, paragraph) || IsTitle(model, paragraph)) properties.Element(W.PStyle)?.Remove();
        properties.Element(PageBreakBefore)?.Remove();
    }

    /// <summary>Remove empty contents controls; unwrap remaining paragraphs from Word automatic-contents gallery controls before removing them.</summary>
    static void CleanSdts(HashSet<XElement> sdts)
    {
        foreach (var sdt in sdts.OrderByDescending(item => item.Ancestors().Count()))
        {
            if (sdt.Parent is null) continue;
            var content = sdt.Element(W.SdtContent);
            if (content is null || !content.Elements().Any())
            {
                sdt.Remove();
                continue;
            }

            var gallery = W.ValOf(sdt.Element(SdtPr)?.Descendants(DocPartGallery).FirstOrDefault());
            if (gallery is null || !(gallery.Contains("Table of Contents", StringComparison.OrdinalIgnoreCase) || gallery.Contains("目录"))) continue;
            var nodes = content.Nodes().ToList();
            foreach (var node in nodes) node.Remove();
            sdt.AddBeforeSelf(nodes);
            sdt.Remove();
        }
    }

    /// <summary>
    /// Keep only one page transition between nearest surrounding content blocks. Prefer a section break on the preceding block or the first join section break,
    /// moving the latter onto the preceding paragraph to avoid a standalone blank page; then prefer a trailing break, the first join break paragraph, or a leading break on following content.
    /// Remove others and merge empty sections into the next. If a formerly existing transition disappears, append a break to preceding content.
    /// No page transition is needed at document start or end.
    /// </summary>
    static void Mend(DocumentModel model, XElement body, Seam seam)
    {
        foreach (var stray in seam.Strays)
        {
            if (stray.Parent is not null && !Visible(stray) && SectionOf(stray) is null && !HasPageBreak(stray)) DeleteParagraph(stray);
        }

        var blocks = Blocks(body);
        var anchor = seam.Before is { Parent: not null } before ? blocks.IndexOf(before) : -1;
        var start = anchor;
        while (start >= 0 && IsGap(blocks[start])) start -= 1;
        var end = anchor + 1;
        while (end < blocks.Count && IsGap(blocks[end])) end += 1;
        var previous = start >= 0 ? blocks[start] : null;
        var next = end < blocks.Count ? blocks[end] : null;
        var gaps = blocks.Skip(start + 1).Take(end - start - 1).ToList();
        var sections = gaps.Where(item => SectionOf(item) is not null).ToList();
        var pages = gaps.Where(item => SectionOf(item) is null && HasPageBreak(item)).ToList();
        var previousParagraph = previous?.Name == W.P ? previous : null;
        var leading = next?.Name == W.P ? LeadingBreaks(next) : [];

        if (previous is null || next is null || (previousParagraph is not null && PageSection(previousParagraph)))
        {
            // At document boundaries or after a block with its own section break, join sections are empty and all page breaks are redundant.
            sections.ForEach(item => DropSection(body, item));
            pages.ForEach(StripBreaks);
            RemoveBreaks(leading);
            if (next is null && previousParagraph is not null) RemoveBreaks(TrailingBreaks(previousParagraph));
            return;
        }

        var separated = false;
        if (sections.Count > 0)
        {
            sections.Skip(1).ToList().ForEach(item => DropSection(body, item));
            var keep = sections[0];
            separated = PageSection(keep);
            MoveSectionUp(blocks, keep);
            if (keep.Parent is not null && HasPageBreak(keep)) StripBreaks(keep);
        }

        if (separated || (previousParagraph is not null && TrailingBreaks(previousParagraph).Count > 0))
        {
            if (separated && previousParagraph is not null) RemoveBreaks(TrailingBreaks(previousParagraph));
            pages.ForEach(StripBreaks);
            RemoveBreaks(leading);
        }
        else if (pages.Count > 0)
        {
            // Keep the earliest break paragraph, usually the original pre-contents transition and cover-recognition boundary, preserving cover detection.
            pages.Skip(1).ToList().ForEach(StripBreaks);
            RemoveBreaks(leading);
        }
        else if (leading.Count > 0)
        {
            RemoveBreaks(leading.Skip(1));
        }
        else if (seam.NeedsBreak && !(next.Name == W.P && BreaksBefore(model, next)))
        {
            if (previousParagraph is not null) previousParagraph.Add(new XElement(W.R_, new XElement(W.Br, new XAttribute(W.Type, "page"))));
            else next.AddBeforeSelf(new XElement(W.P, new XElement(W.R_, new XElement(W.Br, new XAttribute(W.Type, "page")))));
        }
    }

    /// <summary>Remove page breaks and paragraphs left with only properties, except section-break paragraphs.</summary>
    static void StripBreaks(XElement paragraph)
    {
        RemoveBreaks(paragraph.Descendants(W.Br).Where(item => W.Attr(item, "type") == "page"));
        if (SectionOf(paragraph) is null && !Visible(paragraph)) DeleteParagraph(paragraph);
    }

    /// <summary>
    /// Move a join section break to the immediately preceding paragraph, the same section's final paragraph; delete its now-empty original paragraph.
    /// Leave it in place if the preceding block is a table or already has a section break.
    /// </summary>
    static void MoveSectionUp(List<XElement> blocks, XElement paragraph)
    {
        var index = blocks.IndexOf(paragraph);
        var target = index > 0 ? blocks[index - 1] : null;
        if (target is null || target.Name != W.P || target.Parent is null || SectionOf(target) is not null) return;
        var section = SectionOf(paragraph)!;
        section.Remove();
        var properties = target.Element(W.PPr);
        if (properties is null)
        {
            properties = new XElement(W.PPr);
            target.AddFirst(properties);
        }

        if (properties.Element(PPrChange) is { } change) change.AddBeforeSelf(section);
        else properties.Add(section);
        if (!Visible(paragraph) && !HasPageBreak(paragraph)) DeleteParagraph(paragraph);
    }

    /// <summary>
    /// Remove empty sections and their contentless paragraphs. Copy missing header/footer references into the next section,
    /// preserving inheritance for later sections that used this section's headers/footers.
    /// </summary>
    static void DropSection(XElement body, XElement paragraph)
    {
        var section = SectionOf(paragraph)!;
        var all = body.Descendants(W.SectPr).Where(item => item.Parent?.Name == W.PPr || item.Parent == body).ToList();
        var next = all.SkipWhile(item => item != section).Skip(1).FirstOrDefault();
        if (next is not null)
        {
            foreach (var reference in section.Elements().Where(item => item.Name == W.HeaderReference || item.Name == W.FooterReference).Reverse())
            {
                if (!next.Elements(reference.Name).Any(item => W.Attr(item, "type") == W.Attr(reference, "type"))) next.AddFirst(new XElement(reference));
            }
        }

        section.Remove();
        if (!Visible(paragraph) && !HasPageBreak(paragraph)) DeleteParagraph(paragraph);
    }

    static XElement? LastBlock(XElement body) => Blocks(body).LastOrDefault();

    static HashSet<XElement> AdjacentTables(XElement body)
    {
        return new HashSet<XElement>(
            body.Descendants(W.Tbl).Where(table => table.ElementsAfterSelf().FirstOrDefault()?.Name == W.Tbl),
            ReferenceEqualityComparer.Instance);
    }

    /// <summary>Insert a blank paragraph to separate tables joined by deletion and prevent a document from ending with a table.</summary>
    static void KeepTablesApart(XElement body, HashSet<XElement> pairs, bool endedWithTable)
    {
        foreach (var table in body.Descendants(W.Tbl).ToList())
        {
            if (table.ElementsAfterSelf().FirstOrDefault()?.Name == W.Tbl && !pairs.Contains(table)) table.AddAfterSelf(new XElement(W.P));
        }

        if (!endedWithTable && LastBlock(body) is { } last && last.Name == W.Tbl) last.AddAfterSelf(new XElement(W.P));
    }
}
