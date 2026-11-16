using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Model;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;
using Savia.OpenXmlHelper.BlindCheck.Rules;
using static Savia.OpenXmlHelper.BlindCheck.Fix.PropertyWriter;

namespace Savia.OpenXmlHelper.BlindCheck.Fix;

/// <summary>
/// Document-wide repairs: page settings, cell shading, empty paragraphs, bookmarks, headers/footers, hyperlinks, identity fields, comments, revisions, properties, heading numbers, and image metadata.
/// Use the same criteria as the corresponding checks; each repair returns its modification count.
/// </summary>
static class StructureFixes
{
    public static readonly Dictionary<string, Func<FixContext, int>> Whole = new(StringComparer.Ordinal)
    {
        ["page.paper_size"] = FixPaper,
        ["page.margins"] = FixMargins,
        ["page.columns"] = FixColumns,
        ["page.background"] = FixBackground,
        ["table.shading"] = FixShading,
        ["struct.empty_paragraph"] = FixEmptyParagraphs,
        ["struct.bookmark"] = FixBookmarks,
        ["struct.header_footer"] = FixHeaderFooter,
        ["struct.hyperlink"] = FixHyperlinks,
        ["struct.field"] = FixFields,
        ["struct.comment"] = FixComments,
        ["struct.revision"] = FixRevisions,
        ["struct.doc_props"] = PropertiesFixes.FixDocumentProperties,
        ["struct.heading_number"] = HeadingNumberFixes.Fix,
        ["struct.toc"] = TocFixes.Fix,
        ["image.meta"] = PropertiesFixes.FixImageMetadata,
    };

    static readonly XName CommentRangeStart = W.Ns + "commentRangeStart";
    static readonly XName CommentRangeEnd = W.Ns + "commentRangeEnd";
    static readonly XName CommentReference = W.Ns + "commentReference";
    static readonly XName BookmarkStart = W.Ns + "bookmarkStart";
    static readonly XName BookmarkEnd = W.Ns + "bookmarkEnd";

    /// <summary>Replace an element with its children, detaching them first so LINQ to XML does not clone nodes and change identity.</summary>
    public static void Unwrap(XElement element)
    {
        if (element.Parent is null) return;
        var nodes = element.Nodes().ToList();
        foreach (var node in nodes) node.Remove();
        element.AddBeforeSelf(nodes);
        element.Remove();
    }

    static IEnumerable<XElement> SectionElements(DocumentModel model)
    {
        return model.BodyElement.Descendants(W.P)
            .Select(paragraph => paragraph.Element(W.PPr)?.Element(W.SectPr))
            .Where(item => item is not null)
            .Cast<XElement>()
            .Concat(model.BodyElement.Elements(W.SectPr))
            .ToList();
    }

    static int FixPaper(FixContext fix)
    {
        var (_, width, height) = PageRules.Paper(fix.Rules);
        var count = 0;
        foreach (var section in SectionElements(fix.Model))
        {
            var size = SectionChild(section, "pgSz");
            var currentWidth = W.IntAttr(size, "w");
            var currentHeight = W.IntAttr(size, "h");
            var landscape = currentWidth is { } w && currentHeight is { } h ? w > h : W.Attr(size, "orient") == "landscape";
            var shortSide = Math.Round(Math.Min(width, height) * Units.TwipsPerCm);
            var longSide = Math.Round(Math.Max(width, height) * Units.TwipsPerCm);
            var (newWidth, newHeight) = landscape ? (longSide, shortSide) : (shortSide, longSide);
            if (currentWidth is { } cw && currentHeight is { } ch && Math.Abs(cw - newWidth) < 30 && Math.Abs(ch - newHeight) < 30) continue;
            SetAttr(size, "w", Number(newWidth));
            SetAttr(size, "h", Number(newHeight));
            count += 1;
        }

        if (count > 0) fix.Touch(fix.Model.DocumentPart);
        return count;
    }

    static int FixMargins(FixContext fix)
    {
        var profile = fix.Rules.Profile;
        var tolerance = profile.Number("body.tolerance_margin_cm") ?? 0.02;
        var count = 0;
        foreach (var section in SectionElements(fix.Model))
        {
            var margin = SectionChild(section, "pgMar");
            // All seven pgMar attributes are required; supply defaults when creating it.
            foreach (var (name, value) in new[] { ("header", "851"), ("footer", "992"), ("gutter", "0") })
            {
                if (W.Attr(margin, name) is null) SetAttr(margin, name, value);
            }

            foreach (var side in new[] { "top", "bottom", "left", "right" })
            {
                if (profile.Number($"page.margin_{side}_cm") is not { } expected) continue;
                var current = W.IntAttr(margin, side);
                if (current is { } value && Math.Abs(Units.TwipsToCm(Math.Abs(value)) - expected) <= tolerance) continue;
                // Negative vertical margins mean not following header/footer movement; preserve their signs.
                var sign = current is < 0 ? -1 : 1;
                SetAttr(margin, side, Number(sign * expected * Units.TwipsPerCm));
                count += 1;
            }
        }

        if (count > 0) fix.Touch(fix.Model.DocumentPart);
        return count;
    }

    static int FixColumns(FixContext fix)
    {
        var count = 0;
        foreach (var section in SectionElements(fix.Model))
        {
            var columns = section.Element(W.Cols);
            if ((W.IntAttr(columns, "num") ?? 1) <= 1 || columns is null) continue;
            SetAttr(columns, "num", "1");
            SetAttr(columns, "equalWidth", null);
            columns.Elements(W.Ns + "col").Remove();
            count += 1;
        }

        if (count > 0) fix.Touch(fix.Model.DocumentPart);
        return count;
    }

    /// <summary>Remove the page background (w:document/w:background).</summary>
    static int FixBackground(FixContext fix)
    {
        var background = fix.Model.BodyElement.Parent?.Element(W.Ns + "background");
        if (background is null) return 0;
        background.Remove();
        fix.Touch(fix.Model.DocumentPart);
        return 1;
    }

    static int FixShading(FixContext fix)
    {
        var count = 0;
        foreach (var shading in fix.Model.BodyElement.Descendants(W.Tc).Select(cell => cell.Element(W.TcPr)?.Element(W.Shd)).Where(item => item is not null).Cast<XElement>())
        {
            var fill = W.Attr(shading, "fill")?.ToUpperInvariant();
            if (string.IsNullOrEmpty(fill) || fill is "AUTO" or "000000" or "FFFFFF") continue;
            SetVal(shading, "clear");
            SetAttr(shading, "fill", "auto");
            foreach (var name in new[] { "themeFill", "themeFillShade", "themeFillTint" }) SetAttr(shading, name, null);
            count += 1;
        }

        if (count > 0) fix.Touch(fix.Model.DocumentPart);
        return count;
    }

    /// <summary>An empty numbered paragraph, directly or through styles, still consumes a number; deletion would skip numbering.</summary>
    public static bool HasNumbering(FixContext fix, ParaRecord record)
    {
        var direct = record.Element.Element(W.PPr)?.Element(W.NumPr);
        if (direct is not null) return W.ValOf(direct.Element(W.NumId)) != "0";
        var style = fix.Model.Sheet.ResolveParagraphStyle(record.Format.StyleId);
        return fix.Model.Sheet.Chain(style, "paragraph").Any(item => item.PPr?.Element(W.NumPr) is not null);
    }

    /// <summary>
    /// An empty paragraph is safely removable only without numbering and with only properties, empty runs, proofing markers, and _GoBack bookmarks;
    /// preserve the sole paragraph in a content control. Callers exclude section/page breaks and required table separators.
    /// Preserve page-break-before paragraphs, whether direct or inherited, since deletion moves following content onto the preceding page; leave for manual handling.
    /// </summary>
    static bool Deletable(FixContext fix, ParaRecord record)
    {
        var paragraph = record.Element;
        if (paragraph.Parent is null || HasNumbering(fix, record) || TocFixes.BreaksBefore(fix.Model, paragraph)) return false;
        if (paragraph.Parent.Name == W.SdtContent && paragraph.Parent.Elements(W.P).Count() == 1) return false;
        var goBack = paragraph.Elements(BookmarkStart).Where(item => W.Attr(item, "name") == "_GoBack").Select(item => W.Attr(item, "id")).ToHashSet();
        foreach (var child in paragraph.Elements())
        {
            if (child.Name == W.PPr || child.Name.LocalName == "proofErr") continue;
            if (child.Name == BookmarkStart && W.Attr(child, "name") == "_GoBack") continue;
            if (child.Name == BookmarkEnd && goBack.Contains(W.Attr(child, "id"))) continue;
            if (child.Name != W.R_) return false;
            if (child.Elements().Any(item => item.Name != W.RPr && item.Name != W.T && item.Name != W.Tab && item.Name != W.Br && item.Name.LocalName != "lastRenderedPageBreak")) return false;
        }

        return true;
    }

    static int FixEmptyParagraphs(FixContext fix)
    {
        var model = fix.Model;
        var count = 0;
        foreach (var cell in model.BodyElement.Descendants(W.Tc).ToList())
        {
            var paragraphs = cell.Elements(W.P).Select(item => model.Records.GetValueOrDefault(item)).Where(item => item is not null).Cast<ParaRecord>().ToList();
            if (paragraphs.Count < 2 || paragraphs.Any(item => !item.IsEmpty)) continue;
            foreach (var record in paragraphs.Skip(1).Where(item => Deletable(fix, item)))
            {
                record.Element.Remove();
                count += 1;
            }
        }

        var blocks = model.BodyBlocks;
        var required = new HashSet<XElement>(ReferenceEqualityComparer.Instance);
        for (var index = 0; index < blocks.Count; index += 1)
        {
            if (blocks[index].IsTable) continue;
            var previousTable = index > 0 && blocks[index - 1].IsTable;
            var nextTable = index + 1 < blocks.Count && blocks[index + 1].IsTable;
            if ((previousTable && nextTable) || index == blocks.Count - 1) required.Add(blocks[index].Element);
        }

        foreach (var record in fix.Rules.Groups.Body)
        {
            if (!record.IsEmpty || record.HasSectionBreak || record.HasPageBreak || required.Contains(record.Element)) continue;
            if (!Deletable(fix, record)) continue;
            record.Element.Remove();
            count += 1;
        }

        count += MovePageBreaks(fix, required);
        if (count > 0) fix.Touch(model.DocumentPart);
        return count;
    }

    /// <summary>
    /// For an empty paragraph with one page break, move the break to the preceding paragraph's end before deletion, preserving break count and position without the extra blank line.
    /// Do not move when the preceding block is a table, contents, section-break paragraph, or already ends with a page break; consecutive break paragraphs may intentionally create blank pages, so move only the first.
    /// Run after normal empty-paragraph removal so the preceding paragraph is the actual adjacent content.
    /// </summary>
    static int MovePageBreaks(FixContext fix, HashSet<XElement> required)
    {
        var model = fix.Model;
        var count = 0;
        foreach (var record in fix.Rules.Groups.Body)
        {
            var paragraph = record.Element;
            if (!record.IsEmpty || record.HasSectionBreak || !record.HasPageBreak || required.Contains(paragraph)) continue;
            if (paragraph.Parent != model.BodyElement || !Deletable(fix, record)) continue;
            var breaks = paragraph.Descendants(W.Br).Select(item => W.Attr(item, "type")).Where(type => type is "page" or "column").ToList();
            if (breaks is not ["page"]) continue;
            var previous = paragraph.ElementsBeforeSelf().LastOrDefault(item => item.Name == W.P || item.Name == W.Tbl || item.Name == W.Sdt);
            if (previous?.Name != W.P || !TocFixes.Visible(previous) || TocFixes.SectionOf(previous) is not null
                || TocFixes.TrailingBreaks(previous).Count > 0 || fix.Rules.Outline.IsToc(previous)) continue;
            previous.Add(new XElement(W.R_, new XElement(W.Br, new XAttribute(W.Type, "page"))));
            paragraph.Remove();
            count += 1;
        }

        return count;
    }

    static int FixBookmarks(FixContext fix)
    {
        var body = fix.Model.BodyElement;
        var count = 0;
        foreach (var bookmark in body.Descendants(BookmarkStart).ToList())
        {
            var name = W.Attr(bookmark, "name");
            if (string.IsNullOrWhiteSpace(name) || name.StartsWith('_') || PrivacyRules.IdentityHits(fix.Rules, name).Count == 0) continue;
            var id = W.Attr(bookmark, "id");
            body.Descendants(BookmarkEnd).Where(item => W.Attr(item, "id") == id).ToList().ForEach(item => item.Remove());
            bookmark.Remove();
            count += 1;
        }

        if (count > 0) fix.Touch(fix.Model.DocumentPart);
        return count;
    }

    /// <summary>
    /// If header/footer content is prohibited, clear it to one empty paragraph and override inherited header rules with no border; preserve page-number-only paragraphs when allowed,
    /// including WPS page-number text boxes. If only page numbers are prohibited, remove only those fields. Match check criteria.
    /// Remove relationships for deleted images and other content; also remove image files with no remaining references.
    /// </summary>
    static int FixHeaderFooter(FixContext fix)
    {
        var model = fix.Model;
        var profile = fix.Rules.Profile;
        var pageMode = profile.Text("structure.page_number");
        var count = 0;
        foreach (var part in model.HeaderParts.Concat(model.FooterParts))
        {
            var root = model.Parts[part].Root;
            if (root is null) continue;
            var isHeader = model.HeaderParts.Contains(part);
            var fields = FieldEditor.Collect(root).Where(field => StructureRules.PageFields.Contains(field.Kind)).ToList();
            var pageAllowed = StructureRules.PageNumberAllowed(pageMode, isHeader);
            var hasContent = StructureRules.HeaderFooterMarks(model.Sheet, root, fields.Count > 0).Count > 0;
            if (StructureRules.ContentForbidden(profile, pageMode, isHeader) && (hasContent || (!pageAllowed && fields.Count > 0)))
            {
                List<XElement> keep = pageAllowed && fields.Count > 0
                    ? root.Elements()
                        .Where(block => (block.Name == W.P || block.Name == W.Sdt)
                            && StructureRules.HeaderFooterTexts(block).Any()
                            && StructureRules.HeaderFooterContent(block, true).Count == 0)
                        .ToList()
                    : [];
                if (pageAllowed && fields.Count > 0 && !keep.Any(block => FieldEditor.Collect(block).Any(field => StructureRules.PageFields.Contains(field.Kind))))
                {
                    fix.Note($"{fix.Rules.PartLabel(part)}的页码与其他内容在同一段，已随内容一起清空，请在 Word 中重新插入页码");
                }

                ClearPart(fix, part, root, keep);
                count += 1;
                continue;
            }

            if (!pageAllowed && fields.Count > 0)
            {
                fields.ForEach(FieldEditor.DeleteWhole);
                fix.Touch(part);
                count += 1;
            }
        }

        return count;
    }

    static HashSet<string> RelationshipIds(IEnumerable<XElement> elements)
    {
        return elements.DescendantsAndSelf()
            .SelectMany(element => element.Attributes())
            .Where(attribute => attribute.Name.Namespace == W.R)
            .Select(attribute => attribute.Value)
            .ToHashSet(StringComparer.Ordinal);
    }

    /// <summary>Clear the header/footer except retained top-level blocks and remove their horizontal rules; if none remain, insert an empty borderless paragraph.</summary>
    static void ClearPart(FixContext fix, string part, XElement root, List<XElement> keep)
    {
        var style = root.Descendants(W.P).FirstOrDefault()?.Element(W.PPr)?.Element(W.PStyle);
        var removed = root.Nodes().Where(node => node is not XElement element || !keep.Contains(element)).ToList();
        var kept = RelationshipIds(keep);
        var relationshipIds = RelationshipIds(removed.OfType<XElement>());
        relationshipIds.ExceptWith(kept);
        var removedTargets = fix.Package.Relationships(part)
            .Where(item => relationshipIds.Contains(item.Id) && !item.External && item.Type.EndsWith("/image", StringComparison.Ordinal))
            .Select(item => DocxPackage.ResolveTarget(part, item.Target))
            .ToList();

        removed.ForEach(node => node.Remove());
        // Explicit nil borders override inherited rules, such as the bottom border of the Header style.
        XElement[] NoBorders() => StructureRules.BorderSides.Select(side => new XElement(W.Ns + side, new XAttribute(W.Val, "nil"))).ToArray();
        if (keep.Count == 0)
        {
            var properties = new XElement(W.PPr);
            if (style is not null) properties.Add(new XElement(style));
            properties.Add(new XElement(W.Ns + "pBdr", NoBorders()));
            root.Add(new XElement(W.P, properties));
        }

        foreach (var paragraph in keep.SelectMany(block => StructureRules.BorderedParagraphs(fix.Model.Sheet, block)).ToList())
        {
            PropertyWriter.ParagraphChild(paragraph, "pBdr").ReplaceNodes(NoBorders());
        }

        foreach (var id in relationshipIds) fix.Writer.RemoveRelationship(part, id);
        fix.Touch(part);

        foreach (var target in removedTargets.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            // Use repaired relationships: if multiple headers share a logo, delete it only after clearing its final header reference.
            var stillUsed = fix.Package.AllRelationships()
                .Any(item => !fix.Writer.IsRelationshipRemoved(item.SourcePart, item.Relationship.Id)
                    && !item.Relationship.External
                    && string.Equals(DocxPackage.ResolveTarget(item.SourcePart, item.Relationship.Target), target, StringComparison.OrdinalIgnoreCase));
            if (!stillUsed && !fix.Package.HasContentTypeOverride(target)) fix.Writer.RemovePart(target);
        }
    }

    static bool IsHyperlinkStyle(FixContext fix, XElement run)
    {
        var styleId = W.ValOf(run.Element(W.RPr)?.Element(W.RStyle));
        if (styleId is null) return false;
        var name = fix.Model.Sheet.DisplayName(styleId);
        return name.Equals("Hyperlink", StringComparison.OrdinalIgnoreCase) || name == "超链接";
    }

    /// <summary>Unlink external hyperlinks while preserving text; remove hyperlink character styles to avoid blue underlining and delete relationship URLs.</summary>
    static int FixHyperlinks(FixContext fix)
    {
        var count = 0;
        foreach (var (part, document) in fix.Model.Parts)
        {
            if (document.Root is null) continue;
            var relationships = fix.Package.Relationships(part).ToDictionary(item => item.Id, StringComparer.Ordinal);
            var changed = false;
            foreach (var link in document.Root.Descendants(W.Hyperlink).ToList())
            {
                var id = link.Attribute(W.RId)?.Value;
                if (id is null || !relationships.TryGetValue(id, out var relationship)) continue;
                if (!relationship.External && !StructureRules.IsExternalTarget(relationship.Target)) continue;
                foreach (var run in link.Descendants(W.R_).Where(run => IsHyperlinkStyle(fix, run))) run.Element(W.RPr)!.Element(W.RStyle)!.Remove();
                Unwrap(link);
                fix.Writer.RemoveRelationship(part, id);
                count += 1;
                changed = true;
            }

            foreach (var field in FieldEditor.Collect(document.Root).Where(item => item.Kind == "hyperlink"))
            {
                var target = StructureRules.QuotedTarget.Match(field.Instruction) is { Success: true } match ? match.Groups[1].Value : field.Instruction.Trim();
                if (!StructureRules.IsExternalTarget(target)) continue;
                foreach (var run in FieldEditor.ResultRuns(field).Where(run => IsHyperlinkStyle(fix, run)).ToList()) run.Element(W.RPr)!.Element(W.RStyle)!.Remove();
                FieldEditor.Unlink(field);
                count += 1;
                changed = true;
            }

            if (changed) fix.Touch(part);
        }

        return count;
    }

    static int FixFields(FixContext fix)
    {
        var count = 0;
        foreach (var (part, document) in fix.Model.Parts)
        {
            if (document.Root is null) continue;
            var fields = FieldEditor.Collect(document.Root).Where(field => StructureRules.SuspectFields.Contains(field.Kind)).ToList();
            if (fields.Count == 0) continue;
            fields.ForEach(FieldEditor.DeleteWhole);
            count += fields.Count;
            fix.Touch(part);
        }

        return count;
    }

    /// <summary>Delete comment contents, body anchors/references, extensions, and people lists together to avoid dangling references.</summary>
    static int FixComments(FixContext fix)
    {
        var model = fix.Model;
        if (model.CommentsPart is not { } commentsPart || model.Parts[commentsPart].Root is not { } commentsRoot) return 0;
        var comments = commentsRoot.Elements(W.Comment).ToList();
        comments.Remove();
        fix.Touch(commentsPart);

        foreach (var (part, document) in model.Parts)
        {
            if (part == commentsPart) continue;
            var anchors = document.Descendants().Where(item => item.Name == CommentRangeStart || item.Name == CommentRangeEnd || item.Name == CommentReference).ToList();
            if (anchors.Count == 0) continue;
            foreach (var anchor in anchors)
            {
                var parent = anchor.Parent;
                anchor.Remove();
                RemoveIfEmptyRun(parent);
            }

            fix.Touch(part);
        }

        foreach (var suffix in new[] { "/commentsExtended", "/commentsIds", "/commentsExtensible", "/people" })
        {
            foreach (var part in fix.Package.RelatedParts(model.DocumentPart, suffix))
            {
                if (fix.Extra(part)?.Root is not { } root) continue;
                root.RemoveNodes();
                fix.Touch(part);
            }
        }

        return comments.Count;
    }

    static readonly HashSet<string> ChangeRecords =
    [
        "pPrChange", "rPrChange", "tblPrChange", "tblPrExChange", "tcPrChange", "trPrChange", "sectPrChange", "numberingChange", "tblGridChange",
    ];

    static readonly HashSet<string> MoveRanges = ["moveFromRangeStart", "moveFromRangeEnd", "moveToRangeStart", "moveToRangeEnd"];

    /// <summary>
    /// Accept revisions by retaining insertions, removing deletions, and clearing formatting-change records.
    /// Skip unsafe revisions such as deleted paragraph marks requiring merges, or deleted/merged cells; instruct manual acceptance in Word.
    /// </summary>
    static int FixRevisions(FixContext fix)
    {
        var accepted = 0;
        var skipped = 0;
        foreach (var (part, document) in fix.Model.Parts)
        {
            if (part == fix.Model.CommentsPart) continue;
            var elements = document.Descendants().Where(item => item.Name.Namespace == W.Ns && IsRevision(item.Name.LocalName)).ToList();
            if (elements.Count == 0) continue;
            foreach (var element in elements)
            {
                if (element.Parent is null || element.Document is null) continue;
                var name = element.Name.LocalName;
                var parent = element.Parent.Name.LocalName;
                var marker = parent is "rPr" or "trPr";
                switch (name)
                {
                    case "ins" or "moveTo":
                        if (marker) element.Remove();
                        else Unwrap(element);
                        accepted += 1;
                        break;
                    case "del" or "moveFrom":
                        if (marker && parent == "rPr" && element.Parent.Parent?.Name == W.PPr)
                        {
                            skipped += 1;
                            break;
                        }

                        if (marker && parent == "trPr")
                        {
                            var row = element.Ancestors(W.Tr).First();
                            var table = row.Parent;
                            row.Remove();
                            if (table?.Name == W.Tbl && !table.Elements(W.Tr).Any()) table.Remove();
                        }
                        else
                        {
                            element.Remove();
                        }

                        accepted += 1;
                        break;
                    case "cellDel" or "cellMerge":
                        skipped += 1;
                        break;
                    default:
                        element.Remove();
                        accepted += 1;
                        break;
                }
            }

            fix.Touch(part);
        }

        if (skipped > 0) fix.Note($"有 {skipped} 处修订（段落合并、删除或合并单元格）无法安全自动接受，请在 Word 中「审阅 → 接受所有修订」");
        return accepted;
    }

    static bool IsRevision(string name)
    {
        return name is "ins" or "del" or "moveFrom" or "moveTo" or "cellIns" or "cellDel" or "cellMerge"
            || ChangeRecords.Contains(name) || MoveRanges.Contains(name);
    }
}
