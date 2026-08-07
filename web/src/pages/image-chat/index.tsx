import { App, Button, Drawer, Dropdown, Image, Input, Tooltip } from "antd";
import { ArrowUp, Check, Copy, Download, Ellipsis, LoaderCircle, Menu, MessageSquarePlus, RefreshCw, Search, Square, Trash2, WandSparkles } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { ImageGenerationPlaceholder } from "@/components/image-generation-placeholder";
import { useCopyText } from "@/hooks/use-copy-text";
import { formatDuration, getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import { requestGeneration, requestImageQuestion } from "@/services/api/image";
import { saveImageGenerationLog } from "@/services/image-generation-log";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { modelOptionLabel, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";

import { type ImageChatImage, type ImageChatMessage, type ImageChatSession, useImageChatHistory } from "./use-image-chat";

export default function ImageChatPage() {
    const { message, modal } = App.useApp();
    const { t, i18n } = useTranslation();
    const copyText = useCopyText();
    const effectiveConfig = useEffectiveConfig();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const history = useImageChatHistory();
    const [prompt, setPrompt] = useState("");
    const [historyOpen, setHistoryOpen] = useState(false);
    const [runningMessageId, setRunningMessageId] = useState<string | null>(null);
    const [polishing, setPolishing] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const polishAbortRef = useRef<AbortController | null>(null);
    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const textModel = effectiveConfig.textModel || effectiveConfig.model;
    const activeMessages = history.activeSession?.messages || [];

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end" });
    }, [activeMessages.length, activeMessages.at(-1)?.status]);

    useEffect(
        () => () => {
            abortRef.current?.abort();
            polishAbortRef.current?.abort();
        },
        [],
    );

    const runGeneration = async (sessionId: string, assistantMessageId: string, text: string, targetModel: string) => {
        const controller = new AbortController();
        const startedAt = performance.now();
        abortRef.current = controller;
        setRunningMessageId(assistantMessageId);

        try {
            const images = await requestGeneration({ ...effectiveConfig, model: targetModel, count: "1" }, text, { signal: controller.signal });
            const result = images[0];
            if (!result) throw new Error(t("imageChat.missingResult"));
            const durationMs = performance.now() - startedAt;
            const meta = await readImageMeta(result.dataUrl);
            let image: ImageChatImage = { url: result.dataUrl, width: meta.width, height: meta.height, bytes: getDataUrlByteSize(result.dataUrl), mimeType: meta.mimeType };
            history.finishGeneration(sessionId, assistantMessageId, { status: "success", image, durationMs, error: undefined });
            try {
                image = await uploadImage(result.dataUrl);
                history.finishGeneration(sessionId, assistantMessageId, { image });
            } catch {
                // Remote images may be viewable but blocked from being fetched into IndexedDB by CORS.
            }
            addAsset({
                kind: "image",
                title: text.slice(0, 24) || t("imageChat.generatedImage"),
                coverUrl: image.url,
                tags: [],
                source: t("imageChat.title"),
                data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType },
                metadata: { source: "image-chat", prompt: text, model: targetModel },
            });
            try {
                await saveImageGenerationLog({ prompt: text, model: targetModel, config: effectiveConfig, references: [], durationMs, requestedCount: 1, images: [{ image, durationMs }] });
            } catch {
                message.warning(t("imageChat.historySaveFailed"));
            }
        } catch (error) {
            history.finishGeneration(sessionId, assistantMessageId, { status: "error", durationMs: performance.now() - startedAt, error: error instanceof Error ? error.message : t("imageChat.generationFailed") });
        } finally {
            abortRef.current = null;
            setRunningMessageId(null);
        }
    };

    const generate = async (value = prompt, sessionId = history.activeSession?.id) => {
        const text = value.trim();
        if (!text || !sessionId || runningMessageId || polishing) return;
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("imageChat.configRequired"));
            openConfigDialog(true);
            return;
        }

        const assistantMessageId = history.beginGeneration(sessionId, text, model);
        setPrompt("");
        await runGeneration(sessionId, assistantMessageId, text, model);
    };

    const retryGeneration = async (item: ImageChatMessage, text: string) => {
        const sessionId = history.activeSession?.id;
        if (!sessionId || runningMessageId || polishing) return;
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("imageChat.configRequired"));
            openConfigDialog(true);
            return;
        }
        history.finishGeneration(sessionId, item.id, { status: "pending", model, image: undefined, error: undefined, durationMs: undefined, createdAt: Date.now() });
        await runGeneration(sessionId, item.id, text, model);
    };

    const polishAndGenerate = async () => {
        const text = prompt.trim();
        const sessionId = history.activeSession?.id;
        if (!text || !sessionId || polishing || runningMessageId) return;
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("imageChat.configRequired"));
            openConfigDialog(true);
            return;
        }
        if (!isAiConfigReady(effectiveConfig, textModel)) {
            message.warning(t("imageChat.textConfigRequired"));
            openConfigDialog(true);
            return;
        }
        const controller = new AbortController();
        polishAbortRef.current = controller;
        setPolishing(true);
        try {
            const polished = (
                await requestImageQuestion(
                    { ...effectiveConfig, model: textModel },
                    [
                        { role: "system", content: t("imageChat.polishInstruction") },
                        { role: "user", content: text },
                    ],
                    () => {},
                    { signal: controller.signal },
                )
            ).trim();
            if (!polished) throw new Error(t("imageChat.polishEmpty"));
            setPrompt(polished);
            setPolishing(false);
            await generate(polished, sessionId);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("imageChat.polishFailed"));
        } finally {
            polishAbortRef.current = null;
            setPolishing(false);
        }
    };

    const deleteSession = (session: ImageChatSession) => {
        modal.confirm({
            title: t("imageChat.deleteTitle"),
            content: t("imageChat.deleteConfirm", { name: session.title || t("imageChat.untitled") }),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: () => history.removeSession(session.id),
        });
    };

    const sidebar = (
        <ConversationSidebar
            sessions={history.sessions}
            activeSessionId={history.activeSessionId}
            locale={i18n.language}
            onCreate={() => {
                history.addSession();
                setHistoryOpen(false);
            }}
            onSelect={(id) => {
                history.selectSession(id);
                setHistoryOpen(false);
            }}
            onDelete={deleteSession}
        />
    );

    return (
        <div className="flex h-full min-h-0 bg-background text-foreground">
            <aside className="hidden w-[284px] shrink-0 border-r border-border bg-muted/25 lg:flex">{sidebar}</aside>
            <Drawer title={t("imageChat.history")} placement="left" size={284} open={historyOpen} onClose={() => setHistoryOpen(false)} className="lg:hidden" styles={{ body: { padding: 0 } }}>
                {sidebar}
            </Drawer>

            <section className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:px-6">
                    <div className="flex min-w-0 items-center gap-2">
                        <Tooltip title={t("imageChat.history")}>
                            <Button type="text" className="lg:!hidden" icon={<Menu className="size-4" />} onClick={() => setHistoryOpen(true)} aria-label={t("imageChat.history")} />
                        </Tooltip>
                        <h1 className="truncate text-base font-semibold">{history.activeSession?.title || t("imageChat.title")}</h1>
                    </div>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">{modelOptionLabel(config, model)}</span>
                </header>

                <main className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
                    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col py-8 md:py-10">
                        {activeMessages.length ? (
                            <div className="space-y-8">
                                {activeMessages.map((item, index) => {
                                    const promptText = item.role === "assistant" ? findPreviousPrompt(activeMessages, index) : item.content;
                                    return item.role === "user" ? (
                                        <UserMessage key={item.id} content={item.content} onCopy={() => copyText(item.content)} />
                                    ) : (
                                        <AssistantMessage
                                            key={item.id}
                                            item={item}
                                            modelLabel={item.model ? modelOptionLabel(config, item.model) : ""}
                                            prompt={promptText}
                                            onDownload={() => item.image && saveAs(item.image.url, `image-chat-${item.id}.png`)}
                                            onRetry={() => void retryGeneration(item, promptText)}
                                        />
                                    );
                                })}
                                <div ref={endRef} />
                            </div>
                        ) : (
                            <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
                                <span
                                    className="mb-5 size-11 bg-foreground"
                                    style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }}
                                />
                                <h2 className="text-xl font-semibold">{t("imageChat.emptyTitle")}</h2>
                                <p className="mt-2 text-sm text-muted-foreground">{t("imageChat.emptySubtitle")}</p>
                            </div>
                        )}
                    </div>
                </main>

                <footer className="shrink-0 border-t border-border bg-background px-3 py-3 md:px-6 md:py-4">
                    <div className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-2 shadow-sm">
                        <Input.TextArea
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key !== "Enter" || event.shiftKey) return;
                                event.preventDefault();
                                void generate();
                            }}
                            autoSize={{ minRows: 1, maxRows: 5 }}
                            variant="borderless"
                            placeholder={t("imageChat.placeholder")}
                            className="!resize-none !px-2 !py-2 !text-[15px]"
                        />
                        <div className="mt-1 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1">
                                <ModelPicker
                                    config={config}
                                    value={model}
                                    capability="image"
                                    onChange={(value) => updateConfig("imageModel", value)}
                                    onMissingConfig={() => openConfigDialog(true)}
                                    className="h-8 max-w-[220px] rounded-md border-0 px-2 shadow-none"
                                />
                                <Tooltip title={t("imageChat.polishDescription", { model: modelOptionLabel(config, textModel) })}>
                                    <Button type="text" size="small" loading={polishing} disabled={!prompt.trim() || Boolean(runningMessageId)} icon={<WandSparkles className="size-4" />} onClick={() => void polishAndGenerate()} aria-label={t("imageChat.polishAndGenerate")}>
                                        <span className="hidden sm:inline">{t("imageChat.polishAndGenerate")}</span>
                                    </Button>
                                </Tooltip>
                            </div>
                            {runningMessageId ? (
                                <Tooltip title={t("imageChat.stop")}>
                                    <Button shape="circle" type="primary" icon={<Square className="size-3.5 fill-current" />} onClick={() => abortRef.current?.abort()} aria-label={t("imageChat.stop")} />
                                </Tooltip>
                            ) : (
                                <Tooltip title={t("imageChat.send")}>
                                    <Button shape="circle" type="primary" disabled={!prompt.trim() || polishing} icon={<ArrowUp className="size-4" />} onClick={() => void generate()} aria-label={t("imageChat.send")} />
                                </Tooltip>
                            )}
                        </div>
                    </div>
                </footer>
            </section>
        </div>
    );
}

function ConversationSidebar({ sessions, activeSessionId, locale, onCreate, onSelect, onDelete }: { sessions: ImageChatSession[]; activeSessionId: string; locale: string; onCreate: () => void; onSelect: (id: string) => void; onDelete: (session: ImageChatSession) => void }) {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query.trim().toLowerCase());
    const visibleSessions = useMemo(() => sessions.filter((session) => !deferredQuery || session.title.toLowerCase().includes(deferredQuery) || session.messages.some((item) => item.content.toLowerCase().includes(deferredQuery))), [deferredQuery, sessions]);

    return (
        <div className="flex h-full min-h-0 w-full flex-col p-3">
            <Button block icon={<MessageSquarePlus className="size-4" />} onClick={onCreate} className="!h-10 !justify-start">
                {t("imageChat.newChat")}
            </Button>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Search className="size-4 text-muted-foreground" />} placeholder={t("imageChat.search")} allowClear className="mt-3" />
            <div className="mt-5 px-2 text-xs font-medium text-muted-foreground">{t("imageChat.recent")}</div>
            <div className="thin-scrollbar mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
                {visibleSessions.map((session) => (
                    <div key={session.id} className={cn("group flex items-center rounded-md", session.id === activeSessionId ? "bg-foreground/10" : "hover:bg-foreground/5")}>
                        <button type="button" className="min-w-0 flex-1 px-2 py-2 text-left" onClick={() => onSelect(session.id)}>
                            <div className="truncate text-sm font-medium">{session.title || t("imageChat.untitled")}</div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">{formatChatTime(session.updatedAt, locale)}</div>
                        </button>
                        <Dropdown
                            trigger={["click"]}
                            menu={{ items: [{ key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: t("common.delete") }], onClick: () => onDelete(session) }}
                        >
                            <Button type="text" size="small" className="mr-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100" icon={<Ellipsis className="size-4" />} aria-label={t("common.details")} />
                        </Dropdown>
                    </div>
                ))}
                {!visibleSessions.length ? <div className="px-2 py-8 text-center text-sm text-muted-foreground">{t("imageChat.noHistory")}</div> : null}
            </div>
        </div>
    );
}

function UserMessage({ content, onCopy }: { content: string; onCopy: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="group flex justify-end">
            <div className="max-w-[85%] sm:max-w-[72%]">
                <div className="whitespace-pre-wrap rounded-lg bg-muted px-4 py-3 text-[15px] leading-6">{content}</div>
                <div className="mt-1 flex justify-end opacity-0 transition group-hover:opacity-100">
                    <Tooltip title={t("common.copy")}>
                        <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={onCopy} aria-label={t("common.copy")} />
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

function AssistantMessage({ item, modelLabel, prompt, onDownload, onRetry }: { item: ImageChatMessage; modelLabel: string; prompt: string; onDownload: () => void; onRetry: () => void }) {
    const { t } = useTranslation();
    if (item.status === "pending") {
        return (
            <div className="max-w-xl">
                <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                        <LoaderCircle className="size-4 animate-spin" />
                        {t("imageChat.generating")}
                    </span>
                    <GenerationElapsed startedAt={item.createdAt} />
                </div>
                <div className="aspect-square w-full max-w-[520px] overflow-hidden rounded-lg border border-border">
                    <ImageGenerationPlaceholder />
                </div>
            </div>
        );
    }
    if (item.status === "error" || !item.image) {
        return (
            <div className="max-w-xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
                <div className="font-medium">{t("imageChat.generationFailed")}</div>
                <div className="mt-1 break-words text-xs opacity-80">{item.error || t("imageChat.interrupted")}</div>
                <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs opacity-70">{item.durationMs === undefined ? null : t("imageChat.duration", { time: formatDuration(item.durationMs) })}</span>
                    <Button type="text" size="small" danger icon={<RefreshCw className="size-4" />} onClick={onRetry}>
                        {t("imageChat.retry")}
                    </Button>
                </div>
            </div>
        );
    }
    return (
        <div className="max-w-xl">
            <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                    <Check className="size-4" />
                    {t("imageChat.generated")}
                </span>
                <span className="truncate text-xs text-muted-foreground">{[modelLabel, item.durationMs === undefined ? "" : t("imageChat.duration", { time: formatDuration(item.durationMs) })].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                <Image width="100%" src={item.image.url} alt={prompt} className="block max-h-[620px] w-full object-contain" />
            </div>
            <div className="mt-2 flex items-center gap-1">
                <Tooltip title={t("common.download")}>
                    <Button type="text" icon={<Download className="size-4" />} onClick={onDownload} aria-label={t("common.download")} />
                </Tooltip>
            </div>
        </div>
    );
}

function GenerationElapsed({ startedAt }: { startedAt: number }) {
    const { t } = useTranslation();
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    return <span className="text-xs text-muted-foreground">{t("imageChat.elapsed", { time: formatDuration(now - startedAt) })}</span>;
}

function findPreviousPrompt(messages: ImageChatMessage[], index: number) {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (messages[cursor].role === "user") return messages[cursor].content;
    }
    return "";
}

function formatChatTime(value: number, locale: string) {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
}
