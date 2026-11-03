"use client";
import { useTranslation } from "react-i18next";
import { tr } from '../../../../shared/i18n';

import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  CheckIcon,
  CircleMinusIcon,
  XCircleIcon,
} from "lucide-react";
import {
  toolApprovalAcceptsText,
  useAuiState,
  type ToolApprovalAnswer,
  type ToolApprovalOption,
  type ToolApprovalQuestion,
  type ToolCallMessagePart,
  type ToolCallMessagePartProps,
  type ToolCallMessagePartStatus,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToolFallbackApprovalQuestions } from "./tool-approval-questions";

import { ToolFallbackRoot, ToolFallbackTrigger, ToolFallbackContent, ToolFallbackArgs, ToolFallbackResult, ToolFallbackError, formatUnknownValue } from "./tool-fallback-parts";
export type { ToolFallbackRootProps } from "./tool-fallback-parts";
const pressable = "active:scale-[0.98]";
const APPROVED_RESULT = tr('common:approved_by_user');
const DENIED_RESULT = tr('common:user_denied_tool_execution');

const APPROVAL_OPTION_DEFAULT_LABELS: Record<string, string> = {
  "allow-once": tr('common:allow'),
  "allow-always": tr('common:always_allow'),
  "reject-once": tr('common:deny'),
  "reject-always": tr('common:always_deny'),
};

const isKnownKind = (kind: string) =>
  Object.hasOwn(APPROVAL_OPTION_DEFAULT_LABELS, kind);

const isAllowKind = (kind: string) =>
  kind === "allow-once" || kind === "allow-always";

const approvalOptionLabel = (option: ToolApprovalOption) =>
  option.label ??
  (isKnownKind(option.kind)
    ? APPROVAL_OPTION_DEFAULT_LABELS[option.kind]
    : undefined) ??
  option.id;

/**
 * A request that declares how it wants to be presented is asking a question,
 * not gating an action, so a refusal is not one of the answers it accepts
 * unless the request declares itself dismissible.
 */
const isQuestion = (approval: ToolCallMessagePart["approval"]) =>
  approval?.display === "select" ||
  approval?.display === "text" ||
  approval?.display === "questions";

const answerLabels = (
  question: ToolApprovalQuestion,
  answer: ToolApprovalAnswer | undefined,
) => [
  ...(answer?.optionIds ?? []).map(
    (id) => question.options?.find((option) => option.id === id)?.label ?? id,
  ),
  ...(answer?.text?.trim() ? [answer.text] : []),
];

const isSettled = (approval: ToolCallMessagePart["approval"]) =>
  approval != null &&
  (approval.approved !== undefined || approval.resolution !== undefined);

type ApprovalReceipt = {
  outcome: "allowed" | "refused" | "closed";
  label: string;
  option?: string | undefined;
};

/**
 * A settled request reads as a past-tense record of what happened to it, so
 * scrolling back never shows a live control for a decision already made.
 */
const approvalReceipt = (
  approval: NonNullable<ToolCallMessagePart["approval"]>,
): ApprovalReceipt => {
  if (approval.resolution !== undefined)
    return {
      outcome: "closed",
      label:
        approval.resolution === "cancelled"
          ? tr('common:cancelled_before_a_decision')
          : tr('common:expired_before_a_decision'),
    };

  const chosen =
    approval.optionId === undefined
      ? undefined
      : approval.options?.find((option) => option.id === approval.optionId);
  const option =
    chosen !== undefined
      ? approvalOptionLabel(chosen)
      : approval.optionId === undefined
        ? undefined
        : approval.optionId;
  const answered =
    isQuestion(approval) || (chosen !== undefined && !isKnownKind(chosen.kind));
  const automatic = approval.isAutomatic ? tr('common:automatically') : "";

  if (approval.approved)
    return {
      outcome: "allowed",
      label: `${answered ? tr('common:answered') : tr('common:allowed')}${automatic}`,
      option,
    };
  return {
    outcome: "refused",
    label: `${answered ? tr('common:dismissed') : tr('common:denied')}${automatic}`,
    option,
  };
};

const receiptIcons = {
  allowed: CheckIcon,
  refused: XCircleIcon,
  closed: CircleMinusIcon,
} satisfies Record<ApprovalReceipt["outcome"], React.ElementType>;

function ToolFallbackApprovalReceipt({
  approval,
  className,
  focusReceiptRef,
  receiptRef,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  approval: NonNullable<ToolCallMessagePart["approval"]>;
  focusReceiptRef: React.MutableRefObject<string | null | undefined>;
  receiptRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  useTranslation();
  useLayoutEffect(() => {
    const shouldFocus = focusReceiptRef.current === approval.id;
    focusReceiptRef.current = null;
    if (shouldFocus) receiptRef.current?.focus({ preventScroll: true });
  }, [approval.id, focusReceiptRef, receiptRef]);

  const receipt = approvalReceipt(approval);
  const Icon = receiptIcons[receipt.outcome];
  const notes = [
    ...new Set(
      [approval.text, approval.reason].filter(
        (value): value is string => typeof value === "string" && value !== "",
      ),
    ),
  ];

  return (
    <div
      ref={receiptRef}
      data-slot="tool-fallback-approval-receipt"
      data-outcome={receipt.outcome}
      tabIndex={-1}
      className={cn(
        "aui-tool-fallback-approval-receipt flex flex-col gap-1.5 pt-1",
        className,
      )}
      {...props}
    >
      {approval.prompt ? (
        <p className="aui-tool-fallback-approval-prompt text-muted-foreground whitespace-pre-line">
          {approval.prompt}
        </p>
      ) : null}
      <p className="aui-tool-fallback-approval-receipt-label flex items-center gap-1.5">
        <Icon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
        <span className="font-medium">{receipt.label}</span>
        {receipt.option !== undefined ? (
          <span className="text-muted-foreground">· {receipt.option}</span>
        ) : null}
      </p>
      {approval.answers &&
        approval.questions?.map((question) => {
          const labels = answerLabels(
            question,
            approval.answers && Object.hasOwn(approval.answers, question.id)
              ? approval.answers[question.id]
              : undefined,
          );
          if (labels.length === 0) return null;
          return (
            <p
              key={question.id}
              className="aui-tool-fallback-approval-receipt-answer whitespace-pre-line"
            >
              <span className="text-muted-foreground">
                {question.header ?? question.prompt}
              </span>{" "}
              · {labels.join(", ")}
            </p>
          );
        })}
      {notes.map((text) => (
        <p
          key={text}
          className="aui-tool-fallback-approval-receipt-note text-muted-foreground whitespace-pre-line"
        >
          {text}
        </p>
      ))}
    </div>
  );
}

const offersInterruptAction = (
  status: ToolCallMessagePartStatus | undefined,
  approval: ToolCallMessagePart["approval"],
  interrupt: ToolCallMessagePart["interrupt"],
) =>
  status?.type !== "requires-action" ||
  status.reason !== "interrupt" ||
  approval != null ||
  interrupt != null;

type ToolFallbackApprovalProps = React.ComponentPropsWithoutRef<"div"> &
  Partial<
    Pick<
      ToolCallMessagePartProps,
      "addResult" | "resume" | "respondToApproval" | "status"
    >
  > & {
    interrupt?: ToolCallMessagePart["interrupt"];
    approval?: ToolCallMessagePart["approval"];
  };

const ToolFallbackApproval = forwardRef<
  HTMLDivElement,
  ToolFallbackApprovalProps
>(function ToolFallbackApproval(props, ref) {
  const carryFocusRef = useRef(false);
  return (
    <ToolFallbackApprovalImpl
      key={props.approval?.id}
      carryFocusRef={carryFocusRef}
      forwardedRef={ref}
      {...props}
    />
  );
});

function ToolFallbackApprovalImpl({
  className,
  forwardedRef,
  carryFocusRef,
  addResult,
  resume,
  interrupt,
  approval,
  respondToApproval,
  status,
  ...props
}: Omit<ToolFallbackApprovalProps, "ref"> & {
  forwardedRef: React.ForwardedRef<HTMLDivElement>;
  carryFocusRef: React.MutableRefObject<boolean>;
}) {
  useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const voiceActive = useAuiState((s) => s.thread.voice !== undefined);
  const canAnswer = useAuiState((s) => s.thread.capabilities.answerToolCall);
  const locked = submitted || voiceActive;
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isRequiresAction = status?.type === "requires-action";
  const [prevRequiresAction, setPrevRequiresAction] =
    useState(isRequiresAction);
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(attempt);
  useLayoutEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);
  if (isRequiresAction !== prevRequiresAction) {
    setPrevRequiresAction(isRequiresAction);
    if (isRequiresAction) {
      setSubmitted(false);
      setConfirmingId(null);
      setAnswer("");
      setError(null);
      setAttempt(attempt + 1);
    }
  }
  const pendingGroupRef = useRef<HTMLDivElement | null>(null);
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const focusReceiptRef = useRef<string | null | undefined>(null);
  useLayoutEffect(() => {
    if (carryFocusRef.current) {
      carryFocusRef.current = false;
      pendingGroupRef.current?.focus({ preventScroll: true });
    }
    return () => {
      const element = pendingGroupRef.current ?? receiptRef.current;
      carryFocusRef.current =
        element?.contains(element.ownerDocument.activeElement) ?? false;
    };
  }, [carryFocusRef]);
  useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(
    forwardedRef,
    () => pendingGroupRef.current ?? receiptRef.current,
  );
  const setPendingGroup = useCallback(
    (element: HTMLDivElement | null) => {
      const group = pendingGroupRef.current;
      focusReceiptRef.current =
        !element && group?.contains(group.ownerDocument.activeElement)
          ? approval?.id
          : null;
      pendingGroupRef.current = element;
    },
    [approval?.id],
  );
  const hidePendingApproval =
    approval != null &&
    !isSettled(approval) &&
    status !== undefined &&
    status.type !== "requires-action" &&
    !(submitted && status.type === "running");
  useLayoutEffect(() => {
    if (hidePendingApproval) focusReceiptRef.current = null;
  }, [hidePendingApproval]);
  const focusPendingGroup = () => {
    const group = pendingGroupRef.current;
    if (group?.contains(group.ownerDocument.activeElement)) {
      group.focus({ preventScroll: true });
    }
  };

  if (approval != null && isSettled(approval))
    return (
      <ToolFallbackApprovalReceipt
        approval={approval}
        receiptRef={receiptRef}
        focusReceiptRef={focusReceiptRef}
        className={className}
        {...props}
      />
    );

  if (
    hidePendingApproval ||
    !offersInterruptAction(status, approval, interrupt)
  )
    return null;

  const promptText = approval?.prompt ? (
    <p className="aui-tool-fallback-approval-prompt text-foreground whitespace-pre-line">
      {approval.prompt}
    </p>
  ) : null;

  if (!canAnswer)
    return (
      promptText && (
        <div
          data-slot="tool-fallback-approval"
          tabIndex={-1}
          className={cn(
            "aui-tool-fallback-approval flex flex-col gap-2 pt-1",
            className,
          )}
          {...props}
          ref={setPendingGroup}
        >
          {promptText}
        </div>
      )
    );

  // A declared option list is a host constraint: the kit never adds an
  // approval path beyond it, and preserves a refusal path only where the
  // request is an action the user may refuse.
  const declaredOptions = respondToApproval ? approval?.options : undefined;
  const acceptsText =
    approval != null &&
    respondToApproval != null &&
    toolApprovalAcceptsText(approval);

  // A refused response leaves the request open, so the controls come back
  // rather than staying spent on a decision the runtime never recorded.
  const submit = (send: () => Promise<void> | void) => {
    focusPendingGroup();
    setSubmitted(true);
    setConfirmingId(null);
    setError(null);
    void (async () => {
      try {
        await send();
      } catch (sendError) {
        if (attemptRef.current !== attempt) return;
        setSubmitted(false);
        setError(
          sendError instanceof Error ? sendError.message : String(sendError),
        );
      }
    })();
  };

  const respond = (approved: boolean) => {
    if (locked) return;
    if (
      approval != null &&
      approval.approved === undefined &&
      respondToApproval
    ) {
      submit(() => respondToApproval({ approved, ...typedNote() }));
    } else if (interrupt) {
      submit(() => resume?.({ approved }));
    } else if (
      status?.type === "requires-action" &&
      status.reason === "interrupt"
    ) {
      return;
    } else {
      submit(() => addResult?.(approved ? APPROVED_RESULT : DENIED_RESULT));
    }
  };

  const respondWithOption = (option: ToolApprovalOption) => {
    if (locked) return;
    // A custom kind has no decision class for the runtime to derive, and
    // responding without one throws; picking a declared option is an answer,
    // so it resolves as approved.
    submit(() =>
      respondToApproval?.(
        isKnownKind(option.kind)
          ? { optionId: option.id, ...typedNote() }
          : { optionId: option.id, approved: true, ...typedNote() },
      ),
    );
  };

  const typedNote = () => (answer.trim() ? { text: answer } : {});

  // The kit does not validate an answer the request never constrained: a host
  // that cannot record an empty one rejects it, which reopens the controls.
  const submitAnswer = () => {
    if (locked) return;
    submit(() => respondToApproval?.({ text: answer }));
  };

  // A dismissal is no answer at all, so a typed draft does not travel with it.
  const dismiss = () => {
    if (locked) return;
    submit(() => respondToApproval?.({ approved: false }));
  };

  const handleOption = (option: ToolApprovalOption) => {
    if (option.confirm) {
      focusPendingGroup();
      setConfirmingId(option.id);
    } else {
      respondWithOption(option);
    }
  };

  const confirming =
    confirmingId != null
      ? declaredOptions?.find((o) => o.id === confirmingId)
      : undefined;

  const question = isQuestion(approval);
  const dismissible =
    question && respondToApproval != null && approval?.dismissible === true;

  const dismissButton = dismissible ? (
    <Button
      size="sm"
      variant="outline"
      className={pressable}
      onClick={dismiss}
      disabled={locked}
    >
      {tr('common:dismiss')}</Button>
  ) : null;

  const errorText = error ? (
    <p
      role="alert"
      className="aui-tool-fallback-approval-error text-destructive text-xs whitespace-pre-line"
    >
      {error}
    </p>
  ) : null;

  const answerField = acceptsText ? (
    <div className="aui-tool-fallback-approval-answer flex flex-col items-start gap-2">
      <Textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        disabled={locked}
        aria-label={question ? (approval?.prompt ?? tr('common:answer')) : tr('common:note')}
        placeholder={
          question ? tr('common:type_your_answer') : tr('common:add_a_note_to_your_decision')
        }
      />
      {question && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className={pressable}
            onClick={submitAnswer}
            disabled={locked}
          >
            {tr('common:send')}</Button>
          {dismissButton}
        </div>
      )}
    </div>
  ) : null;

  if (approval?.display === "questions" && respondToApproval) {
    return (
      <div
        data-slot="tool-fallback-approval"
        tabIndex={-1}
        className={cn(
          "aui-tool-fallback-approval flex flex-col gap-3 pt-1",
          className,
        )}
        {...props}
        ref={setPendingGroup}
      >
        {promptText}
        <ToolFallbackApprovalQuestions
          questions={approval.questions ?? []}
          dismissible={approval.dismissible === true}
          locked={locked}
          onSend={(answers) => submit(() => respondToApproval({ answers }))}
          onDismiss={dismiss}
        />
        {errorText}
      </div>
    );
  }

  if (confirming) {
    const confirmMeta =
      typeof confirming.confirm === "object" ? confirming.confirm : undefined;
    const confirmDescription =
      confirmMeta?.description ?? confirming.description;
    return (
      <div
        data-slot="tool-fallback-approval-confirm"
        tabIndex={-1}
        className={cn(
          "aui-tool-fallback-approval-confirm flex flex-col gap-2 pt-1",
          className,
        )}
        {...props}
        ref={setPendingGroup}
      >
        <p className="aui-tool-fallback-approval-confirm-title font-semibold">
          {confirmMeta?.title ?? `${approvalOptionLabel(confirming)}?`}
        </p>
        {confirmDescription && (
          <p className="aui-tool-fallback-approval-confirm-description text-muted-foreground whitespace-pre-line">
            {confirmDescription}
          </p>
        )}
        {confirming.grants && confirming.grants.length > 0 && (
          <ul className="aui-tool-fallback-approval-confirm-grants flex flex-col gap-1">
            {confirming.grants.map((grant) => (
              <li key={grant}>
                <code className="aui-tool-fallback-approval-confirm-grant bg-muted rounded px-1.5 py-0.5 text-xs">
                  {grant}
                </code>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className={pressable}
            onClick={() => respondWithOption(confirming)}
            disabled={locked}
          >
            {tr('common:confirm')}</Button>
          <Button
            size="sm"
            variant="outline"
            className={pressable}
            onClick={() => {
              focusPendingGroup();
              setConfirmingId(null);
            }}
            disabled={locked}
          >
            {tr('common:back')}</Button>
        </div>
      </div>
    );
  }

  if (declaredOptions && declaredOptions.length > 0) {
    const allowOptions = declaredOptions.filter((o) => isAllowKind(o.kind));
    const customOptions = declaredOptions.filter((o) => !isKnownKind(o.kind));
    const rejectOptions = declaredOptions.filter(
      (o) => isKnownKind(o.kind) && !isAllowKind(o.kind),
    );
    return (
      <div
        data-slot="tool-fallback-approval"
        tabIndex={-1}
        className={cn(
          "aui-tool-fallback-approval flex flex-col gap-2 pt-1",
          className,
        )}
        {...props}
        ref={setPendingGroup}
      >
        {promptText}
        <div className="flex flex-wrap items-center gap-2">
          {[...allowOptions, ...customOptions, ...rejectOptions].map(
            (option) => (
              <Button
                key={option.id}
                size="sm"
                variant={option === allowOptions[0] ? "default" : "outline"}
                className={pressable}
                onClick={() => handleOption(option)}
                disabled={locked}
              >
                {approvalOptionLabel(option)}
              </Button>
            ),
          )}
          {rejectOptions.length === 0 && !question && (
            <Button
              size="sm"
              variant="outline"
              className={pressable}
              onClick={() => respond(false)}
              disabled={locked}
            >
              {tr('common:deny')}</Button>
          )}
          {!acceptsText && dismissButton}
        </div>
        {answerField}
        {errorText}
      </div>
    );
  }

  // A question carries no decision to fabricate, so it renders only what the
  // request declared, even when that leaves nothing to act on here.
  if (question) {
    return (
      <div
        data-slot="tool-fallback-approval"
        tabIndex={-1}
        className={cn(
          "aui-tool-fallback-approval flex flex-col gap-2 pt-1",
          className,
        )}
        {...props}
        ref={setPendingGroup}
      >
        {promptText}
        {answerField}
        {!acceptsText && dismissButton && (
          <div className="flex items-center gap-2">{dismissButton}</div>
        )}
        {errorText}
      </div>
    );
  }

  return (
    <div
      data-slot="tool-fallback-approval"
      tabIndex={-1}
      className={cn(
        "aui-tool-fallback-approval flex flex-col gap-2 pt-1",
        className,
      )}
      {...props}
      ref={setPendingGroup}
    >
      {promptText}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className={pressable}
          onClick={() => respond(true)}
          disabled={locked}
        >
          {tr('common:allow')}</Button>
        <Button
          size="sm"
          variant="outline"
          className={pressable}
          onClick={() => respond(false)}
          disabled={locked}
        >
          {tr('common:deny')}</Button>
      </div>
      {answerField}
      {errorText}
    </div>
  );
}

const ToolFallbackImpl: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
  responseDeliveryStatus,
  addResult,
  resume,
  interrupt,
  approval,
  respondToApproval,
}) => {
  useTranslation();
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";
  const isRequiresAction = status?.type === "requires-action";
  const shouldRenderApproval =
    approval != null ||
    (isRequiresAction && offersInterruptAction(status, approval, interrupt));

  const [open, setOpen] = useState(isRequiresAction);
  const [prevRequiresAction, setPrevRequiresAction] =
    useState(isRequiresAction);
  if (isRequiresAction !== prevRequiresAction) {
    setPrevRequiresAction(isRequiresAction);
    if (isRequiresAction) setOpen(true);
  }
  const approvalHadFocusRef = useRef(false);
  const approvalElementRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    const focusedElement = approvalElementRef.current;
    if (
      !focusedElement ||
      focusedElement.isConnected ||
      isRequiresAction ||
      !approvalHadFocusRef.current
    ) {
      return;
    }

    const shouldFocusTrigger = approval == null || !isSettled(approval);
    approvalHadFocusRef.current = false;
    const { activeElement, body } = focusedElement.ownerDocument;
    if (
      shouldFocusTrigger &&
      (activeElement == null || activeElement === body)
    ) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [approval, isRequiresAction, status?.type]);

  return (
    <ToolFallbackRoot open={open} onOpenChange={setOpen}>
      <ToolFallbackTrigger
        toolName={toolName}
        status={status}
        responseDeliveryStatus={responseDeliveryStatus}
      />
      <ToolFallbackContent>
        <ToolFallbackError status={status} />
        <ToolFallbackArgs
          argsText={argsText}
          className={cn(isCancelled && "opacity-60")}
        />
        {shouldRenderApproval && (
          <ToolFallbackApproval
            addResult={addResult}
            resume={resume}
            interrupt={interrupt}
            approval={approval}
            respondToApproval={respondToApproval}
            status={status}
            onFocusCapture={(event) => {
              const root = event.currentTarget.closest(
                '[data-slot="tool-fallback-root"]',
              );
              triggerRef.current =
                root?.querySelector<HTMLButtonElement>(
                  '[data-slot="tool-fallback-trigger"]',
                ) ?? null;
              approvalElementRef.current = event.currentTarget;
              approvalHadFocusRef.current = true;
            }}
            onBlurCapture={(event) => {
              const relatedTarget = event.relatedTarget;
              const stillFocused = relatedTarget
                ? event.currentTarget.contains(relatedTarget as Node)
                : event.currentTarget.contains(
                    event.currentTarget.ownerDocument.activeElement,
                  );
              if (!stillFocused) approvalHadFocusRef.current = false;
            }}
          />
        )}
        <ToolFallbackResult result={result} />
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
};

const ToolFallback = memo(
  ToolFallbackImpl,
) as unknown as ToolCallMessagePartComponent & {
  Root: typeof ToolFallbackRoot;
  Trigger: typeof ToolFallbackTrigger;
  Content: typeof ToolFallbackContent;
  Args: typeof ToolFallbackArgs;
  Result: typeof ToolFallbackResult;
  Error: typeof ToolFallbackError;
  Approval: typeof ToolFallbackApproval;
};

ToolFallback.displayName = "ToolFallback";
ToolFallback.Root = ToolFallbackRoot;
ToolFallback.Trigger = ToolFallbackTrigger;
ToolFallback.Content = ToolFallbackContent;
ToolFallback.Args = ToolFallbackArgs;
ToolFallback.Result = ToolFallbackResult;
ToolFallback.Error = ToolFallbackError;
ToolFallback.Approval = ToolFallbackApproval;

export {
  formatUnknownValue,
  offersInterruptAction,
  ToolFallback,
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackArgs,
  ToolFallbackResult,
  ToolFallbackError,
  ToolFallbackApproval,
};
