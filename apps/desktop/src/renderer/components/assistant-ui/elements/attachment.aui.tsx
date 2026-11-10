"use client";
import { useTranslation } from "react-i18next";
import { tr } from '../../../../shared/i18n';

import {
  type PropsWithChildren,
  useState,
  type FC,
  isValidElement,
  cloneElement,
  type HTMLAttributes,
} from "react";
import {
  XIcon,
  PlusIcon,
  FileText,
  Loader2Icon,
  AlertCircleIcon,
} from "lucide-react";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { Tooltip, Dialog, DialogHeader } from '@astryxdesign/core';
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { useAttachmentState } from "./attachment-state";
import { cn } from "@/lib/utils";

type AttachmentPreviewProps = {
  src: string;
  name: string;
};

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ src, name }) => {
  useTranslation();
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={tr('common:preview_name',{name})}
      className={cn(
        "block h-auto max-h-[80vh] w-auto max-w-full rounded-sm object-contain transition-opacity duration-300 motion-reduce:transition-none",
        isLoaded
          ? "aui-attachment-preview-image-loaded opacity-100"
          : "aui-attachment-preview-image-loading opacity-0",
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
};

type AttachmentPreviewDialogProps = PropsWithChildren<{
  src: string | undefined;
  name: string;
}>;

const AttachmentPreviewDialog: FC<AttachmentPreviewDialogProps> = ({
  children,
  src,
  name,
}) => {
  useTranslation();
  const [open, setOpen] = useState(false);
  if (!src) return children;

  return <>
    {isValidElement<HTMLAttributes<HTMLElement>>(children) ? cloneElement(children, {onClick:()=>setOpen(true)}) : <button type="button" onClick={()=>setOpen(true)}>{children}</button>}
    <Dialog isOpen={open} onOpenChange={setOpen} aria-label={tr('common:preview')+name} width={768}>
      <DialogHeader title={tr('common:preview')+name} onOpenChange={setOpen}/>
      <div className="aui-attachment-preview bg-background relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden rounded-sm">
        <AttachmentPreview src={src} name={name}/>
      </div>
    </Dialog>
  </>;
};

const AttachmentThumb: FC<{ src: string | undefined }> = ({ src }) => {
  useTranslation();
  return <span className="aui-attachment-tile-avatar flex h-full w-full items-center justify-center">
    {src ? <img src={src} alt="" className="aui-attachment-tile-image h-full w-full object-cover"/> : <FileText className="aui-attachment-tile-fallback-icon text-muted-foreground size-6"/>}
  </span>;
};

const AttachmentUI: FC = () => {
  useTranslation();
  const {
    isComposer,
    src,
    isImage,
    name,
    typeLabel,
    isUploading,
    isError,
    errorMessage,
  } = useAttachmentState();

  return (
    <Tooltip placement="above" content={<><AttachmentPrimitive.Name/>{errorMessage && <p className="aui-attachment-error-message">{errorMessage}</p>}</>}>
        <AttachmentPrimitive.Root
          className={cn(
            "aui-attachment-root relative",
            isComposer &&
              "duration-200 motion-reduce:animate-none",
            isImage &&
              !isComposer &&
              "aui-attachment-root-message only:*:first:size-24",
          )}
        >
          <AttachmentPreviewDialog src={src} name={name}>

              <div
                className={cn(
                  "aui-attachment-tile bg-muted hover:after:bg-foreground/10 focus-visible:ring-ring/50 relative size-14 overflow-hidden rounded-[calc(var(--composer-radius,1rem)-var(--composer-padding,8px))] transition-transform outline-none after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-border after:transition-colors after:ring-inset focus-visible:ring-1 motion-reduce:transition-none ",
                  src ? "cursor-zoom-in active:scale-[0.97]" : "cursor-default",
                  isError &&
                    "after:ring-destructive/60 dark:after:ring-destructive/60",
                )}
                role={src ? "button" : "group"}
                tabIndex={0}
                onKeyDown={
                  src
                    ? (e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.click();
                        } else if (e.key === " ") {
                          e.preventDefault();
                        }
                      }
                    : undefined
                }
                onKeyUp={
                  src
                    ? (e) => {
                        if (e.key === " ") e.currentTarget.click();
                      }
                    : undefined
                }
                aria-label={tr('common:attachment_label', {name, type: typeLabel, status: isError ? tr('common:upload_failed') : isUploading ? tr('common:uploading') : ''})}
              >
                <AttachmentThumb src={src} />
                {isUploading && (
                  <div
                    aria-hidden="true"
                    className="aui-attachment-tile-uploading bg-background/60 absolute inset-0 flex items-center justify-center motion-reduce:animate-none"
                  >
                    <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
                  </div>
                )}
                {isError && (
                  <div
                    aria-hidden="true"
                    className="aui-attachment-tile-error bg-background/70 absolute inset-0 flex items-center justify-center motion-reduce:animate-none"
                  >
                    <AlertCircleIcon className="text-destructive size-4" />
                  </div>
                )}
              </div>

          </AttachmentPreviewDialog>
          {isComposer && <AttachmentRemove name={name} />}
        </AttachmentPrimitive.Root>
    </Tooltip>
  );
};

const AttachmentRemove: FC<{ name: string }> = ({ name }) => {
  useTranslation();
  return (
    <AttachmentPrimitive.Remove asChild>
      <TooltipIconButton
        tooltip={tr('common:remove_name',{name})}
        className="aui-attachment-tile-remove absolute end-1 top-1 size-5 rounded-full bg-surface! text-foreground after:absolute after:-inset-1.5 hover:bg-muted! active:scale-[0.97] motion-reduce:transition-none"
        side="top"
      >
        <XIcon className="aui-attachment-remove-icon size-3 stroke-[2.5]" />
      </TooltipIconButton>
    </AttachmentPrimitive.Remove>
  );
};

export const UserMessageAttachments: FC = () => {
  useTranslation();
  return (
    <div className="aui-user-message-attachments-end col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2 empty:hidden">
      <MessagePrimitive.Attachments>
        {() => <AttachmentUI />}
      </MessagePrimitive.Attachments>
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  useTranslation();
  return (
    <div className="aui-composer-attachments flex w-full flex-row items-center gap-2 overflow-x-auto empty:hidden">
      <ComposerPrimitive.Attachments>
        {() => <AttachmentUI />}
      </ComposerPrimitive.Attachments>
    </div>
  );
};

export const ComposerAddAttachment: FC = () => {
  useTranslation();
  return (
    <ComposerPrimitive.AddAttachment asChild>
      <TooltipIconButton
        tooltip={tr('common:add_attachment')}
        side="bottom"
        variant="ghost"
        size="icon"
        className="aui-composer-add-attachment text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30 size-7 rounded-full active:scale-[0.97] motion-reduce:transition-none"
        aria-label={tr('common:add_attachment')}
      >
        <PlusIcon className="aui-attachment-add-icon size-4" />
      </TooltipIconButton>
    </ComposerPrimitive.AddAttachment>
  );
};
