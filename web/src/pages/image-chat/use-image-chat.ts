import localforage from "localforage";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useState } from "react";

import { resolveImageUrl, type UploadedImage } from "@/services/image-storage";

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
};

export type ImageChatSession = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: ImageChatMessage[];
};

type StoredChatState = {
    version: 1;
    activeSessionId: string;
    sessions: ImageChatSession[];
};

const CHAT_STATE_KEY = "image-chat-state";
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
        session.messages.map(async (message) => ({
            ...message,
            status: message.status === "pending" ? ("error" as const) : message.status,
            image: message.image ? { ...message.image, url: await resolveImageUrl(message.image.storageKey, message.image.url) } : undefined,
        })),
    );
    return { ...session, messages };
}

function serializeSessions(sessions: ImageChatSession[]) {
    return sessions.map((session) => ({
        ...session,
        messages: session.messages.map((message) => ({
            ...message,
            image: message.image ? { ...message.image, url: message.image.storageKey ? "" : message.image.url } : undefined,
        })),
    }));
}

export function useImageChatHistory() {
    const [initialSession] = useState(createSession);
    const [sessions, setSessions] = useState<ImageChatSession[]>([initialSession]);
    const [activeSessionId, setActiveSessionId] = useState(initialSession.id);
    const [hydrated, setHydrated] = useState(false);
    const activeSession = useMemo(() => sessions.find((session) => session.id === activeSessionId) || sessions[0], [activeSessionId, sessions]);

    useEffect(() => {
        let canceled = false;
        void chatStore
            .getItem<StoredChatState>(CHAT_STATE_KEY)
            .then(async (stored) => {
                if (!stored || stored.version !== 1 || !stored.sessions.length) {
                    if (!canceled) setHydrated(true);
                    return;
                }
                const nextSessions = await Promise.all(stored.sessions.map(hydrateSession));
                if (canceled) return;
                setSessions(nextSessions);
                setActiveSessionId(nextSessions.some((session) => session.id === stored.activeSessionId) ? stored.activeSessionId : nextSessions[0].id);
                setHydrated(true);
            })
            .catch(() => {
                if (!canceled) setHydrated(true);
            });
        return () => {
            canceled = true;
        };
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        const timer = window.setTimeout(() => {
            void chatStore.setItem<StoredChatState>(CHAT_STATE_KEY, { version: 1, activeSessionId, sessions: serializeSessions(sessions) });
        }, 120);
        return () => window.clearTimeout(timer);
    }, [activeSessionId, hydrated, sessions]);

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

    const beginGeneration = (sessionId: string, prompt: string, model: string) => {
        const userMessage: ImageChatMessage = { id: nanoid(), role: "user", content: prompt, createdAt: Date.now() };
        const assistantMessage: ImageChatMessage = { id: nanoid(), role: "assistant", content: "", createdAt: Date.now(), status: "pending", model };
        setSessions((value) =>
            updateSession(value, sessionId, (session) => ({
                ...session,
                title: session.title || prompt.slice(0, 28),
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
