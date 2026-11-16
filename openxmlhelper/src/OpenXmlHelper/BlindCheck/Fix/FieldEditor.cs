using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Model;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;

namespace Savia.OpenXmlHelper.BlindCheck.Fix;

/// <summary>A field: simple fields use w:fldSimple; complex fields consist of begin/separate/end fldChar markers and intervening runs.</summary>
sealed class FieldInstance
{
    public XElement? Simple { get; init; }
    public string Instruction { get; set; } = "";
    public string Kind { get; set; } = "unknown";
    public List<XElement> Runs { get; } = [];
    public List<XElement> Markers { get; } = [];
    public List<XElement> InstructionTexts { get; } = [];
    public bool InResult { get; set; }
}

/// <summary>Locate fields at run level to remove them with displayed results or unlink them while preserving results.</summary>
static class FieldEditor
{
    public static List<FieldInstance> Collect(XElement root)
    {
        var fields = new List<FieldInstance>();
        var stack = new List<FieldInstance>();
        foreach (var element in root.Descendants())
        {
            if (element.Name == W.FldSimple)
            {
                var instruction = W.Attr(element, "instr") ?? "";
                fields.Add(new FieldInstance { Simple = element, Instruction = instruction, Kind = FieldScanner.Classify(instruction) });
                continue;
            }

            if (element.Name != W.R_) continue;
            foreach (var open in stack) open.Runs.Add(element);
            foreach (var child in element.Elements())
            {
                if (child.Name == W.FldChar)
                {
                    var type = W.Attr(child, "fldCharType");
                    if (type == "begin")
                    {
                        var field = new FieldInstance();
                        field.Runs.Add(element);
                        field.Markers.Add(child);
                        stack.Add(field);
                    }
                    else if (stack.Count > 0 && type == "separate")
                    {
                        stack[^1].Markers.Add(child);
                        stack[^1].InResult = true;
                    }
                    else if (stack.Count > 0 && type == "end")
                    {
                        var field = stack[^1];
                        field.Markers.Add(child);
                        field.Kind = FieldScanner.Classify(field.Instruction);
                        fields.Add(field);
                        stack.RemoveAt(stack.Count - 1);
                    }
                }
                else if (child.Name == W.InstrText && stack.Count > 0 && !stack[^1].InResult)
                {
                    stack[^1].Instruction += child.Value;
                    stack[^1].InstructionTexts.Add(child);
                }
            }
        }

        return fields;
    }

    /// <summary>
    /// Remove entire fields: identity-field results contain names or filenames and must also be removed.
    /// Boundary runs may contain body text outside the field; remove only children inside the marker range, deleting intermediate runs entirely.
    /// </summary>
    public static void DeleteWhole(FieldInstance field)
    {
        if (field.Simple is not null)
        {
            if (field.Simple.Parent is not null) field.Simple.Remove();
            return;
        }

        var begin = field.Markers[0];
        var end = field.Markers[^1];
        foreach (var run in field.Runs)
        {
            if (run.Parent is null) continue;
            var hasBegin = begin.Parent == run;
            var hasEnd = end.Parent == run;
            if (!hasBegin && !hasEnd)
            {
                run.Remove();
                continue;
            }

            var children = run.Elements().ToList();
            var from = hasBegin ? children.IndexOf(begin) : 0;
            var to = hasEnd ? children.IndexOf(end) : children.Count - 1;
            for (var index = from; index <= to; index += 1)
            {
                if (children[index].Name != W.RPr) children[index].Remove();
            }

            PropertyWriter.RemoveIfEmptyRun(run);
        }
    }

    /// <summary>Unlink a field by removing markers/instructions while preserving displayed text.</summary>
    public static void Unlink(FieldInstance field)
    {
        if (field.Simple is not null)
        {
            StructureFixes.Unwrap(field.Simple);
            return;
        }

        foreach (var element in field.Markers.Concat(field.InstructionTexts))
        {
            if (element.Parent is not null) element.Remove();
        }

        foreach (var run in field.Runs) PropertyWriter.RemoveIfEmptyRun(run);
    }

    public static IEnumerable<XElement> ResultRuns(FieldInstance field)
    {
        if (field.Simple is not null) return field.Simple.Elements(W.R_);
        return field.Runs.Where(run => run.Parent is not null && run.Element(W.FldChar) is null && run.Element(W.InstrText) is null);
    }
}
