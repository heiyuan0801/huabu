import localforage from "localforage";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useState } from "react";

import { resolveImageUrl, type UploadedImage } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

import type { ImageChatSkillId } from "./image-chat-skills";

export type ImageChatImage = Omit<UploadedImage, "storageKey"> & { storageKey?: string };

export type ImageChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: number;
    status?: "pending" | "success" | "error";
    error?: string;
    model?: string;
    durationMs?: number;
    image?: ImageChatImage;
    references?: ReferenceImage[];
    skillId?: ImageChatSkillId;
    requestPrompt?: string;
};

export type ImageChatSession = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: ImageChatMessage[];
};

type StoredChatStateV1 = {
    version: 1;
    activeSessionId: string;
    sessions: ImageChatSession[];
};

type StoredChatState = Omit<StoredChatStateV1, "version"> & { version: 2 };

const CHAT_STATE_KEY = "image-chat-state";
const CHAT_STATE_V1_BACKUP_KEY = "image-chat-state-backup-v1";
const chatStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_chat" });

function createSession(): ImageChatSession {
    const now = Date.now();
    return { id: nanoid(), title: "", createdAt: now, updatedAt: now, messages: [] };
}

function updateSession(sessions: ImageChatSession[], id: string, updater: (session: ImageChatSession) => ImageChatSession) {
    const current = sessions.find((session) => session.id === id);
    if (!current) return sessions;
    const updated = { ...updater(current), updatedAt: Date.now() };
    return [updated, ...sessions.filter((session) => session.id !== id)];
}

async function hydrateSession(session: ImageChatSession): Promise<ImageChatSession> {
    const messages = await Promise.all(
        session.messages.map(async (message) => {
            const references = await Promise.all((message.references || []).map(async (reference) => ({ ...reference, dataUrl: await resolveImageUrl(reference.storageKey, reference.dataUrl) })));
            return {
                ...message,
                status: message.status === "pending" ? ("error" as const) : message.status,
                image: message.image ? { ...message.image, url: await resolveImageUrl(message.image.storageKey, message.image.url) } : undefined,
                references,
            };
        }),
    );
    return { ...session, messages };
}

function serializeSessions(sessions: ImageChatSession[]) {
    return sessions.map((session) => ({
        ...session,
        messages: session.messages.map((message) => ({
            ...message,
            image: message.image ? { ...message.image, url: message.image.storageKey ? "" : message.image.url } : undefined,
            references: message.references?.map((reference) => ({ ...reference, dataUrl: reference.storageKey ? "" : reference.dataUrl })),
        })),
    }));
}

export function useImageChatHistory() {
    const [initialSession] = useState(createSession);
    const [sessions, setSessions] = useState<ImageChatSession[]>([initialSession]);
    const [activeSessionId, setActiveSessionId] = useState(initialSession.id);
    const [hydrated, setHydrated] = useState(false);
    const [canPersist, setCanPersist] = useState(true);
    const activeSession = useMemo(() => sessions.find((session) => session.id === activeSessionId) || sessions[0], [activeSessionId, sessions]);

    useEffect(() => {
        let canceled = false;
        void chatStore
            .getItem<StoredChatState | StoredChatStateV1>(CHAT_STATE_KEY)
            .then(async (stored) => {
                if (!stored) {
                    if (!canceled) setHydrated(true);
                    return;
                }
                if ((stored.version !== 1 && stored.version !== 2) || !Array.isArray(stored.sessions) || !stored.sessions.length) {
                    if (!canceled) {
                        setCanPersist(false);
                        setHydrated(true);
                    }
                    return;
                }
                if (stored.version === 1) {
                    const backup = await chatStore.getItem<StoredChatStateV1>(CHAT_STATE_V1_BACKUP_KEY);
                    if (backup && JSON.stringify(backup) !== JSON.stringify(stored)) {
                        if (!canceled) {
                            setCanPersist(false);
                            setHydrated(true);
                        }
                        return;
                    }
                    if (!backup) await chatStore.setItem(CHAT_STATE_V1_BACKUP_KEY, stored);
                }
                const nextSessions = await Promise.all(stored.sessions.map(hydrateSession));
                if (canceled) return;
                setSessions(nextSessions);
                setActiveSessionId(nextSessions.some((session) => session.id === stored.activeSessionId) ? stored.activeSessionId : nextSessions[0].id);
                setHydrated(true);
            })
            .catch(() => {
                if (!canceled) {
                    setCanPersist(false);
                    setHydrated(true);
                }
            });
        return () => {
            canceled = true;
        };
    }, []);

    useEffect(() => {
        if (!hydrated || !canPersist) return;
        const timer = window.setTimeout(() => {
            void chatStore.setItem<StoredChatState>(CHAT_STATE_KEY, { version: 2, activeSessionId, sessions: serializeSessions(sessions) });
        }, 120);
        return () => window.clearTimeout(timer);
    }, [activeSessionId, canPersist, hydrated, sessions]);

    const addSession = () => {
        const session = createSession();
        setSessions((value) => [session, ...value]);
        setActiveSessionId(session.id);
        return session.id;
    };

    const removeSession = (id: string) => {
        const remaining = sessions.filter((session) => session.id !== id);
        const nextSessions = remaining.length ? remaining : [createSession()];
        setSessions(nextSessions);
        if (activeSessionId === id) setActiveSessionId(nextSessions[0].id);
    };

    const beginGeneration = (sessionId: string, input: { displayText: string; requestPrompt: string; model: string; references?: ReferenceImage[]; skillId?: ImageChatSkillId }) => {
        const references = input.references || [];
        const userMessage: ImageChatMessage = { id: nanoid(), role: "user", content: input.displayText, createdAt: Date.now(), references, skillId: input.skillId };
        const assistantMessage: ImageChatMessage = { id: nanoid(), role: "assistant", content: "", createdAt: Date.now(), status: "pending", model: input.model, references, skillId: input.skillId, requestPrompt: input.requestPrompt };
        setSessions((value) =>
            updateSession(value, sessionId, (session) => ({
                ...session,
                title: session.title || input.displayText.slice(0, 28),
                messages: [...session.messages, userMessage, assistantMessage],
            })),
        );
        return assistantMessage.id;
    };

    const finishGeneration = (sessionId: string, messageId: string, patch: Partial<ImageChatMessage>) => {
        setSessions((value) =>
            updateSession(value, sessionId, (session) => ({
                ...session,
                messages: session.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
            })),
        );
    };

    return {
        activeSession,
        activeSessionId,
        sessions,
        hydrated,
        addSession,
        removeSession,
        selectSession: setActiveSessionId,
        beginGeneration,
        finishGeneration,
    };
}
