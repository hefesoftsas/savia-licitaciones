import { Textarea } from './primitives/textarea';
import { Button } from './primitives/button';
import * as Dialog from '@/shared/ui/primitives/dialog';
import { RadioGroup, RadioGroupItem } from './primitives/radio-group';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AgentQuestion } from '../types';
import { useLanguage } from '../i18n';
import { localizeRuntimeText } from '../i18n/localizeRuntimeText';
import AppSwitch from './AppSwitch';
import MarkdownRenderer from './MarkdownRenderer';
import { useToast } from './ToastProvider';

interface AutoAnswerContextValue {
  enabled: boolean;
  saving: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
}

const AutoAnswerContext = createContext<AutoAnswerContextValue | null>(null);

// Read and update the automatic-answer settings shared by confirmation dialogs.
export function useAutoAnswer() {
  const context = useContext(AutoAnswerContext);
  if (!context) throw new Error('useAutoAnswer 必须在 AgentQuestionDialogProvider 内使用');
  return context;
}

// Present pending agent questions globally and return user answers to Main.
const STR = {
  zh: {
    autoSaveFailed: '自动回答设置保存失败',
    submitFailed: '提交回答失败，请重试',
    title: '需要您确认以下问题',
    optionsLabel: 'Agent 提供的选项',
    recommended: '推荐',
    customPh: '请输入具体要求',
    customSuffix: '的具体要求',
    autoAnswer: '自动回答',
    autoRun: (seconds: number, label: string) => `${seconds} 秒后自动执行“${label}”`,
    submitting: '正在提交...',
    confirm: '确定并继续',
  },
  es: {
    autoSaveFailed: 'No se pudo guardar la respuesta automática',
    submitFailed: 'No se pudo enviar la respuesta, inténtalo de nuevo',
    title: 'Necesito tu confirmación',
    optionsLabel: 'Opciones del Agent',
    recommended: 'Recomendado',
    customPh: 'Describe tu requisito',
    customSuffix: ': detalla el requisito',
    autoAnswer: 'Respuesta automática',
    autoRun: (seconds: number, label: string) => `Se ejecutará “${label}” en ${seconds} s`,
    submitting: 'Enviando...',
    confirm: 'Confirmar y continuar',
  },
  en: {
    autoSaveFailed: 'Failed to save auto-answer setting',
    submitFailed: 'Failed to submit answer, please retry',
    title: 'Your confirmation is needed',
    optionsLabel: 'Options provided by the Agent',
    recommended: 'Recommended',
    customPh: 'Enter your requirements',
    customSuffix: ': requirement details',
    autoAnswer: 'Auto answer',
    autoRun: (seconds: number, label: string) => `Will auto-run "${label}" in ${seconds}s`,
    submitting: 'Submitting...',
    confirm: 'Confirm and continue',
  },
};

export function AgentQuestionDialogProvider({ children }: { children: ReactNode }) {
  const [question, setQuestion] = useState<AgentQuestion | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [customAnswer, setCustomAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [autoAnswerEnabled, setAutoAnswerEnabledState] = useState(false);
  const [autoAnswerSaving, setAutoAnswerSaving] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const { showToast } = useToast();
  const { language } = useLanguage();
  const s = STR[language];

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = window.savia.agent.onQuestion((nextQuestion) => {
      receivedEvent = true;
      if (active) setQuestion(nextQuestion);
    });
    void window.savia.agent.getPendingQuestion()
      .then((pendingQuestion) => {
        if (active && !receivedEvent) setQuestion(pendingQuestion);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = window.savia.autoConfirmation.onChanged((state) => {
      receivedEvent = true;
      if (active) setAutoAnswerEnabledState(state.enabled);
    });
    void window.savia.autoConfirmation.getState()
      .then((state) => {
        if (active && !receivedEvent) setAutoAnswerEnabledState(state.enabled);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setSelectedOptionId('');
    setCustomAnswer('');
    setSubmitting(false);
  }, [question?.question_id]);

  const recommendedOption = question?.options.find((option) => option.recommended && !option.custom);

  useEffect(() => {
    if (question?.auto_answer_at && recommendedOption && !selectedOptionId) {
      setSelectedOptionId(recommendedOption.id);
    }
  }, [question?.auto_answer_at, recommendedOption, selectedOptionId]);

  useEffect(() => {
    if (!question?.auto_answer_at) {
      setCountdownSeconds(0);
      return;
    }
    const deadline = new Date(question.auto_answer_at).getTime();
    const updateCountdown = () => {
      setCountdownSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
  }, [question?.auto_answer_at]);

  // Both switches share Main configuration and persist changes immediately.
  const setAutoAnswerEnabled = async (enabled: boolean) => {
    if (autoAnswerSaving) return;
    setAutoAnswerSaving(true);
    try {
      const result = await window.savia.autoConfirmation.setEnabled(enabled);
      setAutoAnswerEnabledState(result.enabled);
    } catch (error) {
      showToast(error instanceof Error ? error.message : s.autoSaveFailed, 'error');
    } finally {
      setAutoAnswerSaving(false);
    }
  };

  const selectedOption = question?.options.find((option) => option.id === selectedOptionId);
  const canSubmit = Boolean(
    question
    && selectedOption
    && (!selectedOption.custom || customAnswer.trim()),
  );

  const submitAnswer = async () => {
    if (!question || !selectedOption || !canSubmit || submitting) return;
    const questionId = question.question_id;
    setSubmitting(true);
    try {
      await window.savia.agent.answerQuestion({
        question_id: questionId,
        option_id: selectedOption.id,
        custom_answer: selectedOption.custom ? customAnswer.trim() : undefined,
      });
      setQuestion((current) => current?.question_id === questionId ? null : current);
    } catch (error) {
      showToast(error instanceof Error ? error.message : s.submitFailed, 'error');
      setSubmitting(false);
    }
  };

  // Stop the automatic-answer countdown when the user selects an option.
  const selectOption = (optionId: string) => {
    setSelectedOptionId(optionId);
    if (question) {
      void window.savia.agent.suppressQuestionAutoAnswer({ question_id: question.question_id }).catch(() => undefined);
    }
  };

  return (
    <AutoAnswerContext.Provider value={{
      enabled: autoAnswerEnabled,
      saving: autoAnswerSaving,
      setEnabled: setAutoAnswerEnabled,
    }}>
      {children}
      <Dialog.Root open={Boolean(question)}>
        <Dialog.Portal>
          <Dialog.Overlay className="agent-question-modal" />
          <Dialog.Content
            className="agent-question-card"
            aria-describedby={undefined}
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <header className="agent-question-head">
              <Dialog.Title>{s.title}</Dialog.Title>
            </header>

            <div className="agent-question-body">
              <div className="agent-question-copy">
                <MarkdownRenderer allowRawHtml={false} linkMode="text">{localizeRuntimeText(question?.question || '', language)}</MarkdownRenderer>
              </div>

              <RadioGroup className="agent-question-options" value={selectedOptionId} onValueChange={selectOption} disabled={submitting} aria-label={s.optionsLabel}>
                {question?.options.map((option) => (
                  <label
                    key={option.id}
                    className={`agent-question-option${selectedOptionId === option.id ? ' is-selected' : ''}`}
                  >
                    <RadioGroupItem
                      value={option.id}
                      disabled={submitting}
                    />
                    <span className="agent-question-option-copy">
                      <strong>
                        {localizeRuntimeText(option.label, language)}
                        {option.recommended && <em>{s.recommended}</em>}
                      </strong>
                      {option.description && <small>{localizeRuntimeText(option.description, language)}</small>}
                    </span>
                  </label>
                ))}
              </RadioGroup>

              {selectedOption?.custom && (
                <Textarea
                  className="agent-question-custom-answer"
                  value={customAnswer}
                  disabled={submitting}
                  placeholder={s.customPh}
                  aria-label={`${localizeRuntimeText(selectedOption.label, language)}${s.customSuffix}`}
                  autoFocus
                  onChange={(event) => setCustomAnswer(event.target.value)}
                />
              )}
            </div>

            <footer className="agent-question-actions">
              <div className="agent-question-auto-answer">
                <label>
                  <AppSwitch checked={autoAnswerEnabled} disabled={autoAnswerSaving || submitting} onCheckedChange={(checked) => void setAutoAnswerEnabled(checked)} />
                  <span>{s.autoAnswer}</span>
                </label>
                {question?.auto_answer_at && recommendedOption && (
                  <small>{s.autoRun(countdownSeconds, recommendedOption.label)}</small>
                )}
              </div>
              <Button variant="default"
                type="button"
                className="primary-action"
                disabled={!canSubmit || submitting}
                onClick={() => void submitAnswer()}
              >
                {submitting ? s.submitting : s.confirm}
              </Button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AutoAnswerContext.Provider>
  );
}

export default AgentQuestionDialogProvider;
