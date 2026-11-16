import { fontDisplayName } from '../../../../shared/i18n/fontDisplayName';
import { Input } from '../../../../shared/ui/primitives/input';
import { Textarea } from '../../../../shared/ui/primitives/textarea';
import { NativeSelect } from '../../../../shared/ui/primitives/native-select';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { useLanguage } from '../../../../shared/i18n';
import type { AppLocale } from '../../../../shared/i18n';
import { AppSwitch, useToast } from '../../../../shared/ui';
import { fieldSourceNote, FONT_CHOICES, localizedPresetSections, localizedSizeLabel, readProfileValue, SIZE_CHOICES, writeProfileValue } from '../presetFields';
import type { PresetField } from '../presetFields';
import type { BlindCheckCredentialWord, BlindCheckPresetSource, BlindCheckPresetTab, BlindCheckProfile } from '../types';

interface CredentialWordsProps {
  enabled: boolean;
  words: BlindCheckCredentialWord[];
  busy: boolean;
  onToggle: (enabled: boolean) => void;
}

interface PresetEditorProps {
  tab: BlindCheckPresetTab;
  profile: BlindCheckProfile;
  readOnly: boolean;
  onCommit: (profile: BlindCheckProfile) => void;
  credential: CredentialWordsProps;
  /** Source information recorded by AI preset extraction, used to annotate fields with original evidence. */
  source?: BlindCheckPresetSource;
  hideCredentialWords?: boolean;
}

/** Local display-text maps with zh fallback. */
type LocaleText = { es: string; en: string };
const L = (es: string, en: string): LocaleText => ({ es, en });
const pick = (lang: AppLocale, v: LocaleText): string => lang === "en" ? v.en : v.es;

const STR_EDITOR: Record<string, LocaleText> = {
  evidenceOk: L('Fuente: ', 'Source: '),
  evidenceReview: L(', revisar con atención', ', please review carefully'),
  evidenceMissing: L('Sin fuente en el original; revisar', 'No source found; please review'),
  related: L('El original lo exige pero sin ajuste; revisar y configurar: ', 'Original requires it but unset; review and set: '),
  unspecified: L('No exigido en pliego; no se revisa', 'Not required; not checked'),
  numberRange: L('Introduzca', 'Enter'),
  numberBetween: L('dentro del rango', ''),
  credentialTitle: L('Empresa del registro', 'Credential company info'),
  credentialToggle: L('Usar datos del registro', 'Use credential data'),
  credentialCount: L('Se revisarán', 'Will check'),
  credentialItems: L('elementos', 'items'),
  credentialEmpty: L('Registro aún vacío', 'Credential store is empty'),
  wordsPlaceholder: L('Uno por línea', 'One per line'),
  boldOn: L('Negrita', 'Bold'),
  boldOff: L('Sin negrita', 'Not bold'),
  boldAny: L('No revisar', 'Do not check'),
  ptSuffix: L('pt', 'pt'),
};

/** Show AI source evidence while the value remains unchanged; mark unchecked fields whose tender requirements were unspecified. */
function FieldSource({ field, profile, source }: { field: PresetField; profile: BlindCheckProfile; source?: BlindCheckPresetSource }) {
  const { language } = useLanguage();
  const t = (v: LocaleText) => pick(language, v);
  const note = source ? fieldSourceNote(profile, source, field.path) : null;
  if (!note) return null;
  if (note.kind === 'evidence') {
    const { extracted } = note;
    const evidence = extracted.evidence ? `：「${extracted.evidence}」` : '';
    return (
      <small className={`blind-check-evidence${extracted.verified ? '' : ' is-unverified'}`}>
        <em>AI</em>
        {extracted.verified
          ? `${t(STR_EDITOR.evidenceOk)}「${extracted.evidence}」`
          : extracted.issue
            ? `${extracted.issue}${t(STR_EDITOR.evidenceReview)}${evidence}`
            : `${t(STR_EDITOR.evidenceMissing)}${evidence}`}
      </small>
    );
  }
  if (note.kind === 'related') {
    return <small className="blind-check-evidence is-unverified">{`${t(STR_EDITOR.related)}「${note.sentence}」`}</small>;
  }
  return <small className="blind-check-evidence is-unspecified">{t(STR_EDITOR.unspecified)}</small>;
}

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') event.currentTarget.blur();
}

/** Numeric input commits on blur or Enter; clearing it disables the check. */
function NumberField({ field, value, disabled, onCommit }: { field: PresetField; value: number | null; disabled: boolean; onCommit: (value: number | null) => void }) {
  const { showToast } = useToast();
  const { language: numberLang } = useLanguage();
  const tNum = (v: LocaleText) => pick(numberLang, v);
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));

  useEffect(() => {
    setDraft(value === null || value === undefined ? '' : String(value));
  }, [value]);

  const commit = () => {
    const text = draft.trim();
    if (!text) {
      if (value !== null) onCommit(null);
      return;
    }
    const number = Number(text);
    if (!Number.isFinite(number) || (field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) {
      const sep = numberLang === 'zh' ? '～' : '-';
      const between = tNum(STR_EDITOR.numberBetween);
      showToast(`${tNum(STR_EDITOR.numberRange)} ${field.label}: ${field.min ?? 0}${sep}${field.max ?? ''}${between ? ` ${between}` : ''}`, 'info');
      setDraft(value === null || value === undefined ? '' : String(value));
      return;
    }
    if (number !== value) onCommit(number);
  };

  return (
    <div className="blind-check-number-control">
      <Input
        inputMode="decimal"
        value={draft}
        placeholder={field.nullLabel}
        disabled={disabled}
        aria-label={field.label}
        onChange={(event) => /^\d*(?:\.\d{0,2})?$/.test(event.target.value) && setDraft(event.target.value)}
        onKeyDown={blurOnEnter}
        onBlur={commit}
      />
      {field.unit && <em>{field.unit}</em>}
    </div>
  );
}

/** Multiline word list: one entry per line, committed on blur. */
function WordsField({ field, value, disabled, onCommit }: { field: PresetField; value: string[]; disabled: boolean; onCommit: (value: string[]) => void }) {
  const [draft, setDraft] = useState(value.join('\n'));

  useEffect(() => {
    setDraft(value.join('\n'));
  }, [value]);

  const commit = () => {
    const words = Array.from(new Set(draft.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)));
    if (words.join('\n') !== value.join('\n')) onCommit(words);
  };

  const { language: wordsLang } = useLanguage();
  return (
    <label className="blind-check-words-field">
      <span>
        <strong>{field.label}</strong>
        {field.hint && <small>{field.hint}</small>}
      </span>
      <Textarea value={draft} disabled={disabled} rows={5} onChange={(event) => setDraft(event.target.value)} onBlur={commit} placeholder={pick(wordsLang, STR_EDITOR.wordsPlaceholder)} />
    </label>
  );
}

function FieldControl({ field, profile, disabled, onChange }: { field: PresetField; profile: BlindCheckProfile; disabled: boolean; onChange: (value: unknown) => void }) {
  const { language } = useLanguage();
  const t = (v: LocaleText) => pick(language, v);
  const value = readProfileValue(profile, field.path);
  if (field.kind === 'switch') {
    return <AppSwitch checked={value === true} disabled={disabled} onCheckedChange={onChange} aria-label={field.label} />;
  }
  if (field.kind === 'number') {
    return <NumberField field={field} value={(value as number | null) ?? null} disabled={disabled} onCommit={onChange} />;
  }
  if (field.kind === 'tristate') {
    return (
      <NativeSelect value={value === null || value === undefined ? '' : value ? 'true' : 'false'} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? null : event.target.value === 'true')} aria-label={field.label}>
        <option value="">{field.nullLabel}</option>
        <option value="false">{field.falseLabel}</option>
        <option value="true">{field.trueLabel}</option>
      </NativeSelect>
    );
  }
  if (field.kind === 'bold') {
    return (
      <NativeSelect value={value === null || value === undefined ? '' : value ? 'bold' : 'normal'} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? null : event.target.value === 'bold')} aria-label={field.label}>
        <option value="">{t(STR_EDITOR.boldAny)}</option>
        <option value="bold">{t(STR_EDITOR.boldOn)}</option>
        <option value="normal">{t(STR_EDITOR.boldOff)}</option>
      </NativeSelect>
    );
  }
  if (field.kind === 'size') {
    const pt = (value as number | null) ?? null;
    const known = pt === null || SIZE_CHOICES.some((item) => Math.abs(item.value - pt) < 0.01);
    return (
      <NativeSelect value={pt === null ? '' : String(pt)} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} aria-label={field.label}>
        {field.nullLabel && <option value="">{field.nullLabel}</option>}
        {!known && pt !== null && <option value={String(pt)}>{localizedSizeLabel(language, pt)}</option>}
        {SIZE_CHOICES.map((item) => <option value={String(item.value)} key={item.label}>{language === 'zh' ? `${item.label}（${item.value}${t(STR_EDITOR.ptSuffix)}）` : `${item.value} ${t(STR_EDITOR.ptSuffix)}`}</option>)}
      </NativeSelect>
    );
  }
  if (field.kind === 'font') {
    const font = (value as string | null) ?? '';
    return (
      <NativeSelect value={font} disabled={disabled} onChange={(event) => onChange(event.target.value || null)} aria-label={field.label}>
        {field.nullLabel && <option value="">{field.nullLabel}</option>}
        {font && !FONT_CHOICES.includes(font) && <option value={font}>{fontDisplayName(font)}</option>}
        {FONT_CHOICES.map((item) => <option value={item} key={item}>{fontDisplayName(item)}</option>)}
      </NativeSelect>
    );
  }
  return (
    <NativeSelect value={(value as string | null) ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value || null)} aria-label={field.label}>
      {field.nullLabel && <option value="">{field.nullLabel}</option>}
      {(field.options || []).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
    </NativeSelect>
  );
}

function CredentialWords({ enabled, words, busy, onToggle }: CredentialWordsProps) {
  const { language } = useLanguage();
  const t = (v: LocaleText) => pick(language, v);
  return (
    <section className="blind-check-preset-section">
      <div className="blind-check-preset-section-head">
        <strong>{t(STR_EDITOR.credentialTitle)}</strong>
      </div>
      <div className="content-generation-config-list">
        <div className="content-generation-config-row">
          <span>
            <strong>{t(STR_EDITOR.credentialToggle)}</strong>
            <small>{words.length ? `${t(STR_EDITOR.credentialCount)} ${words.length} ${t(STR_EDITOR.credentialItems)}` : t(STR_EDITOR.credentialEmpty)}</small>
          </span>
          <AppSwitch checked={enabled} disabled={busy} onCheckedChange={onToggle} aria-label={t(STR_EDITOR.credentialToggle)} />
        </div>
      </div>
      {enabled && words.length > 0 && (
        <div className="blind-check-word-chips">
          {words.map((word) => (
            <span key={`${word.label}-${word.value}`} title={word.label}>
              <em>{word.label}</em>
              {word.value}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/** Preset editing: selections and switches commit immediately; numbers and word lists commit on blur. Built-in presets are read-only. */
export default function PresetEditor({ tab, profile, readOnly, onCommit, credential, source, hideCredentialWords = false }: PresetEditorProps) {
  const { language } = useLanguage();
  const sections = localizedPresetSections(language)[tab];
  return (
    <div className="blind-check-preset-editor">
      {tab === 'privacy' && !hideCredentialWords && <CredentialWords {...credential} />}
      {sections.map((section) => {
        const fields = section.fields.filter((field) => !field.visible || field.visible(profile));
        const words = fields.filter((field) => field.kind === 'words');
        const rows = fields.filter((field) => field.kind !== 'words');
        return (
          <section className="blind-check-preset-section" key={section.title}>
            <div className="blind-check-preset-section-head">
              <strong>{section.title}</strong>
              {section.description && <small>{section.description}</small>}
            </div>
            {words.length > 0 && (
              <div className="blind-check-words-grid">
                {words.map((field) => (
                  <WordsField
                    key={field.path.join('.')}
                    field={field}
                    value={(readProfileValue(profile, field.path) as string[]) || []}
                    disabled={readOnly}
                    onCommit={(value) => onCommit(writeProfileValue(profile, field.path, value))}
                  />
                ))}
              </div>
            )}
            {rows.length > 0 && (
              <div className="content-generation-config-list">
                {rows.map((field) => (
                  <div className="content-generation-config-row" key={field.path.join('.')}>
                    <span>
                      <strong>{field.label}</strong>
                      {field.hint && <small>{field.hint}</small>}
                      <FieldSource field={field} profile={profile} source={source} />
                    </span>
                    <FieldControl
                      field={field}
                      profile={profile}
                      disabled={readOnly}
                      onChange={(value) => onCommit(writeProfileValue(profile, field.path, value))}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
